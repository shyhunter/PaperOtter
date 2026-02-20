import { useState, useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import { Toaster } from '@/components/ui/sonner';
import { LandingCard } from '@/components/LandingCard';
import { StepBar } from '@/components/StepBar';
import { ConfigureStep } from '@/components/ConfigureStep';
import { CompareStep } from '@/components/CompareStep';
import { useFileDrop } from '@/hooks/useFileDrop';
import { openFilePicker } from '@/hooks/useFileOpen';
import { detectFormat, getFileName } from '@/lib/fileValidation';
import { usePdfProcessor } from '@/hooks/usePdfProcessor';
import type { FileEntry, AppStep, PdfProcessingOptions } from '@/types/file';

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

  // Reset everything and go back to landing
  const handleStartOver = useCallback(() => {
    setFileEntry(null);
    setCurrentStep(0);
    setSourcePdfPageCount(1);
    setSourcePdfFileSizeBytes(0);
    pdfProcessor.reset();
  }, [pdfProcessor]);

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

  // Advance to Compare step when processing completes with a result
  useEffect(() => {
    if (pdfProcessor.result && currentStep === 1) {
      setCurrentStep(2);
    }
  }, [pdfProcessor.result, currentStep]);

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
  }, [pdfProcessor]);

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

      {/* Step 1: Configure — image (Phase 3 placeholder) */}
      {currentStep === 1 && fileEntry?.format === 'image' && (
        <div className="flex flex-1 items-center justify-center p-6">
          <div className="text-center">
            <p className="text-sm font-medium text-foreground">{fileEntry.name}</p>
            <p className="text-xs text-muted-foreground mt-1">Image processing coming in Phase 3.</p>
            <button
              type="button"
              onClick={handleBackFromConfigure}
              className="mt-4 text-xs text-primary underline"
            >
              Back
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Compare */}
      {currentStep === 2 && pdfProcessor.result && (
        <CompareStep
          result={pdfProcessor.result}
          onSave={handleSave}
          onBack={handleBackFromCompare}
          onStartOver={handleStartOver}
        />
      )}

      {/* Step 3: Save — placeholder until plan 02-03 */}
      {currentStep === 3 && pdfProcessor.result && (
        <div className="flex flex-1 items-center justify-center p-6">
          <div className="text-center">
            <p className="text-sm font-medium text-foreground">Save step — coming in plan 02-03</p>
            <button
              type="button"
              onClick={() => setCurrentStep(2)}
              className="mt-4 text-xs text-primary underline"
            >
              Back to Compare
            </button>
          </div>
        </div>
      )}

      <Toaster position="bottom-center" />
    </div>
  );
}

export default App;
