import { useEffect, useState, useRef, useCallback } from 'react';
import { ZoomIn, ZoomOut, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ImageProcessingResult } from '@/types/file';

export interface ImageCompareStepProps {
  result: ImageProcessingResult;
  isProcessing: boolean;   // true while regenerating after settings change
  onSave: () => void;
  onBack: () => void;
  onStartOver: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(2)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

function detectMimeFromBytes(bytes: Uint8Array): string {
  if (bytes[0] === 0xFF && bytes[1] === 0xD8) return 'image/jpeg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return 'image/png';
  if (bytes.length > 11 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return 'image/webp';
  return 'image/jpeg'; // fallback
}

// Zoom steps: 50% → 75% → 100% → 150% → 200%
// Tailwind classes for the zoom wrapper inside the scroll container.
// min-w-[N%] forces the wrapper wider than the panel, enabling horizontal scroll.
const ZOOM_STEPS: Array<{ label: string; wrapperClass: string }> = [
  { label: '50%',  wrapperClass: 'w-1/2 mx-auto' },
  { label: '75%',  wrapperClass: 'w-3/4 mx-auto' },
  { label: '100%', wrapperClass: 'w-full' },
  { label: '150%', wrapperClass: 'min-w-[150%]' },
  { label: '200%', wrapperClass: 'min-w-[200%]' },
];
const DEFAULT_ZOOM_INDEX = 2; // 100%

export function ImageCompareStep({
  result,
  isProcessing,
  onSave,
  onBack,
  onStartOver,
}: ImageCompareStepProps) {
  const [zoomIndex, setZoomIndex] = useState(DEFAULT_ZOOM_INDEX);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [processedUrl, setProcessedUrl] = useState<string | null>(null);

  const { label: zoomLabel, wrapperClass: zoomWrapperClass } = ZOOM_STEPS[zoomIndex];

  // ── Synced scrolling ────────────────────────────────────────────────────────
  const isSyncing = useRef(false);
  const beforeScrollRef = useRef<HTMLDivElement>(null);
  const afterScrollRef = useRef<HTMLDivElement>(null);

  const handleScroll = useCallback((source: 'before' | 'after') => {
    if (isSyncing.current) return;
    isSyncing.current = true;
    const src = source === 'before' ? beforeScrollRef.current : afterScrollRef.current;
    const tgt = source === 'before' ? afterScrollRef.current : beforeScrollRef.current;
    if (src && tgt) {
      tgt.scrollTop = src.scrollTop;
      tgt.scrollLeft = src.scrollLeft;
    }
    requestAnimationFrame(() => { isSyncing.current = false; });
  }, []);

  // Before panel — source bytes never change per session
  useEffect(() => {
    const mime = detectMimeFromBytes(result.sourceBytes);
    const blob = new Blob([result.sourceBytes], { type: mime });
    const url = URL.createObjectURL(blob);
    setOriginalUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [result.sourceBytes]);

  // After panel — updates on every new result
  useEffect(() => {
    const mime = `image/${result.outputFormat}`;
    const blob = new Blob([result.bytes], { type: mime });
    const url = URL.createObjectURL(blob);
    setProcessedUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [result.bytes, result.outputFormat]);

  // Stats calculations
  const savingsBytes = result.inputSizeBytes - result.outputSizeBytes;
  const savingsPct = result.inputSizeBytes > 0
    ? Math.round((savingsBytes / result.inputSizeBytes) * 100)
    : 0;
  const grew = savingsBytes < 0;

  const dimensionsChanged =
    result.outputWidth !== result.sourceWidth || result.outputHeight !== result.sourceHeight;

  const sourceMime = detectMimeFromBytes(result.sourceBytes);
  const sourceFormatLabel = sourceMime.replace('image/', '').toUpperCase();
  const outputFormatLabel = result.outputFormat.toUpperCase();
  const formatChanged = sourceFormatLabel !== outputFormatLabel;

  const qualityLabel = result.outputFormat === 'png'
    ? `Compression: ${Math.round((100 - result.quality) * 9 / 100)}/9`
    : `${result.quality}%`;

  return (
    <div data-testid="image-compare-step" className="flex flex-1 flex-col overflow-hidden">

      {/* Stats row above panels */}
      <div data-testid="stats-bar" className="flex items-center gap-4 px-4 py-2 text-xs border-b border-border bg-muted/30 flex-none">
        <span className={cn(
          'font-medium tabular-nums whitespace-nowrap',
          grew ? 'text-amber-600 dark:text-amber-400' : 'text-green-600 dark:text-green-400',
        )}>
          {formatBytes(result.inputSizeBytes)}
        </span>
        <ArrowRight className="h-3 w-3 text-muted-foreground flex-none" />
        <span className={cn(
          'font-medium tabular-nums whitespace-nowrap',
          grew ? 'text-amber-600 dark:text-amber-400' : 'text-green-600 dark:text-green-400',
        )}>
          {formatBytes(result.outputSizeBytes)}
        </span>
        {result.inputSizeBytes > 0 && (
          <span className={cn(
            'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
            grew
              ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
              : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
          )}>
            {Math.abs(savingsPct)}% {grew ? 'larger' : 'smaller'}
          </span>
        )}
        {dimensionsChanged && (
          <span className="text-muted-foreground whitespace-nowrap">
            {result.sourceWidth} x {result.sourceHeight} px → {result.outputWidth} x {result.outputHeight} px
          </span>
        )}
        {formatChanged && (
          <span className="text-muted-foreground whitespace-nowrap">
            {sourceFormatLabel} → {outputFormatLabel}
          </span>
        )}
        <span className="text-muted-foreground whitespace-nowrap">
          Quality: {qualityLabel}
        </span>
      </div>

      {/* Side-by-side preview panels with floating zoom toolbar */}
      <div className="relative flex flex-1 gap-4 p-4 overflow-hidden min-h-0">

        {/* Before panel */}
        <div data-testid="before-panel" className="flex flex-1 flex-col gap-2 min-w-0 min-h-0">
          <div className="flex items-center justify-center rounded-md bg-muted/50 px-3 py-2 flex-none">
            <span className="text-sm font-semibold text-foreground">Before</span>
          </div>
          <div
            ref={beforeScrollRef}
            onScroll={() => handleScroll('before')}
            className="flex-1 overflow-auto rounded-lg border border-border bg-white min-h-0"
          >
            {originalUrl ? (
              <div className={zoomWrapperClass}>
                <img src={originalUrl} alt="Original" className="w-full h-auto block" />
              </div>
            ) : (
              <div className="flex h-full min-h-[300px] items-center justify-center">
                <span className="text-sm text-muted-foreground animate-pulse">Loading…</span>
              </div>
            )}
          </div>
        </div>

        {/* After panel */}
        <div data-testid="after-panel" className="flex flex-1 flex-col gap-2 min-w-0 min-h-0">
          <div className="flex items-center justify-center rounded-md bg-muted/50 px-3 py-2 flex-none">
            <span className="text-sm font-semibold text-foreground">After</span>
          </div>
          <div
            ref={afterScrollRef}
            onScroll={() => handleScroll('after')}
            className="relative flex-1 overflow-auto rounded-lg border border-border bg-white min-h-0"
          >
            {processedUrl ? (
              <>
                <div className={cn('transition-opacity', isProcessing ? 'opacity-40' : 'opacity-100')}>
                  <div className={zoomWrapperClass}>
                    <img src={processedUrl} alt="Processed" className="w-full h-auto block" />
                  </div>
                </div>
                {isProcessing && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <span className="text-sm bg-background/90 border border-border px-3 py-1.5 rounded-md shadow-sm">
                      Regenerating…
                    </span>
                  </div>
                )}
              </>
            ) : isProcessing ? (
              <div className="flex h-full min-h-[300px] items-center justify-center">
                <span className="text-sm text-muted-foreground animate-pulse">Processing…</span>
              </div>
            ) : null}
          </div>
        </div>

        {/* Floating zoom toolbar */}
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1 rounded-full bg-background/90 backdrop-blur-sm border border-border shadow-lg px-3 py-1.5 z-10">
          <button
            type="button"
            onClick={() => setZoomIndex((i) => Math.max(0, i - 1))}
            disabled={zoomIndex === 0}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            aria-label="Zoom out"
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </button>
          <span className="text-xs text-muted-foreground tabular-nums w-9 text-center select-none">
            {zoomLabel}
          </span>
          <button
            type="button"
            onClick={() => setZoomIndex((i) => Math.min(ZOOM_STEPS.length - 1, i + 1))}
            disabled={zoomIndex === ZOOM_STEPS.length - 1}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            aria-label="Zoom in"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </button>
        </div>

      </div>

      {/* Bottom strip — simplified: Back | spacer | Start Over | Save */}
      <div className="border-t bg-background px-4 py-3 flex items-center gap-3 flex-none">

        <Button variant="outline" size="sm" data-testid="back-btn" onClick={onBack} className="flex-none">
          Back
        </Button>

        <div className="flex-1" />

        <button
          type="button"
          data-testid="process-another-btn"
          onClick={onStartOver}
          className="text-xs text-muted-foreground underline hover:text-foreground transition-colors flex-none"
        >
          Start Over
        </button>

        <Button size="sm" data-testid="save-btn" onClick={onSave} className="flex-none">
          Save…
        </Button>
      </div>
    </div>
  );
}
