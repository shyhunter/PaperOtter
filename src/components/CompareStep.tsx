import { useEffect, useState, useRef, useCallback } from 'react';
import { ZoomIn, ZoomOut, Ban, ArrowRight, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { openPdfForLazyRender, type LazyPdfHandle } from '@/lib/pdfThumbnail';
import { getNonCompressibleReason, nonCompressibleMessage } from '@/lib/pdfProcessor';
import { cn } from '@/lib/utils';
import type { PdfProcessingResult, PdfQualityLevel } from '@/types/file';

// Pages within this margin (relative to the scroll container's own height, each
// side) are rendered ahead of being scrolled into view and kept slightly after
// leaving view, to avoid render/evict thrashing right at the viewport edge.
const RENDER_ROOT_MARGIN = '150% 0px';
// A4-ish fallback used only if a page's real aspect ratio isn't available yet.
const DEFAULT_PAGE_ASPECT_RATIO = 841.89 / 595.28;

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
  handle: LazyPdfHandle | null;
  scale: number;
  isRendering: boolean;
  hasError: boolean;
  zoomWrapperClass: string;
  scrollRef?: React.RefObject<HTMLDivElement | null>;
  onScroll?: () => void;
}

function PreviewPanel({
  label,
  sizeLabel,
  handle,
  scale,
  isRendering,
  hasError,
  zoomWrapperClass,
  scrollRef,
  onScroll,
}: PreviewPanelProps) {
  // pageIndex -> rendered data URL. Pages are rendered on demand as they approach
  // the viewport and evicted once they leave it, so memory stays bounded even
  // for documents with hundreds of pages.
  const [renderedPages, setRenderedPages] = useState<Map<number, string>>(new Map());
  const renderingRef = useRef<Set<number>>(new Set());
  const pageElsRef = useRef<Map<number, HTMLDivElement>>(new Map());

  // New document (or new render scale) — drop any previously rendered pages.
  useEffect(() => {
    setRenderedPages(new Map());
    renderingRef.current = new Set();
  }, [handle, scale]);

  const renderPage = useCallback((pageIndex: number) => {
    if (!handle || renderingRef.current.has(pageIndex)) return;
    renderingRef.current.add(pageIndex);
    handle.renderPage(pageIndex, scale)
      .then((url) => {
        setRenderedPages((prev) => new Map(prev).set(pageIndex, url));
      })
      .catch(() => {
        // Leave this one page unrendered rather than failing the whole panel.
      })
      .finally(() => {
        renderingRef.current.delete(pageIndex);
      });
  }, [handle, scale]);

  const evictPage = useCallback((pageIndex: number) => {
    setRenderedPages((prev) => {
      if (!prev.has(pageIndex)) return prev;
      const next = new Map(prev);
      next.delete(pageIndex);
      return next;
    });
  }, []);

  // Observe each page placeholder: render pages as they approach the viewport,
  // evict pages once they've scrolled well out of view.
  useEffect(() => {
    if (!handle || !scrollRef?.current) return;

    if (typeof IntersectionObserver === 'undefined') {
      // No IO support (e.g. some test environments) — fall back to rendering
      // everything up front rather than showing nothing.
      for (let i = 0; i < handle.numPages; i++) renderPage(i);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const pageIndex = Number((entry.target as HTMLElement).dataset.pageIndex);
          if (Number.isNaN(pageIndex)) continue;
          if (entry.isIntersecting) {
            renderPage(pageIndex);
          } else {
            evictPage(pageIndex);
          }
        }
      },
      { root: scrollRef.current, rootMargin: RENDER_ROOT_MARGIN },
    );

    for (const el of pageElsRef.current.values()) observer.observe(el);
    return () => observer.disconnect();
  }, [handle, scrollRef, renderPage, evictPage]);

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
        ) : isRendering || !handle ? (
          <div className="flex h-full min-h-[300px] flex-col items-center justify-center gap-3">
            <div className="h-8 w-8 rounded-full border-2 border-muted-foreground/30 border-t-primary animate-spin" />
            <span className="text-sm text-muted-foreground">Rendering preview…</span>
          </div>
        ) : (
          <div className={cn(zoomWrapperClass, 'animate-fade-slide-in')}>
            {Array.from({ length: handle.numPages }, (_, pageIndex) => {
              const url = renderedPages.get(pageIndex);
              const aspectRatio = handle.pageAspectRatios[pageIndex] ?? DEFAULT_PAGE_ASPECT_RATIO;
              return (
                <div
                  key={pageIndex}
                  data-page-index={pageIndex}
                  ref={(el) => {
                    if (el) pageElsRef.current.set(pageIndex, el);
                    else pageElsRef.current.delete(pageIndex);
                  }}
                  style={{ aspectRatio: `1 / ${aspectRatio}` }}
                  className="w-full border-b border-border/30 last:border-b-0 bg-muted/10"
                >
                  {url && (
                    <img
                      src={url}
                      alt={`${label} page ${pageIndex + 1}`}
                      className="w-full h-full block"
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export function CompareStep({ result, qualityLevel, isCancelled, onSave, onBack, onStartOver, onRetry }: CompareStepProps) {
  const [originalHandle, setOriginalHandle] = useState<LazyPdfHandle | null>(null);
  const [processedHandle, setProcessedHandle] = useState<LazyPdfHandle | null>(null);
  const [originalRendering, setOriginalRendering] = useState(true);
  const [processedRendering, setProcessedRendering] = useState(true);
  const [originalError, setOriginalError] = useState(false);
  const [processedError, setProcessedError] = useState(false);
  const [zoomIndex, setZoomIndex] = useState(DEFAULT_ZOOM_INDEX);
  const [copiedStats, setCopiedStats] = useState(false);

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

  // Open original (Before) for lazy per-page rendering
  useEffect(() => {
    if (!result) return;
    let cancelled = false;
    let handle: LazyPdfHandle | null = null;
    setOriginalHandle(null);
    setOriginalRendering(true);
    setOriginalError(false);

    openPdfForLazyRender(result.sourceBytes)
      .then((h) => {
        if (cancelled) { h.destroy(); return; }
        handle = h;
        setOriginalHandle(h);
        setOriginalRendering(false);
      })
      .catch(() => {
        if (cancelled) return;
        setOriginalError(true);
        setOriginalRendering(false);
      });
    return () => { cancelled = true; handle?.destroy(); };
  }, [result]);

  // Open processed (After) for lazy per-page rendering
  useEffect(() => {
    if (!result) return;
    let cancelled = false;
    let handle: LazyPdfHandle | null = null;
    setProcessedHandle(null);
    setProcessedRendering(true);
    setProcessedError(false);

    openPdfForLazyRender(result.bytes)
      .then((h) => {
        if (cancelled) { h.destroy(); return; }
        handle = h;
        setProcessedHandle(h);
        setProcessedRendering(false);
      })
      .catch(() => {
        if (cancelled) return;
        setProcessedError(true);
        setProcessedRendering(false);
      });
    return () => { cancelled = true; handle?.destroy(); };
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

  // Same canonical reason/message pdfProcessor.ts and ConfigureStep use — the JPX
  // wording never differs between screens.
  const nonCompressibleReason = getNonCompressibleReason(result.compressibilityScore, result.jpxByteShare);

  const savingsBytes = result.inputSizeBytes - result.outputSizeBytes;
  const savingsPct = result.inputSizeBytes > 0
    ? Math.round((savingsBytes / result.inputSizeBytes) * 100)
    : 0;
  const grew = savingsBytes < 0;

  const dimensionsLabel = result.outputPageDimensions
    ? `${Math.round(result.outputPageDimensions.widthPt * 25.4 / 72)} × ${Math.round(result.outputPageDimensions.heightPt * 25.4 / 72)} mm`
    : null;

  return (
    <div data-testid="compare-step" className="flex flex-1 flex-col overflow-hidden animate-fade-slide-in">

      {/* Target not met warning */}
      {!result.targetMet && result.bestAchievableSizeBytes != null && (
        <div data-testid="target-not-met-banner" className="mx-4 mt-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-2 flex-none">
          <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
            Target size not achievable —{' '}
            <span className="font-normal">
              best result: {formatBytes(result.bestAchievableSizeBytes)}.{' '}
              {result.wasAlreadyOptimal
                ? nonCompressibleReason === 'jpx'
                  ? nonCompressibleMessage(nonCompressibleReason, result.imageCount)
                  : 'This file is already at maximum compression for all quality settings.'
                : 'Try a lower quality level to reduce further.'}
            </span>{' '}
            <button
              type="button"
              onClick={onBack}
              className="underline hover:no-underline cursor-pointer"
            >
              Back and try again
            </button>
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
          <span className="text-muted-foreground hidden sm:inline">
            {nonCompressibleReason === 'jpx' ? "Images already JPEG2000-encoded — can't compress further" : 'File already optimal'}
          </span>
        )}
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => {
            const stats = `${formatBytes(result.inputSizeBytes)} → ${formatBytes(result.outputSizeBytes)} (${Math.abs(savingsPct)}% ${grew ? 'larger' : 'smaller'})`;
            navigator.clipboard.writeText(stats).then(() => {
              setCopiedStats(true);
              setTimeout(() => setCopiedStats(false), 2000);
            });
          }}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          title="Copy processing stats to clipboard"
        >
          {copiedStats ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
          <span>{copiedStats ? 'Copied' : 'Copy stats'}</span>
        </button>
      </div>

      {/* Side-by-side preview panels with floating zoom toolbar */}
      <div className="relative flex flex-1 gap-4 p-4 overflow-hidden min-h-0">
        <PreviewPanel
          label="Before"
          sizeLabel={formatBytes(result.inputSizeBytes)}
          handle={originalHandle}
          scale={RENDER_SCALE}
          isRendering={originalRendering}
          hasError={originalError}
          zoomWrapperClass={zoomWrapperClass}
          scrollRef={beforeScrollRef}
          onScroll={() => handleScroll('before')}
        />
        <PreviewPanel
          label="After"
          sizeLabel={formatBytes(result.outputSizeBytes)}
          handle={processedHandle}
          scale={getAfterRenderScale(qualityLevel)}
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
