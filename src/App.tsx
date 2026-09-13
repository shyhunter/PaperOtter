import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Toaster } from '@/components/ui/sonner';
import { SplashScreen } from '@/components/SplashScreen';
import { FilePickStep } from '@/components/FilePickStep';
import { ToolHeader } from '@/components/ToolHeader';
import { AppChrome } from '@/components/AppChrome';
import { ConfigureStep } from '@/components/ConfigureStep';
import { CompareStep } from '@/components/CompareStep';
import type { DestinationRequirement } from '@/lib/destinations';
import { SaveStep } from '@/components/SaveStep';
import { ImageConfigureStep } from '@/components/ImageConfigureStep';
import { ImageCompareStep } from '@/components/ImageCompareStep';
import { StepErrorBoundary, AppErrorBoundary } from '@/components/ErrorBoundary';
import { Dashboard } from '@/components/Dashboard';
import { ToolProvider, useToolContext } from '@/context/ToolContext';
import { useLocale } from '@/i18n/context';
import { TOOL_REGISTRY, type ToolId } from '@/types/tools';
import { detectFormat, getFileName, stripImageExtension } from '@/lib/fileValidation';
import { friendlyPdfError, isPdfLoadError } from '@/lib/pdfUtils';
import { encryptedPdfRefusal } from '@/lib/pdfEncryption';
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
import { PageNumbersFlow } from '@/components/page-numbers/PageNumbersFlow';
import { WatermarkFlow } from '@/components/watermark/WatermarkFlow';
import { CropPdfFlow } from '@/components/crop-pdf/CropPdfFlow';
import { OrganizePdfFlow } from '@/components/organize-pdf/OrganizePdfFlow';
import { RepairPdfFlow } from '@/components/repair-pdf/RepairPdfFlow';
import { RedactPdfFlow } from '@/components/redact-pdf/RedactPdfFlow';
import { SignPdfFlow } from '@/components/sign-pdf/SignPdfFlow';
import { ConvertDocFlow } from '@/components/convert-doc/ConvertDocFlow';
import { UpdateChecker } from '@/components/UpdateChecker';
import { EditorView } from '@/components/pdf-editor/EditorView';
import { getPdfCompressibility } from '@/lib/pdfProcessor';
import type { FileEntry, AppStep, SupportedFormat, PdfProcessingOptions, PdfQualityLevel, ImageProcessingOptions, ImageOutputFormat } from '@/types/file';
import { t } from '@/i18n';
import { useBatchProcessor } from '@/hooks/useBatchProcessor';
import { BatchSummaryStep } from '@/components/batch/BatchSummaryStep';
import { BatchRunStep } from '@/components/batch/BatchRunStep';
import { processPdf } from '@/lib/pdfProcessor';
import { processImage } from '@/lib/imageProcessor';
import { OcrPdfFlow } from '@/components/ocr-pdf/OcrPdfFlow';
import { resolveInitialLocale } from '@/i18n/preference';
import { setLocale } from '@/i18n';

function detectImageFormat(filePath: string): ImageOutputFormat {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'png') return 'png';
  if (ext === 'webp') return 'webp';
  return 'jpeg'; // jpg and jpeg both map to 'jpeg'
}

function buildImageSaveFileName(sourceFileName: string, outputFormat: ImageOutputFormat): string {
  const base = stripImageExtension(sourceFileName);
  const ext = outputFormat === 'jpeg' ? 'jpg' : outputFormat;
  return `${base}-processed.${ext}`;
}

function buildImageSaveFilters(outputFormat: ImageOutputFormat): Array<{ name: string; extensions: string[] }> {
  switch (outputFormat) {
    case 'jpeg': return [{ name: t('filter.jpegImage'), extensions: ['jpg', 'jpeg'] }];
    case 'png':  return [{ name: t('filter.pngImage'),  extensions: ['png'] }];
    case 'webp': return [{ name: t('filter.webpImage'), extensions: ['webp'] }];
  }
}

/** Tools with a dedicated flow component, handled by DedicatedToolFlow. */
const DEDICATED_TOOLS = new Set<string>([
  'merge-pdf',
  'split-pdf',
  'rotate-pdf',
  'pdf-to-jpg',
  'jpg-to-pdf',
  'rotate-image',
  'convert-image',
  'page-numbers',
  'watermark',
  'crop-pdf',
  'organize-pdf',
  'sign-pdf',
  'redact-pdf',
  'edit-pdf',
  'convert-doc',
  'repair-pdf',
  'ocr-pdf',
]);

/**
 * Dedicated tool flows and the standard compress/convert flow have entirely
 * separate hook sets. Holding both in one component put the compress path's
 * hooks below the dedicated flows' early returns, so they ran for some tools
 * and not others -- a rules-of-hooks violation React punishes with "Rendered
 * more hooks than during the previous render" when activeTool changes without
 * a remount, which this element does not do (it has no key).
 *
 * Splitting them keeps each component's hooks unconditional, and keeps the
 * compress path's effects from running while a dedicated tool is open.
 */
function ToolFlow() {
  const { activeTool } = useToolContext();

  return DEDICATED_TOOLS.has(activeTool as string) ? <DedicatedToolFlow /> : <StandardToolFlow />;
}

function DedicatedToolFlow() {
  const { activeTool, goToDashboard, setPendingFiles } = useToolContext();
  const [dedicatedFlowStep, setDedicatedFlowStep] = useState(0);
  const { dirs: recentDirs, addDir: addRecentDir } = useRecentDirs();

  // When a file is picked from the global Recent Folder button, load it into the current tool
  const handleRecentFileSelected = useCallback((filePath: string) => {
    setPendingFiles([filePath]);
    // Reset to step 0 so the flow restarts and picks up pendingFiles
    setDedicatedFlowStep(0);
    addRecentDir(filePath);
  }, [setPendingFiles, addRecentDir]);

  // Going back to the dashboard unmounts this component, so its state -- and the
  // processor hooks' state, which is hook-local -- is discarded either way.
  const handleBackToDashboard = useCallback(() => {
    setDedicatedFlowStep(0);
    goToDashboard();
  }, [goToDashboard]);

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

  // Edit PDF has no branch here on purpose, and this is not a gap to fill.
  // AppContent intercepts `activeTool === 'edit-pdf'` (see the effect near the
  // foot of this file) and opens the file picker at once: a chosen file goes to
  // openEditor, a dismissed one goes back to the dashboard, and both clear
  // activeTool. So anything rendered here would be torn down in the same tick.
  // A three-step flow did live here and could not be reached by anyone; it was
  // removed rather than left to be maintained. The behaviour that replaced it is
  // pinned by TOOL-03 in src/browser-tests/tool-contract.spec.ts.

  // Convert Document — dedicated flow
  if (activeTool === 'convert-doc') {
    return (
      <>
        <ToolHeader currentStep={dedicatedFlowStep} onBackToDashboard={handleBackToDashboard} recentDirs={recentDirs} onRecentFileSelected={handleRecentFileSelected} />
        <ConvertDocFlow onStepChange={setDedicatedFlowStep} />
      </>
    );
  }

  // Repair PDF — dedicated flow
  if (activeTool === 'ocr-pdf') {
    return (
      <>
        <ToolHeader currentStep={dedicatedFlowStep} onBackToDashboard={handleBackToDashboard} recentDirs={recentDirs} onRecentFileSelected={handleRecentFileSelected} />
        <OcrPdfFlow onStepChange={setDedicatedFlowStep} />
      </>
    );
  }

  if (activeTool === 'repair-pdf') {
    return (
      <>
        <ToolHeader currentStep={dedicatedFlowStep} onBackToDashboard={handleBackToDashboard} recentDirs={recentDirs} onRecentFileSelected={handleRecentFileSelected} />
        <RepairPdfFlow onStepChange={setDedicatedFlowStep} />
      </>
    );
  }

  return null;
}

function StandardToolFlow() {
  const { activeTool, goToDashboard, setPendingFiles } = useToolContext();
  // Compress PDF and Compress Image are one flow that branches on the file, so
  // without this the tool you opened decided nothing: the picker offered every
  // type, and dropping a PDF on Compress Image quietly started a PDF job.
  const acceptedFormats = useMemo<readonly SupportedFormat[]>(
    () => (activeTool !== null ? TOOL_REGISTRY[activeTool].acceptsFormats : ['pdf', 'image']),
    [activeTool],
  );
  const [fileEntry, setFileEntry] = useState<FileEntry | null>(null);
  const [currentStep, setCurrentStep] = useState<AppStep>(0);
  const [isLoading, setIsLoading] = useState(false);
  // Every file in the current batch, first included. Length <= 1 means the
  // ordinary single-file flow, which is untouched.
  const [batchPaths, setBatchPaths] = useState<string[]>([]);
  const batchProcessor = useBatchProcessor();
  const [sourcePdfPageCount, setSourcePdfPageCount] = useState<number>(1);
  const [sourcePdfFileSizeBytes, setSourcePdfFileSizeBytes] = useState<number>(0);
  const [lastPdfQualityLevel, setLastPdfQualityLevel] = useState<PdfQualityLevel>('screen');
  // What the document is being prepared for. Held here because both steps need
  // it: Configure applies it to the controls, Compare checks the result against it.
  const [destination, setDestination] = useState<DestinationRequirement | null>(null);
  const [pdfCompressibility, setPdfCompressibility] = useState<{ imageCount: number; compressibilityScore: number; jpxByteShare: number }>({ imageCount: 0, compressibilityScore: 0, jpxByteShare: 0 });

  const pdfProcessor = usePdfProcessor();
  const imageProcessor = useImageProcessor();
  const { dirs: recentDirs, addDir: addRecentDir } = useRecentDirs();

  // When a file is picked from the global Recent Folder button, load it into the current tool
  const handleRecentFileSelected = useCallback((filePath: string) => {
    setPendingFiles([filePath]);
    // Reset to step 0 so the flow restarts and picks up pendingFiles
    setCurrentStep(0);
    setFileEntry(null);
    pdfProcessor.reset();
    imageProcessor.reset();
    setSavedFilePath(null);
    addRecentDir(filePath);
  }, [setPendingFiles, pdfProcessor, imageProcessor, addRecentDir]);

  // Not a picker concern: this is what a *processing* step reports when it
  // fails and sends the user back to step 0. FilePickStep shows it in the same
  // slot its own refusals use.
  const [processingError, setProcessingError] = useState<string | null>(null);
  const [savedFilePath, setSavedFilePath] = useState<string | null>(null);
  // Stores the last PDF options so Retry can re-run with the same settings
  const lastPdfOptionsRef = useRef<Omit<PdfProcessingOptions, 'onProgress'> | null>(null);

  // Suppress auto-advance to Compare when navigating Back from Compare.
  // Set to true when Back is clicked; cleared when processing starts again.
  const suppressImageAdvance = useRef(false);

  // Reset all state and return to the dashboard
  const handleBackToDashboard = useCallback(() => {
    suppressImageAdvance.current = false;
    lastPdfOptionsRef.current = null;
    setSavedFilePath(null);
    setFileEntry(null);
    setCurrentStep(0);
    setSourcePdfPageCount(1);
    setSourcePdfFileSizeBytes(0);
    setPdfCompressibility({ imageCount: 0, compressibilityScore: 0, jpxByteShare: 0 });
    pdfProcessor.reset();
    imageProcessor.reset();
    goToDashboard();
  }, [pdfProcessor, imageProcessor, goToDashboard]);

  // Reset everything and go back to landing (step 0 within current tool)
  const handleStartOver = useCallback(() => {
    suppressImageAdvance.current = false;
    lastPdfOptionsRef.current = null;
    setSavedFilePath(null);
    setFileEntry(null);
    setCurrentStep(0);
    setSourcePdfPageCount(1);
    setSourcePdfFileSizeBytes(0);
    setPdfCompressibility({ imageCount: 0, compressibilityScore: 0, jpxByteShare: 0 });
    pdfProcessor.reset();
    imageProcessor.reset();
  }, [pdfProcessor, imageProcessor]);

  // Everything the picker needs -- the guards, the dialog, the drop listener --
  // now lives in FilePickStep, which every tool shares. What is left here is
  // what happens *after* a file has been accepted.
  const handleFileReady = useCallback(async (filePath: string, alsoSelected: string[]) => {
    const format = detectFormat(filePath);
    if (!format) return;
    setProcessingError(null);
    setIsLoading(true);
    // Compress was the one PDF tool with no door check, so it was left to
    // pdf-lib to refuse a locked file -- which it did by throwing on every
    // encrypted document, password-required or not. Now that the load ignores
    // encryption, this is what stops a genuinely locked PDF from getting in and
    // failing later with nothing on screen.
    if (format === 'pdf') {
      try {
        const { readFile } = await import('@tauri-apps/plugin-fs');
        const refusal = await encryptedPdfRefusal(await readFile(filePath));
        if (refusal) {
          setIsLoading(false);
          setProcessingError(refusal);
          return;
        }
      } catch {
        // Unreadable here means unreadable in the steps that follow, which
        // report it with their own message. Waving the file through keeps this
        // check from inventing a second, worse explanation.
      }
    }
    setTimeout(() => {
      setFileEntry({ path: filePath, format, name: getFileName(filePath) });
      setBatchPaths(alsoSelected.length > 0 ? [filePath, ...alsoSelected] : []);
      setIsLoading(false);
      setCurrentStep(1);
    }, 600);
  }, []);

  // Load source PDF page count, file size, and compressibility when a PDF is selected
  useEffect(() => {
    if (fileEntry?.format !== 'pdf') return;
    let cancelled = false;

    // Single load+scan for page count, file size, and compressibility — previously two
    // separate PDFDocument.load() calls parsed the same file twice.
    getPdfCompressibility(fileEntry.path)
      .then(({ pageCount, fileSizeBytes, ...compressibility }) => {
        if (cancelled) return;
        setSourcePdfPageCount(pageCount);
        setSourcePdfFileSizeBytes(fileSizeBytes);
        setPdfCompressibility(compressibility);
      })
      .catch(() => {
        if (cancelled) return;
        setSourcePdfPageCount(1); // fallback; will validate on processing
        setPdfCompressibility({ imageCount: 0, compressibilityScore: 0, jpxByteShare: 0 });
      });

    return () => { cancelled = true; };
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

  // Navigate back to landing when PDF processing fails.
  // Only relabel this as a "corrupt file" when the error actually looks like a
  // load/parse failure — a Ghostscript/processing error already carries its own
  // actionable message and showing "file is corrupt" instead would hide the real cause.
  useEffect(() => {
    if (pdfProcessor.error && currentStep === 1 && fileEntry?.format === 'pdf') {
      handleStartOver();
      setProcessingError(
        isPdfLoadError(pdfProcessor.error)
          ? friendlyPdfError(pdfProcessor.error)
          : pdfProcessor.error
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfProcessor.error]);

  // Navigate back to landing when image processing fails (corrupt file)
  useEffect(() => {
    if (imageProcessor.error && currentStep === 1 && fileEntry?.format === 'image') {
      handleStartOver();
      setProcessingError(t('app.thisFileAppearsToBe'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageProcessor.error]);


  const handleGeneratePreview = useCallback(
    (options: Omit<PdfProcessingOptions, 'onProgress'>) => {
      if (!fileEntry) return;
      lastPdfOptionsRef.current = options;
      setLastPdfQualityLevel(options.qualityLevel);

      if (batchPaths.length > 1) {
        setCurrentStep(2);
        void batchProcessor.run(batchPaths, async (path) => {
          const result = await processPdf(path, options);
          return {
            fileName: `${getFileName(path).replace(/\.pdf$/i, '')}-optimised.pdf`,
            bytes: result.bytes,
            inputSizeBytes: result.inputSizeBytes,
            outputSizeBytes: result.outputSizeBytes,
          };
        });
        return;
      }

      pdfProcessor.run(fileEntry.path, options);
    },
    [fileEntry, pdfProcessor, batchPaths, batchProcessor],
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

      if (batchPaths.length > 1) {
        setCurrentStep(2);
        void batchProcessor.run(batchPaths, async (path) => {
          const result = await processImage(path, options);
          return {
            fileName: buildImageSaveFileName(getFileName(path), options.outputFormat),
            bytes: result.bytes,
            inputSizeBytes: result.inputSizeBytes,
            outputSizeBytes: result.outputSizeBytes,
          };
        });
        return;
      }

      imageProcessor.run(fileEntry.path, options);
    },
    [fileEntry, imageProcessor, batchPaths, batchProcessor],
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
    setBatchPaths([]);
    pdfProcessor.reset();
    imageProcessor.reset();
    batchProcessor.reset();
  }, [pdfProcessor, imageProcessor, batchProcessor]);

  return (
    <>
      <ToolHeader currentStep={currentStep} onBackToDashboard={handleBackToDashboard} recentDirs={recentDirs} onRecentFileSelected={handleRecentFileSelected} />

      {/* Step 0: Pick */}
      {currentStep === 0 && (
        <FilePickStep
          acceptedFormats={acceptedFormats}
          onFileReady={handleFileReady}
          isLoading={isLoading}
          error={processingError}
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
            jpxByteShare={pdfCompressibility.jpxByteShare}
            isProcessing={pdfProcessor.isProcessing}
            progress={pdfProcessor.progress}
            error={pdfProcessor.error}
            onGeneratePreview={handleGeneratePreview}
            destination={destination}
            onDestinationChange={setDestination}
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

      {/* Step 2: Batch — running, then summary. Replaces Compare, which has no
          meaning for twelve files at once. */}
      {currentStep === 2 && batchPaths.length > 1 && batchProcessor.isRunning && (
        <BatchRunStep progress={batchProcessor.progress} onCancel={batchProcessor.cancel} />
      )}
      {currentStep === 2 && batchPaths.length > 1 && !batchProcessor.isRunning && batchProcessor.result && (
        <BatchSummaryStep
          succeeded={batchProcessor.result.succeeded.map((s) => ({
            path: s.path,
            fileName: s.output.fileName,
            inputSizeBytes: s.output.inputSizeBytes,
            outputSizeBytes: s.output.outputSizeBytes,
          }))}
          failed={batchProcessor.result.failed}
          cancelled={batchProcessor.result.cancelled}
          onSave={() => setCurrentStep(3)}
          onBack={handleBackFromConfigure}
        />
      )}

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
            destination={destination}
            qualityLevel={lastPdfQualityLevel}
            isCancelled={pdfProcessor.isCancelled}
            onSave={handleSave}
            onBack={pdfProcessor.isCancelled ? handleBackFromCancelled : handleBackFromCompare}
            onStartOver={handleStartOver}
            onRetry={pdfProcessor.isCancelled ? handleRetryPdf : undefined}
          />
        )}
      </StepErrorBoundary>

      {/* Step 3: Save — batch */}
      <StepErrorBoundary stepName="Save">
        {/* A batch run goes through batchProcessor, so neither pdfProcessor.result
            nor imageProcessor.result is ever set — the two branches below cannot
            match and the step rendered nothing at all. Its outputs already carry
            the fileName and bytes MultiFileSave needs, which is what gives the
            batch the same folder/ZIP save Split has, collision naming included. */}
        {currentStep === 3 && batchPaths.length > 1 && batchProcessor.result && (
          <SaveStep
            // Only read in single-file mode; MultiFileSave writes each output's
            // own bytes. Passing the first keeps the prop honest rather than
            // widening the type for a value that is never used here.
            processedBytes={batchProcessor.result.succeeded[0]?.output.bytes ?? new Uint8Array()}
            sourceFileName={fileEntry?.name ?? ''}
            defaultSaveName={`papercut-batch-${batchProcessor.result.succeeded.length}-files.zip`}
            multiFileOutputs={batchProcessor.result.succeeded.map((s) => ({
              fileName: s.output.fileName,
              bytes: s.output.bytes,
            }))}
            savedFilePath={savedFilePath}
            onDismissSaveConfirmation={() => setSavedFilePath(null)}
            onSaveComplete={(savedPath) => setSavedFilePath(savedPath)}
            onCancel={() => setCurrentStep(2)}
            onBack={() => {
              setSavedFilePath(null);
              setCurrentStep(2);
            }}
          />
        )}
      </StepErrorBoundary>

      {/* Step 3: Save — PDF */}
      <StepErrorBoundary stepName="Save">
        {currentStep === 3 && pdfProcessor.result && fileEntry?.format === 'pdf' && (
          <SaveStep
            processedBytes={pdfProcessor.result.bytes}
            sourceFileName={fileEntry.name}
            sourcePath={fileEntry.path}
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
            // Only when the format is unchanged: a PNG cannot replace a JPG,
            // so converting still asks where to put the new file.
            sourcePath={
              detectImageFormat(fileEntry.name) === imageProcessor.result.outputFormat
                ? fileEntry.path
                : null
            }
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
  const { activeTool, editorFilePath, documentEpoch, openEditor, goToDashboard, selectTool, pendingFiles, setPendingFiles } = useToolContext();

  // Intercept edit-pdf tool: open file picker then redirect to new editor
  useEffect(() => {
    if (activeTool !== 'edit-pdf') return;

    // A file dropped on the dashboard has already been chosen. Asking for it
    // again is the complaint this fixes: the picking happened at the drag, and
    // this interception used to run before EditPdfFlow could look at
    // pendingFiles at all. openEditor clears activeTool, so this effect does not
    // re-enter and fall through to the picker below.
    if (pendingFiles.length > 0) {
      const dropped = pendingFiles[0];
      setPendingFiles([]);
      openEditor(dropped);
      return;
    }

    let cancelled = false;
    (async () => {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const result = await open({
        multiple: false,
        directory: false,
        filters: [{ name: t('filter.pdfFiles'), extensions: ['pdf'] }],
      });
      if (cancelled) return;
      if (typeof result === 'string') {
        openEditor(result);
      } else {
        goToDashboard();
      }
    })();
    return () => { cancelled = true; };
  }, [activeTool, openEditor, goToDashboard, pendingFiles, setPendingFiles]);

  // Listen for "file-opened" event from Tauri backend (file association / CLI arg)
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    // Cleanup can run before the dynamic import resolves — StrictMode mounts,
    // unmounts and remounts faster than the module loads. Without this flag the
    // first listener is never removed, and a file association fires twice.
    let cancelled = false;
    import('@tauri-apps/api/event')
      .then(({ listen }) =>
        listen<string>('file-opened', (event) => {
          if (event.payload && event.payload.endsWith('.pdf')) {
            openEditor(event.payload);
          }
        }),
      )
      .then((fn) => {
        if (cancelled) { fn(); return; }
        unlisten = fn;
      })
      .catch(() => {
        // Nothing to listen with; a floating rejection here would take the whole
        // app down in dev and tells the user nothing.
      });
    return () => {
      cancelled = true;
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
      <AppChrome />
      <UpdateChecker />
      {showDashboard && <FirstLaunchBanner />}
      {showEditor && <EditorView filePath={editorFilePath} />}
      {/* Keyed on the document session: every flow keeps its own step and bytes
          in local state and reads pendingFiles only once, so a flow already past
          step one would otherwise ignore a newly chosen file entirely. */}
      {showToolFlow && <ToolFlow key={documentEpoch} />}
      {showDashboard && <Dashboard />}
      {!showEditor && <PrivacyFooter />}
      {/* Clear of the action bar. A toast landing on the button that raised it
          covers the thing the user is about to press again, and on the merge
          screen it sat squarely over Save. 200px puts it above the bar with
          room to spare. */}
      <Toaster position="bottom-center" offset={200} mobileOffset={200} />
    </div>
  );
}

function App() {
  const [showSplash, setShowSplash] = useState(true);
  // Subscribes the root to the translation store. Components below call the
  // module-level t() with no hook of their own; this re-render is what makes
  // their strings update when the language changes. See i18n/context.tsx —
  // a <Provider>{children}</Provider> wrapper would not work here.
  useLocale();

  // Follow the OS language on first run, or the remembered choice after that.
  // Runs once: switching language later goes through the picker.
  useEffect(() => {
    void resolveInitialLocale().then(setLocale);
  }, []);

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
