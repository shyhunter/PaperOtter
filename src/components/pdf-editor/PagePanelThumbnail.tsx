// PagePanelThumbnail: renders a single page thumbnail for the PagePanel.
// Uses IntersectionObserver for lazy rendering and pdfBytes.slice() for StrictMode safety.
import { useEffect, useRef, useState, memo, type RefObject } from 'react';
import { acquireSharedPdfDocument, releaseSharedPdfDocument } from '@/lib/pdfThumbnail';
import { Check } from 'lucide-react';
import { diagLog } from '@/lib/diagLog';
import { t } from '@/i18n';
import { OtterSpinner } from '@/components/brand/OtterSpinner';

interface PagePanelThumbnailProps {
  pdfBytes: Uint8Array;
  pageIndex: number;
  /** Is this thumbnail in the multi-select set? */
  isSelected: boolean;
  /** Is this the page currently visible on the canvas? */
  isCurrent: boolean;
  /** Is this thumbnail currently being dragged? */
  isDragSource?: boolean;
  onClick: (e: React.MouseEvent) => void;
  /** Scrollable thumbnail list container — used as the IntersectionObserver root so
   *  off-screen thumbnails aren't all treated as visible at once. */
  scrollContainerRef: RefObject<HTMLDivElement | null>;
}

const THUMB_SCALE = 0.3;

export const PagePanelThumbnail = memo(function PagePanelThumbnail({
  pdfBytes,
  pageIndex,
  isSelected,
  isCurrent,
  isDragSource = false,
  onClick,
  scrollContainerRef,
}: PagePanelThumbnailProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [rendered, setRendered] = useState(false);

  // IntersectionObserver for lazy loading
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
    let acquired = false;

    async function render() {
      const t0 = performance.now();
      diagLog(`thumb.render.start idx=${pageIndex}`);
      try {
        const pdfDoc = await acquireSharedPdfDocument(pdfBytes);
        acquired = true;
        if (cancelled) return;

        const page = await pdfDoc.getPage(pageIndex + 1);
        if (cancelled) return;

        const viewport = page.getViewport({ scale: THUMB_SCALE });
        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        await page.render({ canvas, viewport }).promise;
        diagLog(`thumb.render.done idx=${pageIndex} ms=${(performance.now() - t0).toFixed(0)}`);
        if (!cancelled) setRendered(true);
      } catch (err) {
        diagLog(`thumb.render.threw idx=${pageIndex} ms=${(performance.now() - t0).toFixed(0)} ${err}`);
      } finally {
        if (acquired) releaseSharedPdfDocument(pdfBytes);
      }
    }

    render();
    return () => { cancelled = true; };
  }, [isVisible, rendered, pdfBytes, pageIndex]);

  // Re-render when pdfBytes change (page operations)
  useEffect(() => {
    if (!rendered) return;
    setRendered(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfBytes]);

  let borderClass = 'border-transparent';
  if (isSelected) {
    borderClass = 'border-blue-500 ring-2 ring-blue-500/30';
  } else if (isCurrent) {
    borderClass = 'border-blue-300/50';
  }

  return (
    <div
      ref={containerRef}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          onClick(e as unknown as React.MouseEvent);
        }
      }}
      className={`
        relative cursor-pointer rounded-md border-2 transition-all mx-auto
        hover:border-muted-foreground/30
        ${borderClass}
        ${isDragSource ? 'opacity-40' : ''}
      `}
      aria-label={t('split.pageN', { page: pageIndex + 1 })}
      aria-current={isCurrent ? 'page' : undefined}
      data-page-idx={pageIndex}
    >
      {/* Selection check indicator */}
      {isSelected && (
        <div className="absolute top-1 end-1 z-10 bg-blue-500 rounded-full p-0.5">
          <Check className="h-2.5 w-2.5 text-white" />
        </div>
      )}

      <div className="relative bg-white rounded overflow-hidden" style={{ width: 120, minHeight: 80 }}>
        {!rendered && (
          <div className="flex items-center justify-center" style={{ width: 120, height: 155 }}>
            <OtterSpinner className="size-4" />
          </div>
        )}
        <canvas
          ref={canvasRef}
          className={rendered ? '' : 'invisible'}
          style={{ display: 'block', width: '100%' }}
        />
      </div>
      <p className="text-center text-[10px] text-muted-foreground mt-0.5 mb-0.5">{pageIndex + 1}</p>
    </div>
  );
});
