import { useState, useCallback, useEffect, useRef } from 'react';
import { readFile } from '@tauri-apps/plugin-fs';
import { open } from '@tauri-apps/plugin-dialog';
import { FileUp, Loader2, RotateCcw, RotateCw } from 'lucide-react';
import { SaveStep } from '@/components/SaveStep';
import { StepErrorBoundary } from '@/components/ErrorBoundary';
import { Button } from '@/components/ui/button';
import { useToolContext } from '@/context/ToolContext';
import { rotateImage } from '@/lib/imageRotate';
import { cn } from '@/lib/utils';
import type { ImageRotation } from '@/lib/imageRotate';
import type { ImageOutputFormat } from '@/types/file';

const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'];

const FORMAT_LABELS: Record<ImageOutputFormat, string> = {
  jpeg: 'JPG',
  png: 'PNG',
  webp: 'WebP',
};

const FORMATS: ImageOutputFormat[] = ['jpeg', 'png', 'webp'];

function detectFormatFromPath(filePath: string): ImageOutputFormat {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'png') return 'png';
  if (ext === 'webp') return 'webp';
  return 'jpeg';
}

function buildSaveName(sourceFileName: string, outputFormat: ImageOutputFormat): string {
  const base = sourceFileName.replace(/\.(jpe?g|png|webp)$/i, '');
  const ext = outputFormat === 'jpeg' ? 'jpg' : outputFormat;
  return `${base}-rotated.${ext}`;
}

function buildSaveFilters(outputFormat: ImageOutputFormat): Array<{ name: string; extensions: string[] }> {
  switch (outputFormat) {
    case 'jpeg': return [{ name: 'JPEG Image', extensions: ['jpg', 'jpeg'] }];
    case 'png':  return [{ name: 'PNG Image',  extensions: ['png'] }];
    case 'webp': return [{ name: 'WebP Image', extensions: ['webp'] }];
  }
}

export function RotateImageFlow() {
  const { pendingFiles, setPendingFiles } = useToolContext();
  const [step, setStep] = useState(0);
  const [filePath, setFilePath] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [rotation, setRotation] = useState<ImageRotation>(90);
  const [outputFormat, setOutputFormat] = useState<ImageOutputFormat>('jpeg');
  const [quality, setQuality] = useState(80);
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [processError, setProcessError] = useState<string | null>(null);
  const [resultBytes, setResultBytes] = useState<Uint8Array | null>(null);
  const [savedFilePath, setSavedFilePath] = useState<string | null>(null);

  // StrictMode guard
  const consumedPending = useRef(false);

  // Consume pending file on mount
  const initialFile = (!consumedPending.current && pendingFiles.length > 0) ? pendingFiles[0] : null;
  if (!consumedPending.current && pendingFiles.length > 0) {
    consumedPending.current = true;
    setPendingFiles([]);
  }

  const loadFile = useCallback(async (path: string) => {
    setIsLoadingFile(true);
    setLoadError(null);
    try {
      const bytes = await readFile(path);
      // Create preview URL from bytes
      const blob = new Blob([bytes]);
      const bitmap = await createImageBitmap(blob);
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(bitmap, 0, 0);
      const url = canvas.toDataURL();
      bitmap.close();

      const name = path.split('/').pop() ?? path.split('\\').pop() ?? path;
      setFilePath(path);
      setFileName(name);
      setPreviewUrl(url);
      setOutputFormat(detectFormatFromPath(path));
      setStep(1);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load image.';
      setLoadError(message);
    } finally {
      setIsLoadingFile(false);
    }
  }, []);

  // Auto-load initial file
  useEffect(() => {
    if (initialFile) {
      loadFile(initialFile);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelectFile = useCallback(async () => {
    try {
      const result = await open({
        multiple: false,
        filters: [{ name: 'Image Files', extensions: IMAGE_EXTENSIONS }],
      });
      if (!result) return;
      await loadFile(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not open file picker.';
      setLoadError(message);
    }
  }, [loadFile]);

  const handleRotateLeft = useCallback(() => {
    setRotation((prev) => {
      if (prev === 90) return 270;
      if (prev === 180) return 90;
      return 180;
    });
  }, []);

  const handleRotateRight = useCallback(() => {
    setRotation((prev) => {
      if (prev === 90) return 180;
      if (prev === 180) return 270;
      return 90;
    });
  }, []);

  const handleApply = useCallback(async () => {
    if (!filePath) return;
    setIsProcessing(true);
    setProcessError(null);
    try {
      const bytes = await rotateImage(filePath, rotation, outputFormat, quality);
      setResultBytes(new Uint8Array(bytes));
      setStep(2);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Rotation failed.';
      setProcessError(message);
    } finally {
      setIsProcessing(false);
    }
  }, [filePath, rotation, outputFormat, quality]);

  const showQualitySlider = outputFormat !== 'png';

  return (
    <>
      <StepErrorBoundary stepName="Rotate Image">
        {/* Step 0: Pick file */}
        {step === 0 && (
          <div className="flex flex-1 flex-col items-center justify-center p-6">
            <div className="w-full max-w-sm space-y-4 text-center">
              <h2 className="text-lg font-semibold text-foreground">Rotate Image</h2>
              <p className="text-sm text-muted-foreground">Select an image to rotate 90, 180, or 270 degrees.</p>

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
                    Select Image
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Step 1: Rotate configuration */}
        {step === 1 && previewUrl && (
          <div className="flex flex-1 flex-col items-center overflow-y-auto p-6">
            <div className="w-full max-w-md space-y-4 my-auto">
              {/* File name */}
              <div className="text-center">
                <p className="text-sm font-medium text-foreground truncate">{fileName}</p>
              </div>

              {/* Image preview with CSS rotation */}
              <div className="flex items-center justify-center rounded-lg border border-border bg-card p-4 overflow-hidden">
                <img
                  src={previewUrl}
                  alt="Preview"
                  className="max-h-48 max-w-full object-contain transition-transform duration-300"
                  style={{ transform: `rotate(${rotation}deg)` }}
                />
              </div>

              {/* Rotation buttons */}
              <div className="rounded-lg border border-border bg-card p-4 space-y-3">
                <p className="text-xs text-muted-foreground">Rotation</p>
                <div className="flex items-center justify-center gap-3">
                  <Button variant="outline" size="sm" onClick={handleRotateLeft} disabled={isProcessing}>
                    <RotateCcw className="w-4 h-4 mr-1.5" />
                    Left 90
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setRotation(180)}
                    disabled={isProcessing}
                  >
                    180
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleRotateRight} disabled={isProcessing}>
                    Right 90
                    <RotateCw className="w-4 h-4 ml-1.5" />
                  </Button>
                </div>
                <p className="text-center text-xs text-muted-foreground">
                  Current: {rotation} degrees clockwise
                </p>
              </div>

              {/* Output format */}
              <div className="rounded-lg border border-border bg-card p-4 space-y-3">
                <p className="text-xs text-muted-foreground">Output format</p>
                <div className="grid grid-cols-3 gap-1">
                  {FORMATS.map((fmt) => (
                    <button
                      key={fmt}
                      type="button"
                      onClick={() => setOutputFormat(fmt)}
                      disabled={isProcessing}
                      className={cn(
                        'rounded-md border px-3 py-1.5 text-xs font-medium transition-colors',
                        'disabled:cursor-not-allowed disabled:opacity-50',
                        outputFormat === fmt
                          ? 'border-primary bg-primary/5 text-foreground'
                          : 'border-border text-muted-foreground hover:border-primary/50',
                      )}
                    >
                      {FORMAT_LABELS[fmt]}
                    </button>
                  ))}
                </div>

                {/* Quality slider (JPG/WebP only) */}
                {showQualitySlider && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs text-muted-foreground">Quality</label>
                      <span className="text-xs font-medium text-foreground tabular-nums">{quality}%</span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="100"
                      step="1"
                      value={quality}
                      onChange={(e) => setQuality(Number(e.target.value))}
                      disabled={isProcessing}
                      className="w-full accent-primary disabled:opacity-50"
                    />
                  </div>
                )}
              </div>

              {/* Error */}
              {processError && (
                <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {processError}
                </p>
              )}

              {/* Actions */}
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setStep(0);
                    setPreviewUrl(null);
                    setFilePath(null);
                    setFileName('');
                  }}
                  disabled={isProcessing}
                  className="flex-none"
                >
                  Back
                </Button>
                <Button
                  size="sm"
                  onClick={handleApply}
                  disabled={isProcessing}
                  className="flex-1"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Rotating...
                    </>
                  ) : (
                    'Apply & Save'
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Save */}
        {step === 2 && resultBytes && (
          <SaveStep
            processedBytes={resultBytes}
            sourceFileName={fileName}
            defaultSaveName={buildSaveName(fileName, outputFormat)}
            saveFilters={buildSaveFilters(outputFormat)}
            savedFilePath={savedFilePath}
            onDismissSaveConfirmation={() => setSavedFilePath(null)}
            onSaveComplete={(path) => setSavedFilePath(path)}
            onCancel={() => setStep(1)}
            onBack={() => {
              setSavedFilePath(null);
              setStep(1);
            }}
          />
        )}
      </StepErrorBoundary>
    </>
  );
}
