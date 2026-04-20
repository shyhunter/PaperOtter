// WatermarkFlow: Orchestrates the watermark tool — Pick → Configure → Save.
import { useState, useCallback, useEffect, useRef } from 'react';
import { readFile } from '@tauri-apps/plugin-fs';
import { PDFDocument } from 'pdf-lib';
import { open } from '@tauri-apps/plugin-dialog';
import { FileUp, Loader2 } from 'lucide-react';
import { SaveStep } from '@/components/SaveStep';
import { StepErrorBoundary } from '@/components/ErrorBoundary';
import { Button } from '@/components/ui/button';
import { useToolContext } from '@/context/ToolContext';
import { friendlyPdfError } from '@/lib/pdfUtils';
import { addWatermark, DEFAULT_WATERMARK_OPTIONS } from '@/lib/pdfWatermark';
import { renderPdfThumbnail } from '@/lib/pdfThumbnail';
import { cn } from '@/lib/utils';
import type { WatermarkOptions } from '@/lib/pdfWatermark';

interface WatermarkFlowProps {
  onStepChange?: (step: number) => void;
}

type WatermarkColor = WatermarkOptions['color'];

const FONT_SIZES: { label: string; value: number }[] = [
  { label: 'Small', value: 24 },
  { label: 'Medium', value: 48 },
  { label: 'Large', value: 72 },
];

const ROTATIONS: { label: string; value: number }[] = [
  { label: '-45\u00B0', value: -45 },
  { label: '0\u00B0', value: 0 },
  { label: '45\u00B0', value: 45 },
];

const COLORS: { label: string; value: WatermarkColor; className: string }[] = [
  { label: 'Gray', value: 'gray', className: 'bg-gray-400' },
  { label: 'Red', value: 'red', className: 'bg-red-500' },
  { label: 'Blue', value: 'blue', className: 'bg-blue-600' },
];

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
  const [color, setColor] = useState<WatermarkColor>(DEFAULT_WATERMARK_OPTIONS.color);

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (initialFile) {
      loadFile(initialFile);
    }
  }, []);

  const handleSelectFile = useCallback(async () => {
    try {
      const result = await open({
        multiple: false,
        filters: [{ name: 'PDF Files', extensions: ['pdf'] }],
      });
      if (!result) return;
      const path = typeof result === 'string' ? result : result;
      await loadFile(path);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not open file picker.';
      setLoadError(message);
    }
  }, [loadFile]);

  // Generate preview thumbnail with current options (debounced)
  const generatePreview = useCallback(async () => {
    if (!pdfBytes || !text.trim()) {
      setPreviewUrl(null);
      return;
    }

    setIsGeneratingPreview(true);
    try {
      const options: WatermarkOptions = { text, fontSize, opacity, rotation, color };
      const watermarked = await addWatermark(pdfBytes, options);
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
      const options: WatermarkOptions = { text, fontSize, opacity, rotation, color };
      const result = await addWatermark(pdfBytes, options);
      setProcessedBytes(result);
      goToStep(2);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to apply watermark.';
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
              <h2 className="text-lg font-semibold text-foreground">Add Watermark</h2>
              <p className="text-sm text-muted-foreground">Select a PDF to add a text watermark.</p>

              {loadError && (
                <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3">
                  <p className="text-xs text-destructive">{loadError}</p>
                </div>
              )}

              <Button onClick={handleSelectFile} disabled={isLoadingFile} className="w-full">
                {isLoadingFile ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Loading...
                  </>
                ) : (
                  <>
                    <FileUp className="w-4 h-4 mr-2" />
                    Select PDF
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
              <div className="w-72 flex-none overflow-y-auto border-r border-border p-4 space-y-5">
                <h2 className="text-sm font-semibold text-foreground">Watermark Options</h2>

                {/* Text input */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Text</label>
                  <input
                    type="text"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Enter watermark text"
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>

                {/* Font size */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Font Size</label>
                  <div className="flex gap-1.5">
                    {FONT_SIZES.map((fs) => (
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
                    Opacity: {Math.round(opacity * 100)}%
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
                  <label className="text-xs font-medium text-muted-foreground">Rotation</label>
                  <div className="flex gap-1.5">
                    {ROTATIONS.map((r) => (
                      <button
                        key={r.value}
                        type="button"
                        onClick={() => setRotation(r.value)}
                        className={cn(
                          'flex-1 rounded-md border px-2 py-1.5 text-xs font-medium transition-colors',
                          rotation === r.value
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border text-muted-foreground hover:bg-accent',
                        )}
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Color */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Color</label>
                  <div className="flex gap-1.5">
                    {COLORS.map((c) => (
                      <button
                        key={c.value}
                        type="button"
                        onClick={() => setColor(c.value)}
                        className={cn(
                          'flex-1 flex items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-xs font-medium transition-colors',
                          color === c.value
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border text-muted-foreground hover:bg-accent',
                        )}
                      >
                        <span className={cn('inline-block h-2.5 w-2.5 rounded-full', c.className)} />
                        {c.label}
                      </button>
                    ))}
                  </div>
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
                    <p className="text-xs">Generating preview...</p>
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
                      alt="Watermark preview"
                      className="max-h-[60vh] rounded-md border border-border shadow-sm"
                    />
                  </div>
                )}
                {!previewUrl && !isGeneratingPreview && (
                  <p className="text-xs text-muted-foreground">
                    {text.trim() ? 'Preview will appear here' : 'Enter watermark text to see preview'}
                  </p>
                )}
              </div>
            </div>

            {/* Bottom bar */}
            <div className="border-t border-border bg-background px-4 py-3 flex items-center gap-3 flex-none">
              <Button variant="outline" size="sm" onClick={() => goToStep(0)} className="flex-none">
                Back
              </Button>
              <div className="flex-1" />
              <Button
                size="sm"
                onClick={handleApply}
                disabled={isProcessing || !text.trim()}
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Applying...
                  </>
                ) : (
                  'Apply Watermark'
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
