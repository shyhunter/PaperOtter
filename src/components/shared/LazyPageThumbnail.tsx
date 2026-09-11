// LazyPageThumbnail: renders a single PDF page thumbnail on-demand, once it
// scrolls near the given scroll container's viewport, instead of every page
// being rasterized up front. Rendering all pages eagerly (renderAllPdfPages)
// freezes the app on large documents (hundreds of pages).
//
// It takes an already-parsed document rather than raw bytes. It used to call
// getDocument itself, which meant a full copy of the file and a complete parse
// of every page PER TILE -- roughly twenty at once with a 200px root margin, so
// a 3-4 MB 134-page file froze the window outright. The grid parses once now
// (usePdfDocument) and every tile shares that proxy.
import { useEffect, useRef, useState, memo, type CSSProperties, type RefObject } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { OtterSpinner } from '@/components/brand/OtterSpinner';

interface LazyPageThumbnailProps {
  /** Shared, already-parsed document. Null while the grid is still loading it. */
  doc: pdfjsLib.PDFDocumentProxy | null;
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
  doc,
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
    if (!isVisible || rendered || !doc) return;
    let cancelled = false;

    async function render() {
      try {
        // No getDocument here on purpose. The document is owned by the grid, so
        // this must neither parse nor destroy it -- destroying a shared proxy
        // would blank every other tile.
        const page = await doc!.getPage(pageIndex + 1);
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
      }
    }

    render();
    return () => { cancelled = true; };
  }, [isVisible, rendered, doc, pageIndex, scale]);

  // Re-render when the document changes (e.g. page operations elsewhere). The
  // grid reloads the document when its bytes change, so this identity is the
  // same signal `pdfBytes` used to be.
  useEffect(() => {
    if (!rendered) return;
    setRendered(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc]);

  return (
    <div ref={containerRef} className={className}>
      {!rendered && (
        <div className="flex h-full w-full items-center justify-center">
          <OtterSpinner className="size-4" />
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
