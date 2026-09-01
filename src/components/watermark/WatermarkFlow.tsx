// WatermarkFlow: Orchestrates the watermark tool — Pick → Configure → Save.
import { useState, useCallback, useEffect, useRef } from 'react';
import { readFile } from '@tauri-apps/plugin-fs';
import { PDFDocument } from 'pdf-lib';
import { open } from '@tauri-apps/plugin-dialog';
import { FileUp, Loader2, RotateCcw, RotateCw } from 'lucide-react';
import { SaveStep } from '@/components/SaveStep';
import { StepErrorBoundary } from '@/components/ErrorBoundary';
import { Button } from '@/components/ui/button';
import { useToolContext } from '@/context/ToolContext';
import { friendlyPdfError } from '@/lib/pdfUtils';
import { addWatermark, addWatermarkSinglePage, DEFAULT_WATERMARK_OPTIONS } from '@/lib/pdfWatermark';
import { renderPdfThumbnail } from '@/lib/pdfThumbnail';
import { turnWatermarkBy } from '@/lib/watermarkRotation';
import { cn } from '@/lib/utils';
import type { WatermarkOptions } from '@/lib/pdfWatermark';
import { ColorPicker } from '@/components/ColorPicker';
import { t } from '@/i18n';

interface WatermarkFlowProps {
  onStepChange?: (step: number) => void;
}

/**
 * A function, not a constant: these labels are translated, and a module-level
 * constant resolves them once at import -- before the locale is known.
 */
function fontSizes(): { label: string; value: number }[] {
  return [
    { label: t('watermarkFlow.small'), value: 24 },
    { label: t('watermarkFlow.medium'), value: 48 },
    { label: t('watermarkFlow.large'), value: 72 },
  ];
}

export function WatermarkFlow({ onStepChange }: WatermarkFlowProps) {
  const { pendingFiles, setPendingFiles } = useToolContext();
  const [step, setStep] = useState(0);
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [fileName, setFileName] = useState('');
  const [savedFilePath, setSavedFilePath] = useState<string | null>(null);
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Watermark options state
  const [text, setText] = useState(DEFAULT_WATERMARK_OPTIONS.text);
  const [fontSize, setFontSize] = useState(DEFAULT_WATERMARK_OPTIONS.fontSize);
  const [opacity, setOpacity] = useState(DEFAULT_WATERMARK_OPTIONS.opacity);
  const [rotation, setRotation] = useState(DEFAULT_WATERMARK_OPTIONS.rotation);
  const [color, setColor] = useState(DEFAULT_WATERMARK_OPTIONS.color);

  // Preview state
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isGeneratingPreview, setIsGeneratingPreview] = useState(false);
  const previewDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Processing state
  const [isProcessing, setIsProcessing] = useState(false);
  const [processedBytes, setProcessedBytes] = useState<Uint8Array | null>(null);
  const [processError, setProcessError] = useState<string | null>(null);

  const goToStep = useCallback((s: number) => {
    setStep(s);
    onStepChange?.(s);
  }, [onStepChange]);

  // Consume pending file
  const initialFile = pendingFiles.length > 0 ? pendingFiles[0] : null;
  if (pendingFiles.length > 0) {
    setPendingFiles([]);
  }

  const loadFile = useCallback(async (filePath: string) => {
    setIsLoadingFile(true);
    setLoadError(null);
    try {
      const bytes = await readFile(filePath);
      // Validate it is a real PDF
      await PDFDocument.load(bytes, { ignoreEncryption: true });
      const name = filePath.split('/').pop() ?? filePath.split('\\').pop() ?? filePath;
      setPdfBytes(bytes);
      setFileName(name);
      goToStep(1);
    } catch (err) {
      setLoadError(friendlyPdfError(err));
    } finally {
      setIsLoadingFile(false);
    }
  }, [goToStep]);

  // Auto-load initial file on mount

  useEffect(() => {
    if (initialFile) {
      loadFile(initialFile);
    }
  }, [initialFile, loadFile]);

  const handleSelectFile = useCallback(async () => {
    try {
      const result = await open({
        multiple: false,
        filters: [{ name: t('filter.pdfFiles'), extensions: ['pdf'] }],
      });
      if (!result) return;
      const path = typeof result === 'string' ? result : result;
      await loadFile(path);
    } catch (err) {
      const message = err instanceof Error ? err.message : t('app.couldNotOpenFilePicker');
      setLoadError(message);
    }
  }, [loadFile]);

  // Generate preview thumbnail with current options (debounced).
  // Only processes the first page — running the full watermark pass on every
  // option change freezes the UI on large documents (hundreds of pages).
  const generatePreview = useCallback(async () => {
    if (!pdfBytes || !text.trim()) {
      setPreviewUrl(null);
      return;
    }

    setIsGeneratingPreview(true);
    try {
      const options: WatermarkOptions = { ...DEFAULT_WATERMARK_OPTIONS, text, fontSize, opacity, rotation, color };
      const watermarked = await addWatermarkSinglePage(pdfBytes, options, 0);
      const url = await renderPdfThumbnail(watermarked, 0.5);
      setPreviewUrl(url);
    } catch {
      setPreviewUrl(null);
    } finally {
      setIsGeneratingPreview(false);
    }
  }, [pdfBytes, text, fontSize, opacity, rotation, color]);

  // Debounce preview generation when options change
  useEffect(() => {
    if (step !== 1) return;
    if (previewDebounceRef.current) {
      clearTimeout(previewDebounceRef.current);
    }
    previewDebounceRef.current = setTimeout(() => {
      generatePreview();
    }, 400);
    return () => {
      if (previewDebounceRef.current) {
        clearTimeout(previewDebounceRef.current);
      }
    };
  }, [step, generatePreview]);

  // Apply watermark to all pages
  const handleApply = useCallback(async () => {
    if (!pdfBytes || !text.trim()) return;

    setIsProcessing(true);
    setProcessError(null);
    try {
      const options: WatermarkOptions = { ...DEFAULT_WATERMARK_OPTIONS, text, fontSize, opacity, rotation, color };
      const result = await addWatermark(pdfBytes, options);
      setProcessedBytes(result);
      goToStep(2);
    } catch (err) {
      const message = err instanceof Error ? err.message : t('watermarkFlow.failedToApplyWatermark');
      setProcessError(message);
    } finally {
      setIsProcessing(false);
    }
  }, [pdfBytes, text, fontSize, opacity, rotation, color, goToStep]);

  return (
    <>
      <StepErrorBoundary stepName="Watermark">
        {/* Step 0: Pick file */}
        {step === 0 && (
          <div className="flex flex-1 flex-col items-center justify-center p-6">
            <div className="w-full max-w-sm space-y-4 text-center">
              <h2 className="text-lg font-semibold text-foreground">{t('watermark.addWatermark')}</h2>
              <p className="text-sm text-muted-foreground">{t('watermark.selectAPdfToAdd')}</p>

              {loadError && (
                <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3">
                  <p className="text-xs text-destructive">{loadError}</p>
                </div>
              )}

              <Button onClick={handleSelectFile} disabled={isLoadingFile} className="w-full">
                {isLoadingFile ? (
                  <>
                    <Loader2 className="w-4 h-4 me-2 animate-spin" />
                    {t('common.loading')}
                  </>
                ) : (
                  <>
                    <FileUp className="w-4 h-4 me-2" />
                    {t('pdfToJpg.selectPdf')}
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Step 1: Configure watermark */}
        {step === 1 && pdfBytes && (
          <div className="flex flex-1 flex-col overflow-hidden">
            <div className="flex flex-1 overflow-hidden">
              {/* Left panel: options */}
              <div className="w-72 flex-none overflow-y-auto border-e border-border p-4 space-y-5">
                <h2 className="text-sm font-semibold text-foreground">{t('watermark.watermarkOptions')}</h2>

                {/* Text input */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">{t('watermark.text')}</label>
                  <input
                    type="text"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder={t('watermark.enterWatermarkText')}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>

                {/* Font size */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">{t('common.fontSize')}</label>
                  <div className="flex gap-1.5">
                    {fontSizes().map((fs) => (
                      <button
                        key={fs.value}
                        type="button"
                        onClick={() => setFontSize(fs.value)}
                        className={cn(
                          'flex-1 rounded-md border px-2 py-1.5 text-xs font-medium transition-colors',
                          fontSize === fs.value
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border text-muted-foreground hover:bg-accent',
                        )}
                      >
                        {fs.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Opacity slider */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">
                    {t('toolSidebarPanel.opacity', { percent: Math.round(opacity * 100) })}
                  </label>
                  <input
                    type="range"
                    min="0.1"
                    max="1.0"
                    step="0.05"
                    value={opacity}
                    onChange={(e) => setOpacity(parseFloat(e.target.value))}
                    className="w-full accent-primary"
                  />
                </div>

                {/* Rotation */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">{t('rotateImage.rotation')}</label>
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => setRotation((r) => turnWatermarkBy(r, 'left'))}
                      title={t('toolSidebarPanel.turnLeft')}
                      aria-label={t('toolSidebarPanel.turnLeft')}
                    >
                      <RotateCcw className="w-4 h-4" />
                    </Button>
                    <span
                      data-testid="watermark-rotation-value"
                      className="w-14 text-center text-xs font-medium tabular-nums"
                    >
                      {rotation}°
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => setRotation((r) => turnWatermarkBy(r, 'right'))}
                      title={t('toolSidebarPanel.turnRight')}
                      aria-label={t('toolSidebarPanel.turnRight')}
                    >
                      <RotateCw className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                {/* Color */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">{t('watermark.color')}</label>
                  <ColorPicker value={color} onChange={setColor} />
                </div>

                {/* Process error */}
                {processError && (
                  <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2">
                    <p className="text-xs text-destructive">{processError}</p>
                  </div>
                )}
              </div>

              {/* Right panel: preview */}
              <div className="flex-1 flex flex-col items-center justify-center overflow-auto p-4 bg-muted/30">
                {isGeneratingPreview && !previewUrl && (
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Loader2 className="w-6 h-6 animate-spin" />
                    <p className="text-xs">{t('common.generatingPreview')}</p>
                  </div>
                )}
                {previewUrl && (
                  <div className="relative">
                    {isGeneratingPreview && (
                      <div className="absolute inset-0 flex items-center justify-center bg-background/50 rounded-md">
                        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                      </div>
                    )}
                    <img
                      src={previewUrl}
                      alt={t('watermark.watermarkPreview')}
                      className="max-h-[60vh] rounded-md border border-border shadow-sm"
                    />
                  </div>
                )}
                {!previewUrl && !isGeneratingPreview && (
                  <p className="text-xs text-muted-foreground">
                    {text.trim() ? t('common.previewWillAppearHere') : t('watermarkFlow.enterWatermarkTextToSee')}
                  </p>
                )}
              </div>
            </div>

            {/* Bottom bar */}
            <div className="border-t border-border bg-background px-4 py-3 flex items-center gap-3 flex-none">
              <Button variant="outline" size="sm" onClick={() => goToStep(0)} className="flex-none">
                {t('common.back')}
              </Button>
              <div className="flex-1" />
              <Button
                size="sm"
                onClick={handleApply}
                disabled={isProcessing || !text.trim()}
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 me-2 animate-spin" />
                    {t('common.applying')}
                  </>
                ) : (
                  t('watermarkFlow.applyWatermark')
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
            defaultSaveName={fileName.replace(/\.pdf$/i, '') + '-watermarked.pdf'}
            savedFilePath={savedFilePath}
            onDismissSaveConfirmation={() => setSavedFilePath(null)}
            onSaveComplete={(path) => setSavedFilePath(path)}
            onCancel={() => goToStep(1)}
            onBack={() => {
              setSavedFilePath(null);
              goToStep(1);
            }}
          />
        )}
      </StepErrorBoundary>
    </>
  );
}
