import { useEffect, useState, useRef, useCallback } from 'react';
import { ZoomIn, ZoomOut, Ban, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { renderAllPdfPages } from '@/lib/pdfThumbnail';
import { cn } from '@/lib/utils';
import type { PdfProcessingResult, PdfQualityLevel } from '@/types/file';

export interface CompareStepProps {
  result?: PdfProcessingResult;    // optional — not present when isCancelled=true
  qualityLevel?: PdfQualityLevel;  // used to derive render scale for After panel
  isCancelled?: boolean;           // when true, show cancelled state instead of previews
  onSave: () => void;
  onBack: () => void;
  onStartOver: () => void;
  onRetry?: () => void;            // re-runs processing with same options; only shown when isCancelled=true
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(2)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

// Zoom steps: 50% → 75% → 100% → 150% → 200%
const ZOOM_STEPS: Array<{ label: string; wrapperClass: string }> = [
  { label: '50%',  wrapperClass: 'w-1/2 mx-auto' },
  { label: '75%',  wrapperClass: 'w-3/4 mx-auto' },
  { label: '100%', wrapperClass: 'w-full' },
  { label: '150%', wrapperClass: 'min-w-[150%]' },
  { label: '200%', wrapperClass: 'min-w-[200%]' },
];
const DEFAULT_ZOOM_INDEX = 2; // 100%

const RENDER_SCALE = 2.0;

const QUALITY_RENDER_SCALE: Record<string, number> = {
  web:     0.75,
  screen:  1.0,
  print:   1.5,
  archive: 2.0,
};

function getAfterRenderScale(qualityLevel?: PdfQualityLevel): number {
  if (!qualityLevel) return 2.0;
  return QUALITY_RENDER_SCALE[qualityLevel] ?? 2.0;
}

interface PreviewPanelProps {
  label: string;
  sizeLabel: string;
  pageUrls: string[];
  isRendering: boolean;
  hasError: boolean;
  zoomWrapperClass: string;
  scrollRef?: React.RefObject<HTMLDivElement | null>;
  onScroll?: () => void;
}

function PreviewPanel({
  label,
  sizeLabel,
  pageUrls,
  isRendering,
  hasError,
  zoomWrapperClass,
  scrollRef,
  onScroll,
}: PreviewPanelProps) {
  return (
    <div className="flex flex-1 flex-col gap-2 min-w-0 min-h-0">
      {/* Panel header */}
      <div className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2 flex-none">
        <span className="text-sm font-semibold text-foreground">{label}</span>
        <span className="text-xs text-muted-foreground tabular-nums">{sizeLabel}</span>
      </div>

      {/* Scrollable area */}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex-1 overflow-auto rounded-lg border border-border bg-white min-h-0"
      >
        {hasError ? (
          <div className="flex h-full min-h-[300px] items-center justify-center">
            <span className="text-sm text-muted-foreground">Preview unavailable</span>
          </div>
        ) : isRendering ? (
          <div className="flex h-full min-h-[300px] items-center justify-center">
            <span className="text-sm text-muted-foreground animate-pulse">Rendering…</span>
          </div>
        ) : (
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

export function CompareStep({ result, qualityLevel, isCancelled, onSave, onBack, onStartOver, onRetry }: CompareStepProps) {
  const [originalUrls, setOriginalUrls] = useState<string[]>([]);
  const [processedUrls, setProcessedUrls] = useState<string[]>([]);
  const [originalRendering, setOriginalRendering] = useState(true);
  const [processedRendering, setProcessedRendering] = useState(true);
  const [originalError, setOriginalError] = useState(false);
  const [processedError, setProcessedError] = useState(false);
  const [zoomIndex, setZoomIndex] = useState(DEFAULT_ZOOM_INDEX);

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

  // Render original (Before)
  useEffect(() => {
    if (!result) return;
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
  }, [result]);

  // Render processed (After)
  useEffect(() => {
    if (!result) return;
    let cancelled = false;
    setProcessedUrls([]);
    setProcessedRendering(true);
    setProcessedError(false);

    renderAllPdfPages(result.bytes, getAfterRenderScale(qualityLevel))
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
  }, [result, qualityLevel]);

  // ── Cancelled state ─────────────────────────────────────────────────────────
  if (isCancelled) {
    return (
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6">
          <Ban className="h-10 w-10 text-muted-foreground" />
          <div className="text-center space-y-1">
            <p className="text-base font-medium text-foreground">Processing cancelled</p>
            <p className="text-sm text-muted-foreground">The operation was stopped before completion.</p>
          </div>
          <div className="flex gap-3 mt-2">
            {onRetry && (
              <Button size="sm" onClick={onRetry}>
                Retry
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={onBack}>
              Back to Configure
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!result) return null;

  const savingsBytes = result.inputSizeBytes - result.outputSizeBytes;
  const savingsPct = result.inputSizeBytes > 0
    ? Math.round((savingsBytes / result.inputSizeBytes) * 100)
    : 0;
  const grew = savingsBytes < 0;

  const dimensionsLabel = result.outputPageDimensions
    ? `${Math.round(result.outputPageDimensions.widthPt * 25.4 / 72)} × ${Math.round(result.outputPageDimensions.heightPt * 25.4 / 72)} mm`
    : null;

  return (
    <div data-testid="compare-step" className="flex flex-1 flex-col overflow-hidden">

      {/* Target not met warning */}
      {!result.targetMet && result.bestAchievableSizeBytes != null && (
        <div data-testid="target-not-met-banner" className="mx-4 mt-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-2 flex-none">
          <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
            Target size not achievable —{' '}
            <span className="font-normal">
              best result: {formatBytes(result.bestAchievableSizeBytes)}.{' '}
              {result.wasAlreadyOptimal
                ? 'This file is already fully optimised.'
                : 'Try a lower quality level to reduce further.'}
            </span>
          </p>
        </div>
      )}

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
        <span className="text-muted-foreground whitespace-nowrap">
          {result.pageCount} page{result.pageCount !== 1 ? 's' : ''}
        </span>
        {dimensionsLabel && (
          <span className="text-muted-foreground whitespace-nowrap">{dimensionsLabel}</span>
        )}
        {result.wasAlreadyOptimal && (
          <span className="text-muted-foreground hidden sm:inline">File already optimal</span>
        )}
      </div>

      {/* Side-by-side preview panels with floating zoom toolbar */}
      <div className="relative flex flex-1 gap-4 p-4 overflow-hidden min-h-0">
        <PreviewPanel
          label="Before"
          sizeLabel={formatBytes(result.inputSizeBytes)}
          pageUrls={originalUrls}
          isRendering={originalRendering}
          hasError={originalError}
          zoomWrapperClass={zoomWrapperClass}
          scrollRef={beforeScrollRef}
          onScroll={() => handleScroll('before')}
        />
        <PreviewPanel
          label="After"
          sizeLabel={formatBytes(result.outputSizeBytes)}
          pageUrls={processedUrls}
          isRendering={processedRendering}
          hasError={processedError}
          zoomWrapperClass={zoomWrapperClass}
          scrollRef={afterScrollRef}
          onScroll={() => handleScroll('after')}
        />

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
