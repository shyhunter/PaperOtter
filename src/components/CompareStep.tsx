import { useEffect, useState } from 'react';
import { ZoomIn, ZoomOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { renderAllPdfPages } from '@/lib/pdfThumbnail';
import { cn } from '@/lib/utils';
import type { PdfProcessingResult } from '@/types/file';

export interface CompareStepProps {
  result: PdfProcessingResult;
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

// Render scale: high enough for crisp display at 150% zoom.
// 2.0 = 2× pixel density — sharp on Retina displays at 100% view.
const RENDER_SCALE = 2.0;

interface PreviewPanelProps {
  label: string;
  sizeLabel: string;
  pageUrls: string[];
  isRendering: boolean;
  hasError: boolean;
  zoomWrapperClass: string;
}

function PreviewPanel({
  label,
  sizeLabel,
  pageUrls,
  isRendering,
  hasError,
  zoomWrapperClass,
}: PreviewPanelProps) {
  return (
    <div className="flex flex-1 flex-col gap-2 min-w-0 min-h-0">
      {/* Panel header */}
      <div className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2 flex-none">
        <span className="text-sm font-semibold text-foreground">{label}</span>
        <span className="text-xs text-muted-foreground tabular-nums">{sizeLabel}</span>
      </div>

      {/* Scrollable area */}
      <div className="flex-1 overflow-auto rounded-lg border border-border bg-white min-h-0">
        {hasError ? (
          <div className="flex h-full min-h-[300px] items-center justify-center">
            <span className="text-sm text-muted-foreground">Preview unavailable</span>
          </div>
        ) : isRendering ? (
          <div className="flex h-full min-h-[300px] items-center justify-center">
            <span className="text-sm text-muted-foreground animate-pulse">Rendering…</span>
          </div>
        ) : (
          /* Zoom wrapper — controls effective display width of pages */
          <div className={zoomWrapperClass}>
            {pageUrls.map((url, i) => (
              <img
                key={i}
                src={url}
                alt={`${label} page ${i + 1}`}
                className="w-full h-auto block border-b border-border/30 last:border-b-0"
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function CompareStep({ result, onSave, onBack, onStartOver }: CompareStepProps) {
  const [originalUrls, setOriginalUrls] = useState<string[]>([]);
  const [processedUrls, setProcessedUrls] = useState<string[]>([]);
  const [originalRendering, setOriginalRendering] = useState(true);
  const [processedRendering, setProcessedRendering] = useState(true);
  const [originalError, setOriginalError] = useState(false);
  const [processedError, setProcessedError] = useState(false);
  const [zoomIndex, setZoomIndex] = useState(DEFAULT_ZOOM_INDEX);

  const { label: zoomLabel, wrapperClass: zoomWrapperClass } = ZOOM_STEPS[zoomIndex];

  // Render original (Before) — from sourceBytes stored in result (no disk read needed).
  // cancelled flag prevents stale async completions from updating state when React
  // StrictMode unmounts+remounts the component or when deps change mid-render.
  useEffect(() => {
    let cancelled = false;
    setOriginalUrls([]);
    setOriginalRendering(true);
    setOriginalError(false);

    renderAllPdfPages(result.sourceBytes, RENDER_SCALE)
      .then((urls) => {
        if (cancelled) return;
        setOriginalUrls(urls);
        setOriginalRendering(false);
      })
      .catch(() => {
        if (cancelled) return;
        setOriginalError(true);
        setOriginalRendering(false);
      });
    return () => { cancelled = true; };
  }, [result.sourceBytes]);

  // Render processed (After) — from result.bytes (in-memory processed output)
  useEffect(() => {
    let cancelled = false;
    setProcessedUrls([]);
    setProcessedRendering(true);
    setProcessedError(false);

    renderAllPdfPages(result.bytes, RENDER_SCALE)
      .then((urls) => {
        if (cancelled) return;
        setProcessedUrls(urls);
        setProcessedRendering(false);
      })
      .catch(() => {
        if (cancelled) return;
        setProcessedError(true);
        setProcessedRendering(false);
      });
    return () => { cancelled = true; };
  }, [result.bytes]);

  const savingsBytes = result.inputSizeBytes - result.outputSizeBytes;
  const savingsPct = result.inputSizeBytes > 0
    ? Math.round((savingsBytes / result.inputSizeBytes) * 100)
    : 0;
  const grew = savingsBytes < 0;

  const dimensionsLabel = result.outputPageDimensions
    ? `${Math.round(result.outputPageDimensions.widthPt * 25.4 / 72)} × ${Math.round(result.outputPageDimensions.heightPt * 25.4 / 72)} mm`
    : null;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">

      {/* Target not met warning */}
      {!result.targetMet && result.bestAchievableSizeBytes != null && (
        <div className="mx-4 mt-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-2 flex-none">
          <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
            Target size not achievable —{' '}
            <span className="font-normal">
              best result: {formatBytes(result.bestAchievableSizeBytes)}. PDF optimisation is structural only.
            </span>
          </p>
        </div>
      )}

      {/* Side-by-side preview panels */}
      <div className="flex flex-1 gap-4 p-4 overflow-hidden min-h-0">
        <PreviewPanel
          label="Before"
          sizeLabel={formatBytes(result.inputSizeBytes)}
          pageUrls={originalUrls}
          isRendering={originalRendering}
          hasError={originalError}
          zoomWrapperClass={zoomWrapperClass}
        />
        <PreviewPanel
          label="After"
          sizeLabel={formatBytes(result.outputSizeBytes)}
          pageUrls={processedUrls}
          isRendering={processedRendering}
          hasError={processedError}
          zoomWrapperClass={zoomWrapperClass}
        />
      </div>

      {/* Bottom strip */}
      <div className="border-t bg-background px-4 py-3 flex items-center gap-3 flex-none">

        <Button variant="outline" size="sm" onClick={onBack} className="flex-none">
          Back
        </Button>

        {/* Stats */}
        <div className="flex flex-1 items-center gap-4 text-xs overflow-hidden">
          <span className={cn(
            'font-medium tabular-nums whitespace-nowrap',
            grew ? 'text-amber-600 dark:text-amber-400' : 'text-green-600 dark:text-green-400',
          )}>
            {grew ? '+' : '−'}{formatBytes(Math.abs(savingsBytes))} ({Math.abs(savingsPct)}%)
          </span>
          <span className="text-muted-foreground whitespace-nowrap">
            {result.pageCount} page{result.pageCount !== 1 ? 's' : ''}
          </span>
          {dimensionsLabel && (
            <span className="text-muted-foreground whitespace-nowrap">{dimensionsLabel}</span>
          )}
          {grew && (
            <span className="text-muted-foreground hidden sm:inline">File was already optimised</span>
          )}
        </div>

        {/* Zoom controls */}
        <div className="flex items-center gap-1 flex-none">
          <button
            type="button"
            onClick={() => setZoomIndex((i) => Math.max(0, i - 1))}
            disabled={zoomIndex === 0}
            className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
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
            className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            aria-label="Zoom in"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </button>
        </div>

        <button
          type="button"
          onClick={onStartOver}
          className="text-xs text-muted-foreground underline hover:text-foreground transition-colors flex-none"
        >
          Process another
        </button>

        <Button size="sm" onClick={onSave} className="flex-none">
          Save…
        </Button>
      </div>
    </div>
  );
}
