// CropPdfFlow: Pick PDF → Set crop margins → Save cropped PDF.
import { useState, useCallback, useEffect } from 'react';
import { getFileName } from '@/lib/fileValidation';
import { readFile } from '@tauri-apps/plugin-fs';
import { encryptedPdfRefusal } from '@/lib/pdfEncryption';
import { PDFDocument } from 'pdf-lib';
import { SaveStep } from '@/components/SaveStep';
import { StepErrorBoundary } from '@/components/ErrorBoundary';
import { Button } from '@/components/ui/button';
import { friendlyPdfError } from '@/lib/pdfUtils';
import { cropPdf, mmToPoints, pointsToMm } from '@/lib/pdfCrop';
import { renderPdfThumbnail } from '@/lib/pdfThumbnail';
import { cn } from '@/lib/utils';
import { t } from '@/i18n';
import { cropMarginPresets } from '@/lib/cropPresets';
import { OtterLoader } from '@/components/brand/OtterLoader';
import { OtterSpinner } from '@/components/brand/OtterSpinner';
import { PRIMARY_ACTION } from '@/components/ui/primaryAction';
import { FilePickStep } from '@/components/FilePickStep';

/**
 * A function, not a constant: these labels are translated, and a module-level
 * constant resolves them once at import -- before the locale is known.
 */
/** Bytes as the rest of the app writes them. */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

interface CropPdfFlowProps {
  onStepChange?: (step: number) => void;
}

export function CropPdfFlow({ onStepChange }: CropPdfFlowProps) {
  const [step, setStep] = useState(0);

  const goToStep = useCallback((s: number) => {
    setStep(s);
    onStepChange?.(s);
  }, [onStepChange]);
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [fileName, setFileName] = useState('');
  // The file this flow opened. Save writes back to it; Save as... writes a copy.
  const [sourcePath, setSourcePath] = useState<string | null>(null);
  const [pageWidth, setPageWidth] = useState(0); // in points
  const [pageHeight, setPageHeight] = useState(0);
  const [savedFilePath, setSavedFilePath] = useState<string | null>(null);
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Crop margins in mm
  const [topMm, setTopMm] = useState(0);
  const [bottomMm, setBottomMm] = useState(0);
  const [leftMm, setLeftMm] = useState(0);
  const [rightMm, setRightMm] = useState(0);
  const [equalMargins, setEqualMargins] = useState(false);

  // Preview
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  // Processing
  const [isProcessing, setIsProcessing] = useState(false);
  const [processedBytes, setProcessedBytes] = useState<Uint8Array | null>(null);
  const [processError, setProcessError] = useState<string | null>(null);

  // StrictMode guard

  const loadFile = useCallback(async (filePath: string) => {
    setIsLoadingFile(true);
    setLoadError(null);
    try {
      const bytes = await readFile(filePath);
      // A locked PDF loads fine under `ignoreEncryption` and reports its real
      // page count, so without this the tool opens and then renders nothing.
      const refusal = await encryptedPdfRefusal(bytes);
      if (refusal) { setLoadError(refusal); return; }
      const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const firstPage = doc.getPage(0);
      const { width, height } = firstPage.getSize();
      const name = getFileName(filePath);
      setPdfBytes(bytes);
      setFileName(name);
      setSourcePath(filePath);
      setPageWidth(width);
      setPageHeight(height);
      goToStep(1);
    } catch (err) {
      setLoadError(friendlyPdfError(err));
    } finally {
      setIsLoadingFile(false);
    }
  }, [goToStep]);



  // Equal margins sync
  const setMargin = useCallback((side: 'top' | 'bottom' | 'left' | 'right', value: number) => {
    const v = Math.max(0, value);
    if (equalMargins) {
      setTopMm(v); setBottomMm(v); setLeftMm(v); setRightMm(v);
    } else {
      switch (side) {
        case 'top': setTopMm(v); break;
        case 'bottom': setBottomMm(v); break;
        case 'left': setLeftMm(v); break;
        case 'right': setRightMm(v); break;
      }
    }
  }, [equalMargins]);

  const applyPreset = useCallback((mm: number) => {
    setTopMm(mm); setBottomMm(mm); setLeftMm(mm); setRightMm(mm);
  }, []);

  // Generate preview (with original + overlay approach)
  useEffect(() => {
    if (!pdfBytes || step !== 1) return;
    let cancelled = false;
    setIsLoadingPreview(true);

    renderPdfThumbnail(pdfBytes, 0.5)
      .then((url) => { if (!cancelled) setPreviewUrl(url); })
      .catch(() => { if (!cancelled) setPreviewUrl(null); })
      .finally(() => { if (!cancelled) setIsLoadingPreview(false); });

    return () => { cancelled = true; };
  }, [pdfBytes, step]);

  const handleApply = useCallback(async () => {
    if (!pdfBytes) return;
    setIsProcessing(true);
    setProcessError(null);
    try {
      const margins = {
        top: mmToPoints(topMm),
        bottom: mmToPoints(bottomMm),
        left: mmToPoints(leftMm),
        right: mmToPoints(rightMm),
      };
      const result = await cropPdf(pdfBytes, margins);
      setProcessedBytes(result);
      goToStep(2);
    } catch (err) {
      const message = err instanceof Error ? err.message : t('cropPdfFlow.cropFailed');
      setProcessError(message);
    } finally {
      setIsProcessing(false);
    }
  }, [pdfBytes, topMm, bottomMm, leftMm, rightMm, goToStep]);

  // Calculate overlay percentages for visual crop indicator
  const topPct = pageHeight > 0 ? (mmToPoints(topMm) / pageHeight) * 100 : 0;
  const bottomPct = pageHeight > 0 ? (mmToPoints(bottomMm) / pageHeight) * 100 : 0;
  const leftPct = pageWidth > 0 ? (mmToPoints(leftMm) / pageWidth) * 100 : 0;
  const rightPct = pageWidth > 0 ? (mmToPoints(rightMm) / pageWidth) * 100 : 0;
  const hasCrop = topMm > 0 || bottomMm > 0 || leftMm > 0 || rightMm > 0;

  return (
    <>
      <StepErrorBoundary stepName="Crop PDF">
        {/* Step 0: Pick */}
        {step === 0 && (
          <FilePickStep
            acceptedFormats={['pdf']}
            tagline={t('cropPdf.selectAPdfToCrop')}
            onFileReady={loadFile}
            isLoading={isLoadingFile}
            error={loadError}
          />
        )}

        {/* Step 1: Configure crop */}
        {step === 1 && pdfBytes && (
          <div className="flex flex-1 flex-col overflow-hidden">
            <div className="flex flex-1 overflow-hidden">
              {/* Left panel: margin inputs */}
              <div className="w-72 flex-none overflow-y-auto border-e border-border p-4 space-y-5">
                <h2 className="text-sm font-semibold text-foreground">{t('cropPdf.cropMargins')}</h2>
                {/* Which document this is. Every other tool names the file it
                    is working on; Crop showed only a page size, so a second
                    window of the same tool was indistinguishable from the first. */}
                <p data-testid="crop-file-name" className="truncate text-xs font-medium text-foreground" title={fileName}>
                  {fileName}
                </p>
                <p className="text-xs text-muted-foreground">{formatBytes(pdfBytes?.byteLength ?? 0)}</p>

                {/* Page dimensions info */}
                <p className="text-xs text-muted-foreground">
                  {t('cropPdfFlow.pageSizeMm', { width: Math.round(pointsToMm(pageWidth)), height: Math.round(pointsToMm(pageHeight)) })}
                </p>

                {/* Presets */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">{t('imageConfigure.presets')}</label>
                  <div className="flex gap-1.5">
                    {cropMarginPresets().map((p) => (
                      <button
                        key={p.label}
                        type="button"
                        onClick={() => applyPreset(p.mm)}
                        className={cn(
                          'flex-1 rounded-md border px-2 py-1.5 text-xs font-medium transition-colors',
                          topMm === p.mm && bottomMm === p.mm && leftMm === p.mm && rightMm === p.mm
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border text-muted-foreground hover:bg-accent',
                        )}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Equal margins toggle */}
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={equalMargins}
                    onChange={(e) => {
                      setEqualMargins(e.target.checked);
                      if (e.target.checked) {
                        setBottomMm(topMm); setLeftMm(topMm); setRightMm(topMm);
                      }
                    }}
                    className="accent-primary"
                  />
                  <span className="text-xs text-muted-foreground">{t('cropPdf.equalMargins')}</span>
                </label>

                {/* Margin inputs */}
                {(['top', 'bottom', 'left', 'right'] as const).map((side) => {
                  const value = { top: topMm, bottom: bottomMm, left: leftMm, right: rightMm }[side];
                  return (
                    <div key={side} className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground capitalize">{side} (mm)</label>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={value}
                        onChange={(e) => setMargin(side, parseFloat(e.target.value) || 0)}
                        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                    </div>
                  );
                })}

                {processError && (
                  <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2">
                    <p className="text-xs text-destructive">{processError}</p>
                  </div>
                )}
              </div>

              {/* Right panel: preview with crop overlay */}
              <div className="flex-1 flex flex-col items-center justify-center overflow-auto p-4 bg-muted/30">
                {isLoadingPreview && !previewUrl && (
                  <OtterLoader size="md" label={t('cropPdf.loadingPreview')} />
                )}
                {previewUrl && (
                  <div className="relative inline-block">
                    <img
                      src={previewUrl}
                      alt={t('cropPdf.cropPreview')}
                      className="max-h-[60vh] rounded-md border border-border shadow-sm"
                    />
                    {/* Crop overlay */}
                    {hasCrop && (
                      <>
                        <div className="absolute top-0 start-0 end-0 bg-red-500/20 pointer-events-none rounded-t-md" style={{ height: `${Math.min(topPct, 100)}%` }} />
                        <div className="absolute bottom-0 start-0 end-0 bg-red-500/20 pointer-events-none rounded-b-md" style={{ height: `${Math.min(bottomPct, 100)}%` }} />
                        <div className="absolute top-0 start-0 bottom-0 bg-red-500/20 pointer-events-none rounded-s-md" style={{ width: `${Math.min(leftPct, 100)}%` }} />
                        <div className="absolute top-0 end-0 bottom-0 bg-red-500/20 pointer-events-none rounded-e-md" style={{ width: `${Math.min(rightPct, 100)}%` }} />
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Bottom bar */}
            <div className="border-t border-border bg-background px-4 py-3 flex items-center gap-3 flex-none">
              <Button variant="outline" size="sm" onClick={() => goToStep(0)} className="flex-none">
                {t('common.back')}
              </Button>
              <Button data-testid="apply-btn" size="sm" onClick={handleApply} disabled={isProcessing || !hasCrop}
          className={PRIMARY_ACTION}
        >
                {isProcessing ? (
                  <><OtterSpinner className="size-4" />{t('cropPdf.cropping')}</>
                ) : (
                  t('cropPdfFlow.applyCrop')
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: Save */}
        {step === 2 && processedBytes && (
          <SaveStep
            sourcePath={sourcePath}
            processedBytes={processedBytes}
            sourceFileName={fileName}
            defaultSaveName={fileName.replace(/\.pdf$/i, '') + '-cropped.pdf'}
            savedFilePath={savedFilePath}
            onDismissSaveConfirmation={() => setSavedFilePath(null)}
            onSaveComplete={(path) => setSavedFilePath(path)}
            onCancel={() => goToStep(1)}
            onBack={() => { setSavedFilePath(null); goToStep(1); }}
          />
        )}
      </StepErrorBoundary>
    </>
  );
}
