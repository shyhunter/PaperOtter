// Full comparison overlay: side-by-side Before (original) / After (current edited)
// with synced scrolling, zoom controls — mirrors the CompareStep UX.
//
// CRITICAL: Pages are rendered lazily (on-demand as they approach the viewport,
// evicted once they leave it) rather than all up front. Rasterizing every page of
// both documents synchronously froze the app solid on large PDFs (e.g. 688 pages) —
// see openPdfForLazyRender in pdfThumbnail.ts, same pattern used by CompareStep.
import { useEffect, useState, useRef, useCallback } from 'react';
import { X, ZoomIn, ZoomOut } from 'lucide-react';
import { openPdfForLazyRender, type LazyPdfHandle } from '@/lib/pdfThumbnail';
import { useEditorContext } from '@/context/EditorContext';
import { cn } from '@/lib/utils';

// Zoom steps matching CompareStep
const ZOOM_STEPS: Array<{ label: string; wrapperClass: string }> = [
  { label: '50%',  wrapperClass: 'w-1/2 mx-auto' },
  { label: '75%',  wrapperClass: 'w-3/4 mx-auto' },
  { label: '100%', wrapperClass: 'w-full' },
  { label: '150%', wrapperClass: 'min-w-[150%]' },
  { label: '200%', wrapperClass: 'min-w-[200%]' },
];
const DEFAULT_ZOOM_INDEX = 2; // 100%
const RENDER_SCALE = 2.0;
const RENDER_ROOT_MARGIN = '150% 0px';
const DEFAULT_PAGE_ASPECT_RATIO = 841.89 / 595.28;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(2)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

interface PreviewPanelProps {
  label: string;
  sizeLabel: string;
  handle: LazyPdfHandle | null;
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

  useEffect(() => {
    setRenderedPages(new Map());
    renderingRef.current = new Set();
  }, [handle]);

  const renderPage = useCallback((pageIndex: number) => {
    if (!handle || renderingRef.current.has(pageIndex)) return;
    renderingRef.current.add(pageIndex);
    handle.renderPage(pageIndex, RENDER_SCALE)
      .then((url) => {
        setRenderedPages((prev) => new Map(prev).set(pageIndex, url));
      })
      .catch(() => {
        // Leave this one page unrendered rather than failing the whole panel.
      })
      .finally(() => {
        renderingRef.current.delete(pageIndex);
      });
  }, [handle]);

  const evictPage = useCallback((pageIndex: number) => {
    setRenderedPages((prev) => {
      if (!prev.has(pageIndex)) return prev;
      const next = new Map(prev);
      next.delete(pageIndex);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!handle || !scrollRef?.current) return;

    if (typeof IntersectionObserver === 'undefined') {
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
            <span className="text-sm text-muted-foreground">Rendering preview...</span>
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

export function CompareFloatingWindow() {
  const { state, setCompareMode } = useEditorContext();
  const { originalPdfBytes, pdfBytes } = state;

  const [originalHandle, setOriginalHandle] = useState<LazyPdfHandle | null>(null);
  const [currentHandle, setCurrentHandle] = useState<LazyPdfHandle | null>(null);
  const [originalRendering, setOriginalRendering] = useState(true);
  const [currentRendering, setCurrentRendering] = useState(true);
  const [originalError, setOriginalError] = useState(false);
  const [currentError, setCurrentError] = useState(false);
  const [zoomIndex, setZoomIndex] = useState(DEFAULT_ZOOM_INDEX);

  const { label: zoomLabel, wrapperClass: zoomWrapperClass } = ZOOM_STEPS[zoomIndex];

  // ── Synced scrolling ──────────────────────────────────────────────────
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
    if (originalPdfBytes.byteLength === 0) return;
    let cancelled = false;
    let handle: LazyPdfHandle | null = null;
    setOriginalHandle(null);
    setOriginalRendering(true);
    setOriginalError(false);

    openPdfForLazyRender(originalPdfBytes)
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
  }, [originalPdfBytes]);

  // Open current (After) for lazy per-page rendering
  useEffect(() => {
    if (pdfBytes.byteLength === 0) return;
    let cancelled = false;
    let handle: LazyPdfHandle | null = null;
    setCurrentHandle(null);
    setCurrentRendering(true);
    setCurrentError(false);

    openPdfForLazyRender(pdfBytes)
      .then((h) => {
        if (cancelled) { h.destroy(); return; }
        handle = h;
        setCurrentHandle(h);
        setCurrentRendering(false);
      })
      .catch(() => {
        if (cancelled) return;
        setCurrentError(true);
        setCurrentRendering(false);
      });
    return () => { cancelled = true; handle?.destroy(); };
  }, [pdfBytes]);

  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setCompareMode('off');
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setCompareMode]);

  const originalSize = originalPdfBytes.byteLength;
  const currentSize = pdfBytes.byteLength;

  return (
    <div className="absolute inset-0 z-50 flex flex-col bg-background">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/30 flex-none">
        <span className="text-sm font-semibold text-foreground">Compare: Original vs Current</span>

        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground tabular-nums">
            {formatBytes(originalSize)} → {formatBytes(currentSize)}
          </span>
          {originalSize > 0 && (
            <span className={cn(
              'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
              currentSize <= originalSize
                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
            )}>
              {currentSize <= originalSize
                ? `${Math.round(((originalSize - currentSize) / originalSize) * 100)}% smaller`
                : `${Math.round(((currentSize - originalSize) / originalSize) * 100)}% larger`
              }
            </span>
          )}
          <button
            type="button"
            onClick={() => setCompareMode('off')}
            className="ml-2 p-1 rounded hover:bg-muted transition-colors"
            title="Close comparison (Esc)"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Side-by-side preview panels */}
      <div className="relative flex flex-1 gap-4 p-4 overflow-hidden min-h-0">
        <PreviewPanel
          label="Original"
          sizeLabel={formatBytes(originalSize)}
          handle={originalHandle}
          isRendering={originalRendering}
          hasError={originalError}
          zoomWrapperClass={zoomWrapperClass}
          scrollRef={beforeScrollRef}
          onScroll={() => handleScroll('before')}
        />
        <PreviewPanel
          label="Current"
          sizeLabel={formatBytes(currentSize)}
          handle={currentHandle}
          isRendering={currentRendering}
          hasError={currentError}
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
    </div>
  );
}
