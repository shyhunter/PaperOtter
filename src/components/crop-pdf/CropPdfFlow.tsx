// CropPdfFlow: Pick PDF → Set crop margins → Save cropped PDF.
import { useState, useCallback, useEffect, useRef } from 'react';
import { readFile } from '@tauri-apps/plugin-fs';
import { PDFDocument } from 'pdf-lib';
import { open } from '@tauri-apps/plugin-dialog';
import { FileUp, Loader2 } from 'lucide-react';
import { SaveStep } from '@/components/SaveStep';
import { StepErrorBoundary } from '@/components/ErrorBoundary';
import { Button } from '@/components/ui/button';
import { useToolContext } from '@/context/ToolContext';
import { cropPdf, mmToPoints, pointsToMm } from '@/lib/pdfCrop';
import { renderPdfThumbnail } from '@/lib/pdfThumbnail';
import { cn } from '@/lib/utils';

const MARGIN_PRESETS: { label: string; mm: number }[] = [
  { label: 'None', mm: 0 },
  { label: 'Small', mm: 5 },
  { label: 'Medium', mm: 10 },
  { label: 'Large', mm: 20 },
];

export function CropPdfFlow() {
  const { pendingFiles, setPendingFiles } = useToolContext();
  const [step, setStep] = useState(0);
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [fileName, setFileName] = useState('');
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
  const consumedRef = useRef(false);
  const initialFile = pendingFiles.length > 0 ? pendingFiles[0] : null;
  if (pendingFiles.length > 0 && !consumedRef.current) {
    consumedRef.current = true;
    setPendingFiles([]);
  }

  const loadFile = useCallback(async (filePath: string) => {
    setIsLoadingFile(true);
    setLoadError(null);
    try {
      const bytes = await readFile(filePath);
      const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const firstPage = doc.getPage(0);
      const { width, height } = firstPage.getSize();
      const name = filePath.split('/').pop() ?? filePath.split('\\').pop() ?? filePath;
      setPdfBytes(bytes);
      setFileName(name);
      setPageWidth(width);
      setPageHeight(height);
      setStep(1);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load PDF.';
      setLoadError(message);
    } finally {
      setIsLoadingFile(false);
    }
  }, []);

  useEffect(() => {
    if (initialFile) loadFile(initialFile);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelectFile = useCallback(async () => {
    try {
      const result = await open({
        multiple: false,
        filters: [{ name: 'PDF Files', extensions: ['pdf'] }],
      });
      if (!result) return;
      await loadFile(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not open file picker.';
      setLoadError(message);
    }
  }, [loadFile]);

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
      setStep(2);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Crop failed.';
      setProcessError(message);
    } finally {
      setIsProcessing(false);
    }
  }, [pdfBytes, topMm, bottomMm, leftMm, rightMm]);

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
          <div className="flex flex-1 flex-col items-center justify-center p-6">
            <div className="w-full max-w-sm space-y-4 text-center">
              <h2 className="text-lg font-semibold text-foreground">Crop PDF</h2>
              <p className="text-sm text-muted-foreground">Select a PDF to crop margins.</p>
              {loadError && (
                <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3">
                  <p className="text-xs text-destructive">{loadError}</p>
                </div>
              )}
              <Button onClick={handleSelectFile} disabled={isLoadingFile} className="w-full">
                {isLoadingFile ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Loading...</>
                ) : (
                  <><FileUp className="w-4 h-4 mr-2" />Select PDF</>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Step 1: Configure crop */}
        {step === 1 && pdfBytes && (
          <div className="flex flex-1 flex-col overflow-hidden">
            <div className="flex flex-1 overflow-hidden">
              {/* Left panel: margin inputs */}
              <div className="w-72 flex-none overflow-y-auto border-r border-border p-4 space-y-5">
                <h2 className="text-sm font-semibold text-foreground">Crop Margins</h2>

                {/* Page dimensions info */}
                <p className="text-xs text-muted-foreground">
                  Page size: {Math.round(pointsToMm(pageWidth))} × {Math.round(pointsToMm(pageHeight))} mm
                </p>

                {/* Presets */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Presets</label>
                  <div className="flex gap-1.5">
                    {MARGIN_PRESETS.map((p) => (
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
                  <span className="text-xs text-muted-foreground">Equal margins</span>
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
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Loader2 className="w-6 h-6 animate-spin" />
                    <p className="text-xs">Loading preview...</p>
                  </div>
                )}
                {previewUrl && (
                  <div className="relative inline-block">
                    <img
                      src={previewUrl}
                      alt="Crop preview"
                      className="max-h-[60vh] rounded-md border border-border shadow-sm"
                    />
                    {/* Crop overlay */}
                    {hasCrop && (
                      <>
                        <div className="absolute top-0 left-0 right-0 bg-red-500/20 pointer-events-none rounded-t-md" style={{ height: `${Math.min(topPct, 100)}%` }} />
                        <div className="absolute bottom-0 left-0 right-0 bg-red-500/20 pointer-events-none rounded-b-md" style={{ height: `${Math.min(bottomPct, 100)}%` }} />
                        <div className="absolute top-0 left-0 bottom-0 bg-red-500/20 pointer-events-none rounded-l-md" style={{ width: `${Math.min(leftPct, 100)}%` }} />
                        <div className="absolute top-0 right-0 bottom-0 bg-red-500/20 pointer-events-none rounded-r-md" style={{ width: `${Math.min(rightPct, 100)}%` }} />
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Bottom bar */}
            <div className="border-t border-border bg-background px-4 py-3 flex items-center gap-3 flex-none">
              <Button variant="outline" size="sm" onClick={() => setStep(0)} className="flex-none">
                Back
              </Button>
              <div className="flex-1" />
              <Button size="sm" onClick={handleApply} disabled={isProcessing || !hasCrop}>
                {isProcessing ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Cropping...</>
                ) : (
                  'Apply Crop'
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: Save */}
        {step === 2 && processedBytes && (
          <SaveStep
            processedBytes={processedBytes}
            sourceFileName={fileName}
            defaultSaveName={fileName.replace(/\.pdf$/i, '') + '-cropped.pdf'}
            savedFilePath={savedFilePath}
            onDismissSaveConfirmation={() => setSavedFilePath(null)}
            onSaveComplete={(path) => setSavedFilePath(path)}
            onCancel={() => setStep(1)}
            onBack={() => { setSavedFilePath(null); setStep(1); }}
          />
        )}
      </StepErrorBoundary>
    </>
  );
}
