// PagePanelThumbnail: renders a single page thumbnail for the PagePanel.
// Uses IntersectionObserver for lazy rendering and pdfBytes.slice() for StrictMode safety.
import { useEffect, useRef, useState, memo } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { Check } from 'lucide-react';

interface PagePanelThumbnailProps {
  pdfBytes: Uint8Array;
  pageIndex: number;
  /** Is this thumbnail in the multi-select set? */
  isSelected: boolean;
  /** Is this the page currently visible on the canvas? */
  isCurrent: boolean;
  onClick: (e: React.MouseEvent) => void;
  onDragStart?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
  onDragEnd?: (e: React.DragEvent) => void;
}

const THUMB_SCALE = 0.3;

export const PagePanelThumbnail = memo(function PagePanelThumbnail({
  pdfBytes,
  pageIndex,
  isSelected,
  isCurrent,
  onClick,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: PagePanelThumbnailProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [rendered, setRendered] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

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
      { rootMargin: '200px' },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

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

        const viewport = page.getViewport({ scale: THUMB_SCALE });
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
  }, [isVisible, rendered, pdfBytes, pageIndex]);

  // Re-render when pdfBytes change (page operations)
  useEffect(() => {
    if (!rendered) return;
    setRendered(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfBytes]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
    onDragOver?.(e);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    setIsDragOver(false);
    onDrop?.(e);
  };

  let borderClass = 'border-transparent';
  if (isSelected) {
    borderClass = 'border-blue-500 ring-2 ring-blue-500/30';
  } else if (isCurrent) {
    borderClass = 'border-blue-300/50';
  }

  return (
    <div
      ref={containerRef}
      draggable
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          onClick(e as unknown as React.MouseEvent);
        }
      }}
      onDragStart={onDragStart}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onDragEnd={onDragEnd}
      className={`
        relative cursor-pointer rounded-md border-2 transition-all mx-auto
        hover:border-muted-foreground/30
        ${borderClass}
      `}
      aria-label={`Page ${pageIndex + 1}`}
      aria-current={isCurrent ? 'page' : undefined}
      data-page-idx={pageIndex}
    >
      {/* Drop insertion indicator */}
      {isDragOver && (
        <div className="absolute -top-1 left-1 right-1 h-0.5 bg-blue-500 rounded-full z-10" />
      )}

      {/* Selection check indicator */}
      {isSelected && (
        <div className="absolute top-1 right-1 z-10 bg-blue-500 rounded-full p-0.5">
          <Check className="h-2.5 w-2.5 text-white" />
        </div>
      )}

      <div className="relative bg-white rounded overflow-hidden" style={{ width: 120, minHeight: 80 }}>
        {!rendered && (
          <div className="flex items-center justify-center" style={{ width: 120, height: 155 }}>
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
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
