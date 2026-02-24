import { useState, useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { Toaster } from '@/components/ui/sonner';
import { LandingCard } from '@/components/LandingCard';
import { StepBar } from '@/components/StepBar';
import { ConfigureStep } from '@/components/ConfigureStep';
import { CompareStep } from '@/components/CompareStep';
import { SaveStep } from '@/components/SaveStep';
import { ImageConfigureStep } from '@/components/ImageConfigureStep';
import { ImageCompareStep } from '@/components/ImageCompareStep';
import { useFileDrop } from '@/hooks/useFileDrop';
import { openFilePicker } from '@/hooks/useFileOpen';
import { detectFormat, getFileName, getFileSizeBytes, FILE_SIZE_LIMIT_BYTES } from '@/lib/fileValidation';
import { usePdfProcessor } from '@/hooks/usePdfProcessor';
import { useImageProcessor } from '@/hooks/useImageProcessor';
import { useRecentDirs } from '@/hooks/useRecentDirs';
import { PrivacyFooter } from '@/components/PrivacyFooter';
import type { FileEntry, AppStep, PdfProcessingOptions, PdfQualityLevel, ImageProcessingOptions, ImageOutputFormat } from '@/types/file';

function detectImageFormat(filePath: string): ImageOutputFormat {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'png') return 'png';
  if (ext === 'webp') return 'webp';
  return 'jpeg'; // jpg and jpeg both map to 'jpeg'
}

function buildImageSaveFileName(sourceFileName: string, outputFormat: ImageOutputFormat): string {
  const base = sourceFileName.replace(/\.(jpe?g|png|webp)$/i, '');
  const ext = outputFormat === 'jpeg' ? 'jpg' : outputFormat;
  return `${base}-processed.${ext}`;
}

function buildImageSaveFilters(outputFormat: ImageOutputFormat): Array<{ name: string; extensions: string[] }> {
  switch (outputFormat) {
    case 'jpeg': return [{ name: 'JPEG Image', extensions: ['jpg', 'jpeg'] }];
    case 'png':  return [{ name: 'PNG Image',  extensions: ['png'] }];
    case 'webp': return [{ name: 'WebP Image', extensions: ['webp'] }];
  }
}

// Lazily load pdf-lib only when needed (avoids parsing the full lib on startup)
async function getPdfMeta(filePath: string): Promise<{ pageCount: number; fileSizeBytes: number }> {
  const { readFile } = await import('@tauri-apps/plugin-fs');
  const { PDFDocument } = await import('pdf-lib');
  const bytes = await readFile(filePath);
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  return { pageCount: doc.getPageCount(), fileSizeBytes: bytes.byteLength };
}

function App() {
  const [fileEntry, setFileEntry] = useState<FileEntry | null>(null);
  const [currentStep, setCurrentStep] = useState<AppStep>(0);
  const [isLoading, setIsLoading] = useState(false);
  const [sourcePdfPageCount, setSourcePdfPageCount] = useState<number>(1);
  const [sourcePdfFileSizeBytes, setSourcePdfFileSizeBytes] = useState<number>(0);
  const [lastPdfQualityLevel, setLastPdfQualityLevel] = useState<PdfQualityLevel>('screen');

  const pdfProcessor = usePdfProcessor();
  const imageProcessor = useImageProcessor();
  const { dirs: recentDirs, addDir: addRecentDir } = useRecentDirs();

  const [invalidDropError, setInvalidDropError] = useState<string | null>(null);
  const [emptyFileError, setEmptyFileError] = useState<string | null>(null);
  const [corruptFileError, setCorruptFileError] = useState<string | null>(null);
  const [fileSizeLimitBytes, setFileSizeLimitBytes] = useState<number | null>(null);

  // Suppress auto-advance to Compare when navigating Back from Compare.
  // Set to true when Back is clicked; cleared when processing starts again.
  const suppressImageAdvance = useRef(false);

  // Reset everything and go back to landing
  const handleStartOver = useCallback(() => {
    suppressImageAdvance.current = false;
    setFileEntry(null);
    setCurrentStep(0);
    setSourcePdfPageCount(1);
    setSourcePdfFileSizeBytes(0);
    pdfProcessor.reset();
    imageProcessor.reset();
  }, [pdfProcessor, imageProcessor]);

  // Called when a file is confirmed (from picker or drop)
  const handleFileSelected = useCallback(async (filePath: string) => {
    if (!filePath) {
      setInvalidDropError('Unsupported file type — please use PDF, JPG, PNG, or WebP.');
      setTimeout(() => setInvalidDropError(null), 2500);
      return;
    }

    const format = detectFormat(filePath);
    if (!format) {
      setInvalidDropError('Unsupported file type — please use PDF, JPG, PNG, or WebP.');
      setTimeout(() => setInvalidDropError(null), 2500);
      return;
    }

    // Check file size before loading
    let sizeBytes: number;
    try {
      sizeBytes = await getFileSizeBytes(filePath);
    } catch {
      // Could not read the file at all — treat as corrupt
      setCorruptFileError('This file appears to be corrupt. Please try a different file.');
      setTimeout(() => setCorruptFileError(null), 2500);
      return;
    }

    if (sizeBytes === 0) {
      setEmptyFileError('This file is empty. Please try a different file.');
      setTimeout(() => setEmptyFileError(null), 2500);
      return;
    }

    if (sizeBytes > FILE_SIZE_LIMIT_BYTES) {
      setFileSizeLimitBytes(sizeBytes);
      return;
    }

    setIsLoading(true);
    setTimeout(() => {
      setFileEntry({ path: filePath, format, name: getFileName(filePath) });
      addRecentDir(filePath); // persist directory for next session
      setIsLoading(false);
      setCurrentStep(1);
    }, 600);
  }, [addRecentDir]);

  // Load source PDF page count and file size when a PDF is selected
  useEffect(() => {
    if (fileEntry?.format === 'pdf') {
      getPdfMeta(fileEntry.path)
        .then(({ pageCount, fileSizeBytes }) => {
          setSourcePdfPageCount(pageCount);
          setSourcePdfFileSizeBytes(fileSizeBytes);
        })
        .catch(() => setSourcePdfPageCount(1)); // fallback; will validate on processing
    }
  }, [fileEntry]);

  // Advance to Compare step when PDF processing completes with a result
  useEffect(() => {
    if (pdfProcessor.result && currentStep === 1) {
      setCurrentStep(2);
    }
  }, [pdfProcessor.result, currentStep]);

  // Advance to Compare step when image processing completes (new result) or when
  // re-processing starts with a previous result (stale overlay case).
  // suppressImageAdvance ref prevents re-advancing immediately after clicking Back.
  useEffect(() => {
    if (currentStep !== 1) return;
    if (suppressImageAdvance.current) return;
    // Advance when a new result is ready, OR when re-processing starts with a stale result
    // (isProcessing=true + result=old result → advance immediately for stale overlay).
    if (imageProcessor.result) {
      setCurrentStep(2);
    }
  }, [imageProcessor.result, imageProcessor.isProcessing, currentStep]);

  // Navigate back to landing when PDF processing fails (corrupt file)
  useEffect(() => {
    if (pdfProcessor.error && currentStep === 1 && fileEntry?.format === 'pdf') {
      handleStartOver();
      setCorruptFileError('This file appears to be corrupt. Please try a different file.');
      setTimeout(() => setCorruptFileError(null), 2500);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfProcessor.error]);

  // Navigate back to landing when image processing fails (corrupt file)
  useEffect(() => {
    if (imageProcessor.error && currentStep === 1 && fileEntry?.format === 'image') {
      handleStartOver();
      setCorruptFileError('This file appears to be corrupt. Please try a different file.');
      setTimeout(() => setCorruptFileError(null), 2500);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageProcessor.error]);

  const handleFileSizeLimitDismiss = useCallback(() => {
    setFileSizeLimitBytes(null);
  }, []);

  const dragState = useFileDrop(handleFileSelected);

  const handlePickerClick = useCallback(async () => {
    try {
      const filePath = await openFilePicker();
      if (filePath) {
        handleFileSelected(filePath);
      }
      // null = user cancelled — do nothing
    } catch {
      toast.error('Could not open file picker', {
        description: 'Please try again.',
      });
    }
  }, [handleFileSelected]);

  const handleGeneratePreview = useCallback(
    (options: Omit<PdfProcessingOptions, 'onProgress'>) => {
      if (!fileEntry) return;
      setLastPdfQualityLevel(options.qualityLevel);
      pdfProcessor.run(fileEntry.path, options);
    },
    [fileEntry, pdfProcessor],
  );

  const handleGenerateImagePreview = useCallback(
    (options: ImageProcessingOptions) => {
      if (!fileEntry) return;
      // Clear suppress flag so the advance effect triggers when isProcessing becomes true.
      suppressImageAdvance.current = false;
      imageProcessor.run(fileEntry.path, options);
    },
    [fileEntry, imageProcessor],
  );

  const handleSave = useCallback(() => {
    // Advance to Save step — implemented in plan 02-03
    setCurrentStep(3);
  }, []);

  const handleBackFromCompare = useCallback(() => {
    // Suppress auto-advance so the imageProcessor result being non-null
    // doesn't immediately re-advance back to Compare.
    suppressImageAdvance.current = true;
    setCurrentStep(1);
    pdfProcessor.reset();
    // imageProcessor is NOT reset here — the stale result is preserved so
    // when the user re-processes, ImageCompareStep shows the stale overlay.
  }, [pdfProcessor]);

  const handleBackFromConfigure = useCallback(() => {
    suppressImageAdvance.current = false;
    setCurrentStep(0);
    setFileEntry(null);
    pdfProcessor.reset();
    imageProcessor.reset();
  }, [pdfProcessor, imageProcessor]);

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <StepBar current={currentStep} />

      {/* Step 0: Landing / Pick */}
      {currentStep === 0 && (
        <LandingCard
          dragState={dragState}
          isLoading={isLoading}
          onPickerClick={handlePickerClick}
          recentDirs={recentDirs}
          onRecentDirClick={handleFileSelected}
          invalidDropError={invalidDropError}
          emptyFileError={emptyFileError}
          corruptFileError={corruptFileError}
          fileSizeLimitBytes={fileSizeLimitBytes}
          onFileSizeLimitDismiss={handleFileSizeLimitDismiss}
        />
      )}

      {/* Step 1: Configure — PDF */}
      {currentStep === 1 && fileEntry?.format === 'pdf' && (
        <ConfigureStep
          fileName={fileEntry.name}
          pageCount={sourcePdfPageCount}
          fileSizeBytes={sourcePdfFileSizeBytes}
          isProcessing={pdfProcessor.isProcessing}
          progress={pdfProcessor.progress}
          error={pdfProcessor.error}
          onGeneratePreview={handleGeneratePreview}
          onBack={handleBackFromConfigure}
        />
      )}

      {/* Step 1: Configure — image */}
      {currentStep === 1 && fileEntry?.format === 'image' && (
        <ImageConfigureStep
          fileName={fileEntry.name}
          fileSizeBytes={0}
          sourceFormat={detectImageFormat(fileEntry.path)}
          isProcessing={imageProcessor.isProcessing}
          error={imageProcessor.error}
          lastResult={imageProcessor.result}
          onGeneratePreview={handleGenerateImagePreview}
          onBack={handleBackFromConfigure}
        />
      )}

      {/* Step 2: Compare — image */}
      {currentStep === 2 && imageProcessor.result && fileEntry?.format === 'image' && (
        <ImageCompareStep
          result={imageProcessor.result}
          isProcessing={imageProcessor.isProcessing}
          onSave={handleSave}
          onBack={handleBackFromCompare}
          onStartOver={handleStartOver}
        />
      )}

      {/* Step 2: Compare — PDF */}
      {currentStep === 2 && pdfProcessor.result && (
        <CompareStep
          result={pdfProcessor.result}
          qualityLevel={lastPdfQualityLevel}
          onSave={handleSave}
          onBack={handleBackFromCompare}
          onStartOver={handleStartOver}
        />
      )}

      {/* Step 3: Save — PDF */}
      {currentStep === 3 && pdfProcessor.result && fileEntry?.format === 'pdf' && (
        <SaveStep
          processedBytes={pdfProcessor.result.bytes}
          sourceFileName={fileEntry.name}
          onSaveComplete={(savedPath) => {
            // Stay on Compare — user may inspect stats again or save to a second location
            toast.success('File saved', {
              description: savedPath,
            });
            setCurrentStep(2);
          }}
          onCancel={() => {
            // User cancelled the dialog — go back to Compare silently
            setCurrentStep(2);
          }}
          onBack={() => {
            setCurrentStep(2);
          }}
        />
      )}

      {/* Step 3: Save — image */}
      {currentStep === 3 && imageProcessor.result && fileEntry?.format === 'image' && (
        <SaveStep
          processedBytes={imageProcessor.result.bytes}
          sourceFileName={fileEntry.name}
          defaultSaveName={buildImageSaveFileName(fileEntry.name, imageProcessor.result.outputFormat)}
          saveFilters={buildImageSaveFilters(imageProcessor.result.outputFormat)}
          onSaveComplete={(savedPath) => {
            toast.success('File saved', { description: savedPath });
            setCurrentStep(2);
          }}
          onCancel={() => setCurrentStep(2)}
          onBack={() => setCurrentStep(2)}
        />
      )}

      <PrivacyFooter />
      <Toaster position="bottom-center" />
    </div>
  );
}

export default App;
