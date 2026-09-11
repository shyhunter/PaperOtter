// CompareOverlay: full-page before/after comparison that overlays the editor canvas.
// Features: side-by-side or overlay mode, zoom, scroll sync, closable, minimizable.
// Opens from ToolSidebarPreview when user wants a closer look.
//
// CRITICAL: Pages are rendered lazily (on-demand as they approach the viewport,
// evicted once they leave it) rather than all up front. Rasterizing every page of
// both documents synchronously froze the app solid on large PDFs (e.g. 688 pages) —
// see openPdfForLazyRender in pdfThumbnail.ts, same pattern used by CompareStep.
import { useState, useEffect, useRef, useCallback, type RefObject } from 'react';
import { X, Minimize2, Maximize2, Columns2, Layers, ZoomIn, ZoomOut } from 'lucide-react';
import { openPdfForLazyRender, type LazyPdfHandle } from '@/lib/pdfThumbnail';
import { t } from '@/i18n';
import { OtterLoader } from '@/components/brand/OtterLoader';

export type CompareMode = 'overlay' | 'side-by-side';

interface CompareOverlayProps {
  originalBytes: Uint8Array;
  previewBytes: Uint8Array;
  onClose: () => void;
  initialPage?: number;
}

const RENDER_SCALE = 1.5;
const RENDER_ROOT_MARGIN = '150% 0px';
const DEFAULT_PAGE_ASPECT_RATIO = 841.89 / 595.28;

/** Renders only the pages of `handle` that are near `scrollRef`'s viewport, evicting
 *  pages once they scroll out of view — keeps large documents from all rendering at once. */
function usePageRenderer(
  handle: LazyPdfHandle | null,
  scrollRef: RefObject<HTMLDivElement | null>,
) {
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
    if (!handle || !scrollRef.current) return;

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

  return { renderedPages, pageElsRef };
}

export function CompareOverlay({
  originalBytes,
  previewBytes,
  onClose,
  initialPage = 0,
}: CompareOverlayProps) {
  const [mode, setMode] = useState<CompareMode>('side-by-side');
  const [isMinimized, setIsMinimized] = useState(false);
  const [zoom, setZoom] = useState(1.0);
  const [originalHandle, setOriginalHandle] = useState<LazyPdfHandle | null>(null);
  const [previewHandle, setPreviewHandle] = useState<LazyPdfHandle | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // For overlay mode: slider position (0-100%)
  const [sliderPos, setSliderPos] = useState(50);
  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const overlayScrollRef = useRef<HTMLDivElement>(null);

  const { renderedPages: beforeSideBySide, pageElsRef: beforeSideBySideEls } = usePageRenderer(originalHandle, leftRef);
  const { renderedPages: afterSideBySide, pageElsRef: afterSideBySideEls } = usePageRenderer(previewHandle, rightRef);
  const { renderedPages: beforeOverlay, pageElsRef: beforeOverlayEls } = usePageRenderer(originalHandle, overlayScrollRef);
  const { renderedPages: afterOverlay, pageElsRef: afterOverlayEls } = usePageRenderer(previewHandle, overlayScrollRef);

  // Open both documents for lazy, per-page rendering.
  useEffect(() => {
    let cancelled = false;
    let oHandle: LazyPdfHandle | null = null;
    let pHandle: LazyPdfHandle | null = null;
    setIsLoading(true);
    setOriginalHandle(null);
    setPreviewHandle(null);

    Promise.all([
      openPdfForLazyRender(originalBytes),
      openPdfForLazyRender(previewBytes),
    ]).then(([oh, ph]) => {
      if (cancelled) { oh.destroy(); ph.destroy(); return; }
      oHandle = oh;
      pHandle = ph;
      setOriginalHandle(oh);
      setPreviewHandle(ph);
      setIsLoading(false);
    }).catch(() => {
      if (!cancelled) setIsLoading(false);
    });

    return () => {
      cancelled = true;
      oHandle?.destroy();
      pHandle?.destroy();
    };
  }, [originalBytes, previewBytes]);

  // Scroll both panels in sync (side-by-side mode)
  const handleScroll = useCallback((source: 'left' | 'right') => {
    if (mode !== 'side-by-side') return;
    const src = source === 'left' ? leftRef.current : rightRef.current;
    const dst = source === 'left' ? rightRef.current : leftRef.current;
    if (src && dst) {
      dst.scrollTop = src.scrollTop;
      dst.scrollLeft = src.scrollLeft;
    }
  }, [mode]);

  // Scroll to initial page on load
  useEffect(() => {
    if (originalHandle && initialPage > 0) {
      const target = leftRef.current?.children[initialPage] as HTMLElement;
      target?.scrollIntoView({ block: 'start' });
    }
  }, [originalHandle, initialPage]);

  // Pinch/wheel zoom
  useEffect(() => {
    function handleWheel(e: WheelEvent) {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        setZoom((z) => Math.min(3.0, Math.max(0.25, z - e.deltaY * 0.005)));
      }
    }
    window.addEventListener('wheel', handleWheel, { passive: false });
    return () => window.removeEventListener('wheel', handleWheel);
  }, []);

  if (isMinimized) {
    return (
      <button
        onClick={() => setIsMinimized(false)}
        className="fixed bottom-20 start-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-3 py-2 rounded-lg bg-primary text-primary-foreground shadow-lg text-xs font-medium hover:bg-primary/90"
      >
        <Maximize2 className="h-3.5 w-3.5" />
        {t('pdfEditor.beforeAfter')}
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold">{t('pdfEditor.beforeAfterComparison')}</h3>
          <div className="flex items-center gap-1 bg-muted rounded-md p-0.5">
            <button
              onClick={() => setMode('side-by-side')}
              className={`px-2 py-1 text-[10px] rounded ${mode === 'side-by-side' ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'}`}
              title={t('pdfEditor.sideBySide')}
            >
              <Columns2 className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setMode('overlay')}
              className={`px-2 py-1 text-[10px] rounded ${mode === 'overlay' ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'}`}
              title={t('pdfEditor.overlaySlider')}
            >
              <Layers className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Zoom controls */}
          <button onClick={() => setZoom((z) => Math.max(0.25, z - 0.25))} className="p-1 rounded hover:bg-muted" title={t('common.zoomOut')}>
            <ZoomOut className="h-4 w-4" />
          </button>
          <span className="text-xs font-mono w-12 text-center">{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom((z) => Math.min(3.0, z + 0.25))} className="p-1 rounded hover:bg-muted" title={t('common.zoomIn')}>
            <ZoomIn className="h-4 w-4" />
          </button>
          <div className="w-px h-5 bg-border mx-1" />
          <button onClick={() => setIsMinimized(true)} className="p-1 rounded hover:bg-muted" title={t('pdfEditor.minimize')}>
            <Minimize2 className="h-4 w-4" />
          </button>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted" title={t('common.close')}>
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <OtterLoader size="md" />
        </div>
      ) : mode === 'side-by-side' ? (
        <div className="flex-1 flex min-h-0">
          {/* Before panel */}
          <div className="flex-1 flex flex-col min-w-0 border-e">
            <div className="px-3 py-1.5 bg-muted/50 border-b text-[10px] font-medium text-muted-foreground text-center">
              BEFORE
            </div>
            <div
              ref={leftRef}
              className="flex-1 overflow-auto p-4"
              onScroll={() => handleScroll('left')}
              style={{ backgroundColor: '#e5e5e5' }}
            >
              <div className="flex flex-col items-center gap-4 max-w-[560px] mx-auto">
                {originalHandle && Array.from({ length: originalHandle.numPages }, (_, i) => {
                  const url = beforeSideBySide.get(i);
                  const aspectRatio = originalHandle.pageAspectRatios[i] ?? DEFAULT_PAGE_ASPECT_RATIO;
                  return (
                    <div
                      key={i}
                      data-page-index={i}
                      ref={(el) => {
                        if (el) beforeSideBySideEls.current.set(i, el);
                        else beforeSideBySideEls.current.delete(i);
                      }}
                      className="shadow-md bg-white flex-none"
                      style={{
                        width: `${zoom * 100}%`,
                        aspectRatio: `1 / ${aspectRatio}`,
                      }}
                    >
                      {url && (
                        <img src={url} alt={t('compareOverlay.beforePage', { page: i + 1 })} className="w-full h-full block" />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          {/* After panel */}
          <div className="flex-1 flex flex-col min-w-0">
            <div className="px-3 py-1.5 bg-muted/50 border-b text-[10px] font-medium text-muted-foreground text-center">
              AFTER
            </div>
            <div
              ref={rightRef}
              className="flex-1 overflow-auto p-4"
              onScroll={() => handleScroll('right')}
              style={{ backgroundColor: '#e5e5e5' }}
            >
              <div className="flex flex-col items-center gap-4 max-w-[560px] mx-auto">
                {previewHandle && Array.from({ length: previewHandle.numPages }, (_, i) => {
                  const url = afterSideBySide.get(i);
                  const aspectRatio = previewHandle.pageAspectRatios[i] ?? DEFAULT_PAGE_ASPECT_RATIO;
                  return (
                    <div
                      key={i}
                      data-page-index={i}
                      ref={(el) => {
                        if (el) afterSideBySideEls.current.set(i, el);
                        else afterSideBySideEls.current.delete(i);
                      }}
                      className="shadow-md bg-white flex-none"
                      style={{
                        width: `${zoom * 100}%`,
                        aspectRatio: `1 / ${aspectRatio}`,
                      }}
                    >
                      {url && (
                        <img src={url} alt={t('compareOverlay.afterPage', { page: i + 1 })} className="w-full h-full block" />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Overlay slider mode */
        <div ref={overlayScrollRef} className="flex-1 overflow-auto p-4 relative" style={{ backgroundColor: '#e5e5e5' }}>
          <div className="flex flex-col items-center gap-4 max-w-[560px] mx-auto">
            {originalHandle && Array.from({ length: originalHandle.numPages }, (_, i) => {
              const beforeUrl = beforeOverlay.get(i);
              const afterUrl = afterOverlay.get(i);
              const aspectRatio = originalHandle.pageAspectRatios[i] ?? DEFAULT_PAGE_ASPECT_RATIO;
              return (
                <div
                  key={i}
                  data-page-index={i}
                  ref={(el) => {
                    if (el) { beforeOverlayEls.current.set(i, el); afterOverlayEls.current.set(i, el); }
                    else { beforeOverlayEls.current.delete(i); afterOverlayEls.current.delete(i); }
                  }}
                  className="relative shadow-md overflow-hidden bg-white flex-none"
                  style={{
                    width: `${zoom * 100}%`,
                    aspectRatio: `1 / ${aspectRatio}`,
                  }}
                >
                  {/* After (full) */}
                  {(afterUrl || beforeUrl) && (
                    <img src={afterUrl || beforeUrl} alt={t('compareOverlay.afterPage', { page: i + 1 })} className="absolute inset-0 w-full h-full block" />
                  )}
                  {/* Before (clipped) */}
                  <div
                    className="absolute inset-0 overflow-hidden"
                    style={{ width: `${sliderPos}%` }}
                  >
                    {beforeUrl && (
                      <img
                        src={beforeUrl}
                        alt={t('compareOverlay.beforePage', { page: i + 1 })}
                        className="absolute inset-0 h-full block"
                        style={{ width: `${100 / (sliderPos / 100)}%`, maxWidth: 'none' }}
                      />
                    )}
                  </div>
                  {/* Slider line */}
                  <div
                    className="absolute top-0 bottom-0 w-0.5 bg-primary cursor-ew-resize z-10"
                    style={{ left: `${sliderPos}%` }}
                  />
                </div>
              );
            })}
          </div>
          {/* Slider control at bottom */}
          <div className="sticky bottom-4 flex justify-center mt-4">
            <div className="bg-background/90 backdrop-blur rounded-full px-4 py-2 shadow-lg flex items-center gap-3">
              <span className="text-[10px] text-muted-foreground">{t('compare.before')}</span>
              <input
                type="range"
                min={0}
                max={100}
                value={sliderPos}
                onChange={(e) => setSliderPos(Number(e.target.value))}
                className="w-48"
                title={t('pdfEditor.comparisonSlider')}
              />
              <span className="text-[10px] text-muted-foreground">{t('compare.after')}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
