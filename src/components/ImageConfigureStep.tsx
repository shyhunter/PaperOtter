import { useState, useId } from 'react';
import { Lock, Unlock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type {
  ImageOutputFormat,
  ImageProcessingOptions,
  ImageProcessingResult,
} from '@/types/file';

export interface ImageConfigureStepProps {
  fileName: string;
  fileSizeBytes: number;      // original source file size (shown in header)
  sourceFormat: ImageOutputFormat;  // detected source format — sets default outputFormat
  isProcessing: boolean;
  error: string | null;
  lastResult: ImageProcessingResult | null;  // used to show estimated output size in slider label
  onGeneratePreview: (options: ImageProcessingOptions) => void;
  onBack: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(2)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

const FORMAT_LABELS: Record<ImageOutputFormat, string> = {
  jpeg: 'JPG',
  png: 'PNG',
  webp: 'WebP',
};

const FORMATS: ImageOutputFormat[] = ['jpeg', 'png', 'webp'];

type ResizeUnit = 'pixels' | 'percentage';

interface ResizePreset {
  label: string;
  width: number;
  height: number;
}

const RESIZE_PRESETS: ResizePreset[] = [
  { label: 'HD', width: 1920, height: 1080 },
  { label: 'Web', width: 1280, height: 720 },
  { label: 'Square', width: 1080, height: 1080 },
  { label: 'Thumb', width: 400, height: 400 },
];

export function ImageConfigureStep({
  fileName,
  fileSizeBytes,
  sourceFormat,
  isProcessing,
  error,
  lastResult,
  onGeneratePreview,
  onBack,
}: ImageConfigureStepProps) {
  const formId = useId();

  // Quality slider state
  const [quality, setQuality] = useState(80);
  const [outputFormat, setOutputFormat] = useState<ImageOutputFormat>(sourceFormat);

  // Resize state — off by default
  const [resizeEnabled, setResizeEnabled] = useState(false);
  const [resizeUnit, setResizeUnit] = useState<ResizeUnit>('pixels');
  const [widthInput, setWidthInput] = useState('');
  const [heightInput, setHeightInput] = useState('');
  const [aspectLocked, setAspectLocked] = useState(false);
  const [dimensionError, setDimensionError] = useState<string | null>(null);

  // Derived aspect ratio from last result (or 1 if no result yet)
  const aspectRatio = lastResult
    ? lastResult.sourceWidth / lastResult.sourceHeight
    : 1;

  // Quality slider label
  function getQualityLabel(): string {
    if (outputFormat === 'png') {
      const compressionDisplay = Math.round(((100 - quality) * 9) / 100);
      if (lastResult) {
        return `Compression: ${compressionDisplay}/9 — ~${formatBytes(lastResult.outputSizeBytes)}`;
      }
      return `Compression: ${compressionDisplay}/9`;
    }
    if (lastResult) {
      return `${quality}% — ~${formatBytes(lastResult.outputSizeBytes)}`;
    }
    return `${quality}%`;
  }

  // Quality slider description text
  function getQualityDescription(): string {
    if (outputFormat === 'png') {
      return 'PNG uses lossless compression — higher compression means smaller files but slower encoding.';
    }
    return 'Higher quality preserves more detail; lower quality produces smaller files.';
  }

  // Handle width input change with aspect ratio lock
  function handleWidthChange(value: string) {
    setWidthInput(value);
    setDimensionError(null);
    if (aspectLocked) {
      const w = parseFloat(value);
      if (!isNaN(w) && w > 0) {
        if (resizeUnit === 'pixels') {
          setHeightInput(String(Math.round(w / aspectRatio)));
        } else {
          // For percentage, ratio between W% and H% stays 1:1 (both scale the same)
          setHeightInput(value);
        }
      }
    }
  }

  // Handle height input change with aspect ratio lock
  function handleHeightChange(value: string) {
    setHeightInput(value);
    setDimensionError(null);
    if (aspectLocked) {
      const h = parseFloat(value);
      if (!isNaN(h) && h > 0) {
        if (resizeUnit === 'pixels') {
          setWidthInput(String(Math.round(h * aspectRatio)));
        } else {
          setWidthInput(value);
        }
      }
    }
  }

  // Apply a preset — always sets to pixels
  function applyPreset(preset: ResizePreset) {
    setResizeUnit('pixels');
    setWidthInput(String(preset.width));
    setHeightInput(String(preset.height));
    setDimensionError(null);
  }

  function handleSubmit() {
    setDimensionError(null);

    if (resizeEnabled) {
      const w = parseFloat(widthInput);
      const h = parseFloat(heightInput);

      if (!Number.isFinite(w) || w <= 0 || !Number.isFinite(h) || h <= 0 ||
          !Number.isInteger(w) || !Number.isInteger(h)) {
        setDimensionError('Width and height must be positive numbers');
        return;
      }
    }

    let targetWidth: number | null = null;
    let targetHeight: number | null = null;

    if (resizeEnabled) {
      const w = parseFloat(widthInput);
      const h = parseFloat(heightInput);

      if (resizeUnit === 'pixels') {
        targetWidth = Math.round(w);
        targetHeight = Math.round(h);
      } else {
        // percentage — convert to pixels using source dimensions from lastResult
        if (lastResult) {
          targetWidth = Math.round((w / 100) * lastResult.sourceWidth);
          targetHeight = Math.round((h / 100) * lastResult.sourceHeight);
        } else {
          // No result yet — treat as pixels (safe fallback)
          targetWidth = Math.round(w);
          targetHeight = Math.round(h);
        }
      }
    }

    const options: ImageProcessingOptions = {
      quality,
      outputFormat,
      resizeEnabled,
      // resizeExact: true means exact dimensions (not preserving aspect ratio beyond what user set)
      resizeExact: true,
      targetWidth,
      targetHeight,
    };

    onGeneratePreview(options);
  }

  return (
    <div className="flex flex-1 flex-col items-center overflow-y-auto p-6">
      <div className="w-full max-w-lg space-y-4 my-auto">

        {/* File name header */}
        <div className="text-center">
          <p className="text-sm font-medium text-foreground truncate">{fileName}</p>
          {fileSizeBytes > 0 && (
            <p className="text-xs text-muted-foreground mt-0.5">
              <span className="font-medium text-foreground">{formatBytes(fileSizeBytes)}</span>
            </p>
          )}
        </div>

        {/* Image quality card */}
        <div className="rounded-lg border border-border bg-card p-4 space-y-4">
          <h2 className="text-sm font-semibold text-foreground">Image quality</h2>

          {/* Format selector */}
          <div className="space-y-1.5">
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
          </div>

          {/* Quality / Compression slider */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label
                htmlFor={`${formId}-quality`}
                className="text-xs text-muted-foreground"
              >
                {outputFormat === 'png' ? 'Compression' : 'Quality'}
              </label>
              <span className="text-xs font-medium text-foreground tabular-nums">
                {getQualityLabel()}
              </span>
            </div>
            <input
              id={`${formId}-quality`}
              type="range"
              min="1"
              max="100"
              step="1"
              value={quality}
              onChange={(e) => setQuality(Number(e.target.value))}
              onMouseUp={handleSubmit}
              onTouchEnd={handleSubmit}
              disabled={isProcessing}
              className="w-full accent-primary disabled:opacity-50"
            />
            <p className="text-xs text-muted-foreground">{getQualityDescription()}</p>
          </div>
        </div>

        {/* Resize section */}
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Resize</h2>

            {/* Prominent pill toggle switch */}
            <button
              type="button"
              role="switch"
              aria-checked={resizeEnabled}
              aria-label="Enable resize"
              onClick={() => setResizeEnabled((v) => !v)}
              disabled={isProcessing}
              className={cn(
                'relative inline-flex h-6 w-11 flex-none items-center rounded-full transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                'disabled:cursor-not-allowed disabled:opacity-50',
                resizeEnabled ? 'bg-primary' : 'bg-muted-foreground/30',
              )}
            >
              <span
                className={cn(
                  'inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform',
                  resizeEnabled ? 'translate-x-6' : 'translate-x-1',
                )}
              />
            </button>
          </div>

          {resizeEnabled ? (
            <div className="space-y-3">
              {/* Unit toggle: pixels | percentage */}
              <div className="flex gap-1">
                {(['pixels', 'percentage'] as ResizeUnit[]).map((unit) => (
                  <button
                    key={unit}
                    type="button"
                    onClick={() => {
                      setResizeUnit(unit);
                      setWidthInput('');
                      setHeightInput('');
                      setDimensionError(null);
                    }}
                    disabled={isProcessing}
                    className={cn(
                      'rounded-md border px-3 py-1 text-xs font-medium transition-colors capitalize',
                      'disabled:cursor-not-allowed disabled:opacity-50',
                      resizeUnit === unit
                        ? 'border-primary bg-primary/5 text-foreground'
                        : 'border-border text-muted-foreground hover:border-primary/50',
                    )}
                  >
                    {unit}
                  </button>
                ))}
              </div>

              {/* Preset buttons */}
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Presets</p>
                <div className="grid grid-cols-4 gap-1">
                  {RESIZE_PRESETS.map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => applyPreset(preset)}
                      disabled={isProcessing}
                      title={`${preset.width} × ${preset.height} px`}
                      className={cn(
                        'rounded-md border border-border px-2 py-1.5 text-xs text-muted-foreground transition-colors',
                        'hover:border-primary/50 hover:text-foreground',
                        'disabled:cursor-not-allowed disabled:opacity-50',
                      )}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Width × Height inputs */}
              <div className="space-y-1.5">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label
                      htmlFor={`${formId}-width`}
                      className="text-xs text-muted-foreground"
                    >
                      Width{resizeUnit === 'pixels' ? ' (px)' : ' (%)'}
                    </label>
                    <input
                      id={`${formId}-width`}
                      type="number"
                      min="1"
                      value={widthInput}
                      onChange={(e) => handleWidthChange(e.target.value)}
                      placeholder="Width"
                      disabled={isProcessing}
                      className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
                    />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label
                        htmlFor={`${formId}-height`}
                        className="text-xs text-muted-foreground"
                      >
                        Height{resizeUnit === 'pixels' ? ' (px)' : ' (%)'}
                      </label>
                      {/* Aspect ratio lock toggle */}
                      <button
                        type="button"
                        onClick={() => setAspectLocked((v) => !v)}
                        disabled={isProcessing}
                        aria-label={aspectLocked ? 'Unlock aspect ratio' : 'Lock aspect ratio'}
                        title={aspectLocked ? 'Aspect ratio locked' : 'Aspect ratio unlocked'}
                        className={cn(
                          'rounded p-0.5 transition-colors',
                          'disabled:cursor-not-allowed disabled:opacity-50',
                          aspectLocked
                            ? 'text-primary'
                            : 'text-muted-foreground hover:text-foreground',
                        )}
                      >
                        {aspectLocked ? (
                          <Lock className="h-3 w-3" />
                        ) : (
                          <Unlock className="h-3 w-3" />
                        )}
                      </button>
                    </div>
                    <input
                      id={`${formId}-height`}
                      type="number"
                      min="1"
                      value={heightInput}
                      onChange={(e) => handleHeightChange(e.target.value)}
                      placeholder="Height"
                      disabled={isProcessing}
                      className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
                    />
                  </div>
                </div>

                {dimensionError && (
                  <p className="text-xs text-destructive">{dimensionError}</p>
                )}
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Enable to change image dimensions — pixels or percentage scale.
            </p>
          )}
        </div>

        {/* Inline processing error */}
        {error && !isProcessing && (
          <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </p>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={onBack}
            disabled={isProcessing}
            className="flex-none"
          >
            Back
          </Button>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={isProcessing}
            className="flex-1"
          >
            {isProcessing ? 'Processing…' : 'Generate Preview'}
          </Button>
        </div>

      </div>
    </div>
  );
}
