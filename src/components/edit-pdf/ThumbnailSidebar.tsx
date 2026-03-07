// ThumbnailSidebar: collapsible page thumbnails with navigation controls.
// Lazy-loads thumbnails using IntersectionObserver for performance.
// Uses pdfBytes.slice() for React StrictMode safety.
import { useState, useEffect, useRef, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { ChevronLeft, ChevronRight, ChevronUp, ChevronDown } from 'lucide-react';

interface ThumbnailSidebarProps {
  /** PDF file bytes */
  pdfBytes: Uint8Array;
  /** Total number of pages */
  pageCount: number;
  /** Currently active page (zero-based) */
  currentPage: number;
  /** Called when user selects a page */
  onPageSelect: (pageIndex: number) => void;
}

/** Renders a single thumbnail image using IntersectionObserver for lazy loading. */
function LazyThumbnail({
  pdfBytes,
  pageIndex,
  isActive,
  onClick,
}: {
  pdfBytes: Uint8Array;
  pageIndex: number;
  isActive: boolean;
  onClick: () => void;
}) {
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
      { rootMargin: '200px' }, // 2-page buffer
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

        const scale = 120 / page.getViewport({ scale: 1 }).width;
        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        await page.render({ canvas, viewport }).promise;
        if (!cancelled) setRendered(true);
      } catch {
        // Silently fail — thumbnail is non-critical
      } finally {
        pdfDoc?.destroy();
      }
    }

    render();
    return () => { cancelled = true; };
  }, [isVisible, rendered, pdfBytes, pageIndex]);

  return (
    <div
      ref={containerRef}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); }}
      className={`
        cursor-pointer rounded-md border-2 transition-all mx-auto
        ${isActive
          ? 'border-blue-500 ring-2 ring-blue-500/30 shadow-sm'
          : 'border-transparent hover:border-muted-foreground/30'
        }
      `}
      aria-label={`Page ${pageIndex + 1}`}
      aria-current={isActive ? 'page' : undefined}
    >
      <div className="relative bg-white rounded overflow-hidden" style={{ width: 120, minHeight: 80 }}>
        {!rendered && (
          <div className="flex items-center justify-center" style={{ width: 120, height: 160 }}>
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
          </div>
        )}
        <canvas ref={canvasRef} className={rendered ? '' : 'invisible'} style={{ display: 'block', width: '100%' }} />
      </div>
      <p className="text-center text-[10px] text-muted-foreground mt-1">{pageIndex + 1}</p>
    </div>
  );
}

export function ThumbnailSidebar({
  pdfBytes,
  pageCount,
  currentPage,
  onPageSelect,
}: ThumbnailSidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [pageInput, setPageInput] = useState('');
  const activeRef = useRef<HTMLDivElement>(null);

  // Scroll active thumbnail into view when page changes
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [currentPage]);

  const handlePrevPage = useCallback(() => {
    if (currentPage > 0) onPageSelect(currentPage - 1);
  }, [currentPage, onPageSelect]);

  const handleNextPage = useCallback(() => {
    if (currentPage < pageCount - 1) onPageSelect(currentPage + 1);
  }, [currentPage, pageCount, onPageSelect]);

  const handlePageInputSubmit = useCallback(() => {
    const num = parseInt(pageInput, 10);
    if (!isNaN(num) && num >= 1 && num <= pageCount) {
      onPageSelect(num - 1);
    }
    setPageInput('');
  }, [pageInput, pageCount, onPageSelect]);

  if (isCollapsed) {
    return (
      <div className="flex flex-col items-center border-r border-border bg-muted/30" style={{ width: 40 }}>
        <button
          type="button"
          onClick={() => setIsCollapsed(false)}
          className="p-2 text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Expand sidebar"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col border-r border-border bg-muted/30" style={{ width: 160 }}>
      {/* Collapse button */}
      <div className="flex items-center justify-between px-2 py-1 border-b border-border">
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Pages</span>
        <button
          type="button"
          onClick={() => setIsCollapsed(true)}
          className="p-1 text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Collapse sidebar"
        >
          <ChevronLeft className="h-3 w-3" />
        </button>
      </div>

      {/* Thumbnail list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {Array.from({ length: pageCount }, (_, i) => (
          <div key={i} ref={i === currentPage ? activeRef : undefined}>
            <LazyThumbnail
              pdfBytes={pdfBytes}
              pageIndex={i}
              isActive={i === currentPage}
              onClick={() => onPageSelect(i)}
            />
          </div>
        ))}
      </div>

      {/* Navigation controls at bottom */}
      <div className="border-t border-border px-2 py-2 space-y-2">
        {/* Prev / Next arrows */}
        <div className="flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={handlePrevPage}
            disabled={currentPage === 0}
            className="p-1 rounded text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            aria-label="Previous page"
          >
            <ChevronUp className="h-4 w-4" />
          </button>
          <span className="text-xs text-muted-foreground">
            {currentPage + 1} / {pageCount}
          </span>
          <button
            type="button"
            onClick={handleNextPage}
            disabled={currentPage === pageCount - 1}
            className="p-1 rounded text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            aria-label="Next page"
          >
            <ChevronDown className="h-4 w-4" />
          </button>
        </div>

        {/* Page number input */}
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-muted-foreground">Go to:</span>
          <input
            type="text"
            value={pageInput}
            onChange={(e) => setPageInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handlePageInputSubmit(); }}
            placeholder={String(currentPage + 1)}
            className="w-10 px-1 py-0.5 text-[10px] text-center border border-border rounded bg-background text-foreground"
            aria-label="Go to page number"
          />
        </div>
      </div>
    </div>
  );
}
