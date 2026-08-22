// LazyPageThumbnail: renders a single PDF page thumbnail on-demand, once it
// scrolls near the given scroll container's viewport, instead of every page
// being rasterized up front. Rendering all pages eagerly (renderAllPdfPages)
// freezes the app on large documents (hundreds of pages).
import { useEffect, useRef, useState, memo, type CSSProperties, type RefObject } from 'react';
import * as pdfjsLib from 'pdfjs-dist';

interface LazyPageThumbnailProps {
  pdfBytes: Uint8Array;
  /** Zero-based page index to render */
  pageIndex: number;
  scale?: number;
  /** Scrollable ancestor used as the IntersectionObserver root */
  scrollContainerRef: RefObject<HTMLElement | null>;
  /** Classes for the outer wrapper (sizing/positioning) */
  className?: string;
  /** Classes for the rendered canvas itself */
  canvasClassName?: string;
  /** Inline style for the rendered canvas (e.g. a rotation transform) */
  canvasStyle?: CSSProperties;
}

export const LazyPageThumbnail = memo(function LazyPageThumbnail({
  pdfBytes,
  pageIndex,
  scale = 0.3,
  scrollContainerRef,
  className,
  canvasClassName,
  canvasStyle,
}: LazyPageThumbnailProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [rendered, setRendered] = useState(false);

  // IntersectionObserver for lazy loading, scoped to the actual scroll container
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { root: scrollContainerRef.current, rootMargin: '200px' },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [scrollContainerRef]);

  // Render thumbnail when visible
  useEffect(() => {
    if (!isVisible || rendered) return;
    let cancelled = false;
    let pdfDoc: pdfjsLib.PDFDocumentProxy | null = null;

    async function render() {
      try {
        const loadingTask = pdfjsLib.getDocument({ data: pdfBytes.slice() });
        pdfDoc = await loadingTask.promise;
        if (cancelled) return;

        const page = await pdfDoc.getPage(pageIndex + 1);
        if (cancelled) return;

        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        await page.render({ canvas, viewport }).promise;
        if (!cancelled) setRendered(true);
      } catch {
        // Thumbnail rendering is non-critical
      } finally {
        pdfDoc?.destroy();
      }
    }

    render();
    return () => { cancelled = true; };
  }, [isVisible, rendered, pdfBytes, pageIndex, scale]);

  // Re-render when pdfBytes identity changes (e.g. page operations elsewhere)
  useEffect(() => {
    if (!rendered) return;
    setRendered(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfBytes]);

  return (
    <div ref={containerRef} className={className}>
      {!rendered && (
        <div className="flex h-full w-full items-center justify-center">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
        </div>
      )}
      <canvas
        ref={canvasRef}
        className={canvasClassName}
        style={{ ...canvasStyle, display: rendered ? undefined : 'none' }}
      />
    </div>
  );
});
