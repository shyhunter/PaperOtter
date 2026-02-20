import { useState, useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import { Toaster } from '@/components/ui/sonner';
import { LandingCard } from '@/components/LandingCard';
import { StepBar } from '@/components/StepBar';
import { ConfigureStep } from '@/components/ConfigureStep';
import { CompareStep } from '@/components/CompareStep';
import { SaveStep } from '@/components/SaveStep';
import { ImageConfigureStep } from '@/components/ImageConfigureStep';
import { useFileDrop } from '@/hooks/useFileDrop';
import { openFilePicker } from '@/hooks/useFileOpen';
import { detectFormat, getFileName } from '@/lib/fileValidation';
import { usePdfProcessor } from '@/hooks/usePdfProcessor';
import { useImageProcessor } from '@/hooks/useImageProcessor';
import { Button } from '@/components/ui/button';
import type { FileEntry, AppStep, PdfProcessingOptions, ImageProcessingOptions, ImageOutputFormat } from '@/types/file';

function detectImageFormat(filePath: string): ImageOutputFormat {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'png') return 'png';
  if (ext === 'webp') return 'webp';
  return 'jpeg'; // jpg and jpeg both map to 'jpeg'
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(2)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
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

  const pdfProcessor = usePdfProcessor();
  const imageProcessor = useImageProcessor();

  // Reset everything and go back to landing
  const handleStartOver = useCallback(() => {
    setFileEntry(null);
    setCurrentStep(0);
    setSourcePdfPageCount(1);
    setSourcePdfFileSizeBytes(0);
    pdfProcessor.reset();
    imageProcessor.reset();
  }, [pdfProcessor, imageProcessor]);

  // Called when a file is confirmed (from picker or drop)
  const handleFileSelected = useCallback((filePath: string) => {
    if (!filePath) {
      toast.error('Unsupported file type', {
        description: 'Please open a PDF, JPG, PNG, or WebP file.',
      });
      return;
    }

    const format = detectFormat(filePath);
    if (!format) {
      toast.error('Unsupported file type', {
        description: 'Please open a PDF, JPG, PNG, or WebP file.',
      });
      return;
    }

    setIsLoading(true);
    setTimeout(() => {
      setFileEntry({ path: filePath, format, name: getFileName(filePath) });
      setIsLoading(false);
      setCurrentStep(1);
    }, 600);
  }, []);

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

  // Advance to Compare step when image processing completes with a result
  useEffect(() => {
    if (imageProcessor.result && currentStep === 1) {
      setCurrentStep(2);
    }
  }, [imageProcessor.result, currentStep]);

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
      pdfProcessor.run(fileEntry.path, options);
    },
    [fileEntry, pdfProcessor],
  );

  const handleGenerateImagePreview = useCallback(
    (options: ImageProcessingOptions) => {
      if (!fileEntry) return;
      imageProcessor.run(fileEntry.path, options);
    },
    [fileEntry, imageProcessor],
  );

  const handleSave = useCallback(() => {
    // Advance to Save step — implemented in plan 02-03
    setCurrentStep(3);
  }, []);

  const handleBackFromCompare = useCallback(() => {
    setCurrentStep(1);
    pdfProcessor.reset();
  }, [pdfProcessor]);

  const handleBackFromConfigure = useCallback(() => {
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

      {/* Step 2: Compare — image (placeholder, wired in 03-03) */}
      {currentStep === 2 && imageProcessor.result && fileEntry?.format === 'image' && (
        <div className="flex flex-1 items-center justify-center p-6">
          <div className="text-center space-y-3">
            <p className="text-sm font-medium text-foreground">
              Processed: {formatBytes(imageProcessor.result.outputSizeBytes)}
            </p>
            <p className="text-xs text-muted-foreground">
              Full compare view coming in 03-03.
            </p>
            <Button size="sm" onClick={() => { setCurrentStep(1); imageProcessor.reset(); }}>
              Back
            </Button>
          </div>
        </div>
      )}

      {/* Step 2: Compare — PDF */}
      {currentStep === 2 && pdfProcessor.result && (
        <CompareStep
          result={pdfProcessor.result}
          onSave={handleSave}
          onBack={handleBackFromCompare}
          onStartOver={handleStartOver}
        />
      )}

      {/* Step 3: Save */}
      {currentStep === 3 && pdfProcessor.result && fileEntry && (
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

      <Toaster position="bottom-center" />
    </div>
  );
}

export default App;
