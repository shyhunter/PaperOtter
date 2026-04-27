import { useState, useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { Toaster } from '@/components/ui/sonner';
import { SplashScreen } from '@/components/SplashScreen';
import { LandingCard } from '@/components/LandingCard';
import { ToolHeader } from '@/components/ToolHeader';
import { ConfigureStep } from '@/components/ConfigureStep';
import { CompareStep } from '@/components/CompareStep';
import { SaveStep } from '@/components/SaveStep';
import { ImageConfigureStep } from '@/components/ImageConfigureStep';
import { ImageCompareStep } from '@/components/ImageCompareStep';
import { StepErrorBoundary, AppErrorBoundary } from '@/components/ErrorBoundary';
import { Dashboard } from '@/components/Dashboard';
import { ToolProvider, useToolContext } from '@/context/ToolContext';
import type { ToolId } from '@/types/tools';
import { useFileDrop } from '@/hooks/useFileDrop';
import { openFilePicker } from '@/hooks/useFileOpen';
import { detectFormat, getFileName, getFileSizeBytes, FILE_SIZE_LIMIT_BYTES, isPdfHeader } from '@/lib/fileValidation';
import { usePdfProcessor } from '@/hooks/usePdfProcessor';
import { useImageProcessor } from '@/hooks/useImageProcessor';
import { useRecentDirs } from '@/hooks/useRecentDirs';
import { PrivacyFooter } from '@/components/PrivacyFooter';
import { FirstLaunchBanner } from '@/components/FirstLaunchBanner';
import { MergeFlow } from '@/components/merge/MergeFlow';
import { SplitFlow } from '@/components/split/SplitFlow';
import { RotateFlow } from '@/components/rotate/RotateFlow';
import { RotateImageFlow } from '@/components/rotate-image/RotateImageFlow';
import { ConvertImageFlow } from '@/components/convert-image/ConvertImageFlow';
import { PdfToJpgFlow } from '@/components/pdf-to-jpg/PdfToJpgFlow';
import { JpgToPdfFlow } from '@/components/jpg-to-pdf/JpgToPdfFlow';
import { ProtectPdfFlow } from '@/components/protect-pdf/ProtectPdfFlow';
import { UnlockPdfFlow } from '@/components/unlock-pdf/UnlockPdfFlow';
import { PageNumbersFlow } from '@/components/page-numbers/PageNumbersFlow';
import { WatermarkFlow } from '@/components/watermark/WatermarkFlow';
import { CropPdfFlow } from '@/components/crop-pdf/CropPdfFlow';
import { OrganizePdfFlow } from '@/components/organize-pdf/OrganizePdfFlow';
import { PdfaConvertFlow } from '@/components/pdfa-convert/PdfaConvertFlow';
import { RepairPdfFlow } from '@/components/repair-pdf/RepairPdfFlow';
import { RedactPdfFlow } from '@/components/redact-pdf/RedactPdfFlow';
import { SignPdfFlow } from '@/components/sign-pdf/SignPdfFlow';
import { EditPdfFlow } from '@/components/edit-pdf/EditPdfFlow';
import { ConvertDocFlow } from '@/components/convert-doc/ConvertDocFlow';
import { UpdateChecker } from '@/components/UpdateChecker';
import { EditorView } from '@/components/pdf-editor/EditorView';
import { getPdfCompressibility } from '@/lib/pdfProcessor';
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

function ToolFlow() {
  const { activeTool, goToDashboard, pendingFiles, setPendingFiles, selectTool } = useToolContext();
  const [fileEntry, setFileEntry] = useState<FileEntry | null>(null);
  const [currentStep, setCurrentStep] = useState<AppStep>(0);
  const [dedicatedFlowStep, setDedicatedFlowStep] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [sourcePdfPageCount, setSourcePdfPageCount] = useState<number>(1);
  const [sourcePdfFileSizeBytes, setSourcePdfFileSizeBytes] = useState<number>(0);
  const [lastPdfQualityLevel, setLastPdfQualityLevel] = useState<PdfQualityLevel>('screen');
  const [pdfCompressibility, setPdfCompressibility] = useState<{ imageCount: number; compressibilityScore: number }>({ imageCount: 0, compressibilityScore: 0 });

  const pdfProcessor = usePdfProcessor();
  const imageProcessor = useImageProcessor();
  const { dirs: recentDirs, addDir: addRecentDir } = useRecentDirs();

  // When a file is picked from the global Recent Folder button, load it into the current tool
  const handleRecentFileSelected = useCallback((filePath: string) => {
    setPendingFiles([filePath]);
    // Reset to step 0 so the flow restarts and picks up pendingFiles
    setCurrentStep(0);
    setDedicatedFlowStep(0);
    setFileEntry(null);
    pdfProcessor.reset();
    imageProcessor.reset();
    setSavedFilePath(null);
    addRecentDir(filePath);
  }, [setPendingFiles, pdfProcessor, imageProcessor, addRecentDir]);

  const [invalidDropError, setInvalidDropError] = useState<string | null>(null);
  const [emptyFileError, setEmptyFileError] = useState<string | null>(null);
  const [corruptFileError, setCorruptFileError] = useState<string | null>(null);
  const [fileSizeLimitBytes, setFileSizeLimitBytes] = useState<number | null>(null);
  const [corruptPdfBlock, setCorruptPdfBlock] = useState<{ name: string } | null>(null);
  const [savedFilePath, setSavedFilePath] = useState<string | null>(null);
  // Stores the last PDF options so Retry can re-run with the same settings
  const lastPdfOptionsRef = useRef<Omit<PdfProcessingOptions, 'onProgress'> | null>(null);

  // Suppress auto-advance to Compare when navigating Back from Compare.
  // Set to true when Back is clicked; cleared when processing starts again.
  const suppressImageAdvance = useRef(false);

  // Tracks whether the Edit PDF flow has unsaved changes (step 1 dirty state).
  // Used by handleEditPdfBackToDashboard to guard back-navigation with a confirm dialog.
  const editPdfIsDirtyRef = useRef(false);

  // Reset all state and return to the dashboard
  const handleBackToDashboard = useCallback(() => {
    suppressImageAdvance.current = false;
    lastPdfOptionsRef.current = null;
    setSavedFilePath(null);
    setFileEntry(null);
    setCurrentStep(0);
    setDedicatedFlowStep(0);
    setSourcePdfPageCount(1);
    setSourcePdfFileSizeBytes(0);
    setPdfCompressibility({ imageCount: 0, compressibilityScore: 0 });
    pdfProcessor.reset();
    imageProcessor.reset();
    setCorruptPdfBlock(null);
    goToDashboard();
  }, [pdfProcessor, imageProcessor, goToDashboard]);

  // Back-to-dashboard handler for Edit PDF — shows a confirmation dialog when the
  // user has unsaved edits (step 1 dirty state) to prevent accidental data loss.
  const handleEditPdfBackToDashboard = useCallback(() => {
    if (editPdfIsDirtyRef.current && dedicatedFlowStep === 1) {
      const confirmed = window.confirm(
        'You have unsaved changes. Are you sure you want to go back to the dashboard? Your edits will be lost.',
      );
      if (!confirmed) return;
    }
    handleBackToDashboard();
  }, [handleBackToDashboard, dedicatedFlowStep]);

  // Reset everything and go back to landing (step 0 within current tool)
  const handleStartOver = useCallback(() => {
    suppressImageAdvance.current = false;
    lastPdfOptionsRef.current = null;
    setSavedFilePath(null);
    setFileEntry(null);
    setCurrentStep(0);
    setSourcePdfPageCount(1);
    setSourcePdfFileSizeBytes(0);
    setPdfCompressibility({ imageCount: 0, compressibilityScore: 0 });
    pdfProcessor.reset();
    imageProcessor.reset();
    setCorruptPdfBlock(null);
  }, [pdfProcessor, imageProcessor]);

  // Merge PDF — dedicated flow
  if (activeTool === 'merge-pdf') {
    return (
      <>
        <ToolHeader currentStep={dedicatedFlowStep} onBackToDashboard={handleBackToDashboard} recentDirs={recentDirs} onRecentFileSelected={handleRecentFileSelected} />
        <MergeFlow onStepChange={setDedicatedFlowStep} />
      </>
    );
  }

  // Split PDF — dedicated flow
  if (activeTool === 'split-pdf') {
    return (
      <>
        <ToolHeader currentStep={dedicatedFlowStep} onBackToDashboard={handleBackToDashboard} recentDirs={recentDirs} onRecentFileSelected={handleRecentFileSelected} />
        <SplitFlow onStepChange={setDedicatedFlowStep} />
      </>
    );
  }

  // Rotate PDF — dedicated flow
  if (activeTool === 'rotate-pdf') {
    return (
      <>
        <ToolHeader currentStep={dedicatedFlowStep} onBackToDashboard={handleBackToDashboard} recentDirs={recentDirs} onRecentFileSelected={handleRecentFileSelected} />
        <RotateFlow onStepChange={setDedicatedFlowStep} />
      </>
    );
  }

  // PDF to JPG — dedicated flow
  if (activeTool === 'pdf-to-jpg') {
    return (
      <>
        <ToolHeader currentStep={dedicatedFlowStep} onBackToDashboard={handleBackToDashboard} recentDirs={recentDirs} onRecentFileSelected={handleRecentFileSelected} />
        <PdfToJpgFlow onStepChange={setDedicatedFlowStep} />
      </>
    );
  }

  // JPG to PDF — dedicated flow
  if (activeTool === 'jpg-to-pdf') {
    return (
      <>
        <ToolHeader currentStep={dedicatedFlowStep} onBackToDashboard={handleBackToDashboard} recentDirs={recentDirs} onRecentFileSelected={handleRecentFileSelected} />
        <JpgToPdfFlow onStepChange={setDedicatedFlowStep} />
      </>
    );
  }

  // Protect PDF — dedicated flow
  if (activeTool === 'protect-pdf') {
    return (
      <>
        <ToolHeader currentStep={dedicatedFlowStep} onBackToDashboard={handleBackToDashboard} recentDirs={recentDirs} onRecentFileSelected={handleRecentFileSelected} />
        <ProtectPdfFlow onStepChange={setDedicatedFlowStep} />
      </>
    );
  }

  // Unlock PDF — dedicated flow
  if (activeTool === 'unlock-pdf') {
    return (
      <>
        <ToolHeader currentStep={dedicatedFlowStep} onBackToDashboard={handleBackToDashboard} recentDirs={recentDirs} onRecentFileSelected={handleRecentFileSelected} />
        <UnlockPdfFlow onStepChange={setDedicatedFlowStep} />
      </>
    );
  }

  // Rotate Image — dedicated flow
  if (activeTool === 'rotate-image') {
    return (
      <>
        <ToolHeader currentStep={dedicatedFlowStep} onBackToDashboard={handleBackToDashboard} recentDirs={recentDirs} onRecentFileSelected={handleRecentFileSelected} />
        <RotateImageFlow onStepChange={setDedicatedFlowStep} />
      </>
    );
  }

  // Convert Image — dedicated flow
  if (activeTool === 'convert-image') {
    return (
      <>
        <ToolHeader currentStep={dedicatedFlowStep} onBackToDashboard={handleBackToDashboard} recentDirs={recentDirs} onRecentFileSelected={handleRecentFileSelected} />
        <ConvertImageFlow onStepChange={setDedicatedFlowStep} />
      </>
    );
  }

  // Page Numbers — dedicated flow
  if (activeTool === 'page-numbers') {
    return (
      <>
        <ToolHeader currentStep={dedicatedFlowStep} onBackToDashboard={handleBackToDashboard} recentDirs={recentDirs} onRecentFileSelected={handleRecentFileSelected} />
        <PageNumbersFlow onStepChange={setDedicatedFlowStep} />
      </>
    );
  }

  // Watermark — dedicated flow
  if (activeTool === 'watermark') {
    return (
      <>
        <ToolHeader currentStep={dedicatedFlowStep} onBackToDashboard={handleBackToDashboard} recentDirs={recentDirs} onRecentFileSelected={handleRecentFileSelected} />
        <WatermarkFlow onStepChange={setDedicatedFlowStep} />
      </>
    );
  }

  // Crop PDF — dedicated flow
  if (activeTool === 'crop-pdf') {
    return (
      <>
        <ToolHeader currentStep={dedicatedFlowStep} onBackToDashboard={handleBackToDashboard} recentDirs={recentDirs} onRecentFileSelected={handleRecentFileSelected} />
        <CropPdfFlow onStepChange={setDedicatedFlowStep} />
      </>
    );
  }

  // Organize PDF — dedicated flow
  if (activeTool === 'organize-pdf') {
    return (
      <>
        <ToolHeader currentStep={dedicatedFlowStep} onBackToDashboard={handleBackToDashboard} recentDirs={recentDirs} onRecentFileSelected={handleRecentFileSelected} />
        <OrganizePdfFlow onStepChange={setDedicatedFlowStep} />
      </>
    );
  }

  // Sign PDF — dedicated flow
  if (activeTool === 'sign-pdf') {
    return (
      <>
        <ToolHeader currentStep={dedicatedFlowStep} onBackToDashboard={handleBackToDashboard} recentDirs={recentDirs} onRecentFileSelected={handleRecentFileSelected} />
        <SignPdfFlow onStepChange={setDedicatedFlowStep} />
      </>
    );
  }

  // Redact PDF — dedicated flow
  if (activeTool === 'redact-pdf') {
    return (
      <>
        <ToolHeader currentStep={dedicatedFlowStep} onBackToDashboard={handleBackToDashboard} recentDirs={recentDirs} onRecentFileSelected={handleRecentFileSelected} />
        <RedactPdfFlow onStepChange={setDedicatedFlowStep} />
      </>
    );
  }

  // Edit PDF — dedicated flow
  if (activeTool === 'edit-pdf') {
    return (
      <>
        <ToolHeader currentStep={dedicatedFlowStep} onBackToDashboard={handleEditPdfBackToDashboard} recentDirs={recentDirs} onRecentFileSelected={handleRecentFileSelected} />
        <EditPdfFlow onStepChange={setDedicatedFlowStep} onIsDirtyChange={(dirty) => { editPdfIsDirtyRef.current = dirty; }} />
      </>
    );
  }

  // Convert Document — dedicated flow
  if (activeTool === 'convert-doc') {
    return (
      <>
        <ToolHeader currentStep={dedicatedFlowStep} onBackToDashboard={handleBackToDashboard} recentDirs={recentDirs} onRecentFileSelected={handleRecentFileSelected} />
        <ConvertDocFlow onStepChange={setDedicatedFlowStep} />
      </>
    );
  }

  // PDF/A Convert — dedicated flow
  if (activeTool === 'pdfa-convert') {
    return (
      <>
        <ToolHeader currentStep={dedicatedFlowStep} onBackToDashboard={handleBackToDashboard} recentDirs={recentDirs} onRecentFileSelected={handleRecentFileSelected} />
        <PdfaConvertFlow onStepChange={setDedicatedFlowStep} />
      </>
    );
  }

  // Repair PDF — dedicated flow
  if (activeTool === 'repair-pdf') {
    return (
      <>
        <ToolHeader currentStep={dedicatedFlowStep} onBackToDashboard={handleBackToDashboard} recentDirs={recentDirs} onRecentFileSelected={handleRecentFileSelected} />
        <RepairPdfFlow onStepChange={setDedicatedFlowStep} />
      </>
    );
  }

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

    // For PDFs: check magic bytes before loading to give a clear corrupt-file message
    // instead of a cryptic parse error later in the processing step.
    if (format === 'pdf') {
      try {
        const { readFile } = await import('@tauri-apps/plugin-fs');
        // Read the file and check the first 5 bytes for the %PDF- magic number
        const allBytes = await readFile(filePath);
        const headerBytes = allBytes.slice(0, 5);
        if (!isPdfHeader(headerBytes)) {
          setCorruptPdfBlock({ name: getFileName(filePath) });
          return;
        }
      } catch {
        // Could not read — treat as corrupt
        setCorruptPdfBlock({ name: getFileName(filePath) });
        return;
      }
    }

    setIsLoading(true);
    setTimeout(() => {
      setFileEntry({ path: filePath, format, name: getFileName(filePath) });
      addRecentDir(filePath); // persist directory for next session
      setIsLoading(false);
      setCurrentStep(1);
    }, 600);
  }, [addRecentDir]);

  // Auto-load file dropped on dashboard (pendingFiles from ToolContext)
  useEffect(() => {
    if (pendingFiles.length > 0 && currentStep === 0 && !fileEntry) {
      const file = pendingFiles[0];
      setPendingFiles([]);
      handleFileSelected(file);
    }
  }, [pendingFiles, currentStep, fileEntry, handleFileSelected, setPendingFiles]);

  // Load source PDF page count, file size, and compressibility when a PDF is selected
  useEffect(() => {
    if (fileEntry?.format === 'pdf') {
      getPdfMeta(fileEntry.path)
        .then(({ pageCount, fileSizeBytes }) => {
          setSourcePdfPageCount(pageCount);
          setSourcePdfFileSizeBytes(fileSizeBytes);
        })
        .catch(() => setSourcePdfPageCount(1)); // fallback; will validate on processing

      getPdfCompressibility(fileEntry.path)
        .then((result) => setPdfCompressibility(result))
        .catch(() => setPdfCompressibility({ imageCount: 0, compressibilityScore: 0 }));
    }
  }, [fileEntry]);

  // Advance to Compare step when PDF processing completes with a result
  useEffect(() => {
    if (pdfProcessor.result && currentStep === 1) {
      setCurrentStep(2);
    }
  }, [pdfProcessor.result, currentStep]);

  // Advance to Compare step when PDF processing is cancelled (to show cancelled state)
  useEffect(() => {
    if (pdfProcessor.isCancelled && currentStep === 1) {
      setCurrentStep(2);
    }
  }, [pdfProcessor.isCancelled, currentStep]);

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
      // E2E test hook: tests set window.__E2E_OPEN_FILE__ to bypass the frozen Tauri IPC.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const e2eFile = (window as any).__E2E_OPEN_FILE__ as string | undefined;
      if (e2eFile) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        delete (window as any).__E2E_OPEN_FILE__;
        handleFileSelected(e2eFile);
        return;
      }
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
      lastPdfOptionsRef.current = options;
      setLastPdfQualityLevel(options.qualityLevel);
      pdfProcessor.run(fileEntry.path, options);
    },
    [fileEntry, pdfProcessor],
  );

  // Retry PDF processing with the last options after cancellation
  const handleRetryPdf = useCallback(() => {
    if (!fileEntry || !lastPdfOptionsRef.current) return;
    pdfProcessor.reset();
    setCurrentStep(1);
    // Re-run will be triggered by user going back to ConfigureStep and clicking Generate Preview,
    // OR we can auto-trigger it here if options are stored
    pdfProcessor.run(fileEntry.path, lastPdfOptionsRef.current);
  }, [fileEntry, pdfProcessor]);

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

  // Called from CompareStep cancelled state — reset to Configure step
  const handleBackFromCancelled = useCallback(() => {
    pdfProcessor.reset();
    imageProcessor.reset();
    suppressImageAdvance.current = false;
    setCurrentStep(1);
  }, [pdfProcessor, imageProcessor]);

  const handleBackFromConfigure = useCallback(() => {
    suppressImageAdvance.current = false;
    setCurrentStep(0);
    setFileEntry(null);
    pdfProcessor.reset();
    imageProcessor.reset();
  }, [pdfProcessor, imageProcessor]);

  return (
    <>
      <ToolHeader currentStep={currentStep} onBackToDashboard={handleBackToDashboard} recentDirs={recentDirs} onRecentFileSelected={handleRecentFileSelected} />

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
          corruptPdfBlock={corruptPdfBlock}
          onCorruptPdfDismiss={() => setCorruptPdfBlock(null)}
          onCorruptPdfRepair={() => { selectTool('repair-pdf'); setCorruptPdfBlock(null); }}
        />
      )}

      {/* Step 1: Configure — PDF */}
      <StepErrorBoundary stepName="Configure">
        {currentStep === 1 && fileEntry?.format === 'pdf' && (
          <ConfigureStep
            fileName={fileEntry.name}
            pageCount={sourcePdfPageCount}
            fileSizeBytes={sourcePdfFileSizeBytes}
            compressibilityScore={pdfCompressibility.compressibilityScore}
            imageCount={pdfCompressibility.imageCount}
            isProcessing={pdfProcessor.isProcessing}
            progress={pdfProcessor.progress}
            error={pdfProcessor.error}
            onGeneratePreview={handleGeneratePreview}
            onBack={handleBackFromConfigure}
            onCancel={pdfProcessor.cancel}
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
            onCancel={imageProcessor.cancel}
          />
        )}
      </StepErrorBoundary>

      {/* Step 2: Compare — image */}
      <StepErrorBoundary stepName="Compare">
        {currentStep === 2 && imageProcessor.result && fileEntry?.format === 'image' && (
          <ImageCompareStep
            result={imageProcessor.result}
            isProcessing={imageProcessor.isProcessing}
            onSave={handleSave}
            onBack={handleBackFromCompare}
            onStartOver={handleStartOver}
          />
        )}

        {/* Step 2: Compare — PDF (normal result or cancelled state) */}
        {currentStep === 2 && (pdfProcessor.result || pdfProcessor.isCancelled) && fileEntry?.format === 'pdf' && (
          <CompareStep
            result={pdfProcessor.result ?? undefined}
            qualityLevel={lastPdfQualityLevel}
            isCancelled={pdfProcessor.isCancelled}
            onSave={handleSave}
            onBack={pdfProcessor.isCancelled ? handleBackFromCancelled : handleBackFromCompare}
            onStartOver={handleStartOver}
            onRetry={pdfProcessor.isCancelled ? handleRetryPdf : undefined}
          />
        )}
      </StepErrorBoundary>

      {/* Step 3: Save — PDF */}
      <StepErrorBoundary stepName="Save">
        {currentStep === 3 && pdfProcessor.result && fileEntry?.format === 'pdf' && (
          <SaveStep
            processedBytes={pdfProcessor.result.bytes}
            sourceFileName={fileEntry.name}
            savedFilePath={savedFilePath}
            onDismissSaveConfirmation={() => setSavedFilePath(null)}
            onSaveComplete={(savedPath) => {
              setSavedFilePath(savedPath);
            }}
            onCancel={() => {
              setCurrentStep(2);
            }}
            onBack={() => {
              setSavedFilePath(null);
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
            savedFilePath={savedFilePath}
            onDismissSaveConfirmation={() => setSavedFilePath(null)}
            onSaveComplete={(savedPath) => {
              setSavedFilePath(savedPath);
            }}
            onCancel={() => setCurrentStep(2)}
            onBack={() => {
              setSavedFilePath(null);
              setCurrentStep(2);
            }}
          />
        )}
      </StepErrorBoundary>
    </>
  );
}

function AppContent() {
  const { activeTool, editorFilePath, openEditor, goToDashboard, selectTool } = useToolContext();

  // Intercept edit-pdf tool: open file picker then redirect to new editor
  useEffect(() => {
    if (activeTool !== 'edit-pdf') return;
    let cancelled = false;
    (async () => {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const result = await open({
        multiple: false,
        directory: false,
        filters: [{ name: 'PDF Files', extensions: ['pdf'] }],
      });
      if (cancelled) return;
      if (typeof result === 'string') {
        openEditor(result);
      } else {
        goToDashboard();
      }
    })();
    return () => { cancelled = true; };
  }, [activeTool, openEditor, goToDashboard]);

  // Listen for "file-opened" event from Tauri backend (file association / CLI arg)
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    import('@tauri-apps/api/event').then(({ listen }) => {
      listen<string>('file-opened', (event) => {
        if (event.payload && event.payload.endsWith('.pdf')) {
          openEditor(event.payload);
        }
      }).then((fn) => {
        unlisten = fn;
      });
    });
    return () => {
      unlisten?.();
    };
  }, [openEditor]);

  // Listen for custom "papercut:open-tool" events from editor sidebar (sign/redact navigation)
  useEffect(() => {
    function handleOpenTool(e: Event) {
      const toolId = (e as CustomEvent).detail;
      if (typeof toolId === 'string') {
        selectTool(toolId as ToolId);
      }
    }
    window.addEventListener('papercut:open-tool', handleOpenTool);
    return () => window.removeEventListener('papercut:open-tool', handleOpenTool);
  }, [selectTool]);

  // Priority: editorFilePath > activeTool > dashboard
  const showEditor = editorFilePath !== null;
  const showToolFlow = !showEditor && activeTool !== null;
  const showDashboard = !showEditor && activeTool === null;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      <UpdateChecker />
      {showDashboard && <FirstLaunchBanner />}
      {showEditor && <EditorView filePath={editorFilePath} />}
      {showToolFlow && <ToolFlow />}
      {showDashboard && <Dashboard />}
      {!showEditor && <PrivacyFooter />}
      <Toaster position="bottom-center" />
    </div>
  );
}

function App() {
  const [showSplash, setShowSplash] = useState(true);

  return (
    <AppErrorBoundary>
      <ToolProvider>
        {showSplash && <SplashScreen onComplete={() => setShowSplash(false)} />}
        <AppContent />
      </ToolProvider>
    </AppErrorBoundary>
  );
}

export default App;
