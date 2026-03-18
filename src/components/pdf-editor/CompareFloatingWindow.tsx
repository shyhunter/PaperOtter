// CompareSidePanel: inline side panel showing the original (unmodified) PDF
// alongside the editor canvas. Visible while editing — not a modal overlay.
// Supports: scroll sync with main canvas, independent zoom, resize handle.
import { useEffect, useRef, useState, useCallback, memo } from 'react';
import { X, ZoomIn, ZoomOut, GripVertical } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import { useEditorContext } from '@/context/EditorContext';

const PAGE_GAP = 16;
const VIRTUALIZATION_WINDOW = 3;
const DEFAULT_PANEL_WIDTH = 400;
const MIN_PANEL_WIDTH = 200;
const MAX_PANEL_WIDTH = 800;

interface PageInfo {
  width: number;
  height: number;
}

// ── Page renderer (read-only) ───────────────────────────────────────

interface PageRendererProps {
  pdfBytes: Uint8Array;
  pageIndex: number;
  zoom: number;
}

const PageRenderer = memo(function PageRenderer({
  pdfBytes,
  pageIndex,
  zoom,
}: PageRendererProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderIdRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || pdfBytes.byteLength === 0) return;

    const currentId = ++renderIdRef.current;

    const timer = setTimeout(async () => {
      try {
        const loadingTask = pdfjsLib.getDocument({ data: pdfBytes.slice() });
        const pdfDoc = await loadingTask.promise;
        try {
          if (renderIdRef.current !== currentId) return;
          const page = await pdfDoc.getPage(pageIndex + 1);
          if (renderIdRef.current !== currentId) return;
          const viewport = page.getViewport({ scale: zoom });
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          await page.render({ canvas, viewport }).promise;
        } finally {
          pdfDoc.destroy();
        }
      } catch {
        // Non-fatal
      }
    }, 120);

    return () => clearTimeout(timer);
  }, [pdfBytes, pageIndex, zoom]);

  return <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />;
});

// ── Main CompareSidePanel ────────────────────────────────────────────

export function CompareFloatingWindow() {
  const { state, setCompareMode } = useEditorContext();
  const { originalPdfBytes, currentPage } = state;

  const [zoom, setZoom] = useState(0.6);
  const [pageInfos, setPageInfos] = useState<PageInfo[]>([]);
  const [panelWidth, setPanelWidth] = useState(DEFAULT_PANEL_WIDTH);

  const scrollRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  // Load page dimensions
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (originalPdfBytes.byteLength === 0) return;
      const loadingTask = pdfjsLib.getDocument({ data: originalPdfBytes.slice() });
      const pdfDoc = await loadingTask.promise;
      try {
        const infos: PageInfo[] = [];
        for (let i = 1; i <= pdfDoc.numPages; i++) {
          const page = await pdfDoc.getPage(i);
          const vp = page.getViewport({ scale: 1 });
          infos.push({ width: vp.width, height: vp.height });
        }
        if (!cancelled) setPageInfos(infos);
      } finally {
        pdfDoc.destroy();
      }
    }
    load();
    return () => { cancelled = true; };
  }, [originalPdfBytes]);

  // Auto-scroll to current page when it changes in the main editor
  useEffect(() => {
    if (!scrollRef.current || pageInfos.length === 0) return;
    // Find the target page element by index
    const target = scrollRef.current.querySelector(`[data-compare-page="${currentPage}"]`);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [currentPage, pageInfos]);

  // Pinch-to-zoom within the compare panel
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    function handleWheel(e: WheelEvent) {
      if (e.ctrlKey) {
        e.preventDefault();
        e.stopPropagation();
        const delta = -e.deltaY * 0.01;
        const newZoom = Math.min(3.0, Math.max(0.15, zoomRef.current + delta));
        setZoom(newZoom);
      }
    }

    let gestureStartZoom = 1.0;
    function handleGestureStart(e: Event) {
      e.preventDefault();
      gestureStartZoom = zoomRef.current;
    }
    function handleGestureChange(e: Event) {
      e.preventDefault();
      const ge = e as unknown as { scale: number };
      const newZoom = Math.min(3.0, Math.max(0.15, gestureStartZoom * ge.scale));
      setZoom(newZoom);
    }

    el.addEventListener('wheel', handleWheel, { passive: false });
    el.addEventListener('gesturestart', handleGestureStart, { passive: false } as AddEventListenerOptions);
    el.addEventListener('gesturechange', handleGestureChange, { passive: false } as AddEventListenerOptions);

    return () => {
      el.removeEventListener('wheel', handleWheel);
      el.removeEventListener('gesturestart', handleGestureStart);
      el.removeEventListener('gesturechange', handleGestureChange);
    };
  }, []);

  // Resize handle: drag to resize the panel width
  const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = panelWidth;

    const handleMouseMove = (ev: MouseEvent) => {
      // Dragging left = wider panel (since panel is on the right side, but resize handle is on the left edge)
      const newWidth = Math.min(MAX_PANEL_WIDTH, Math.max(MIN_PANEL_WIDTH, startWidth - (ev.clientX - startX)));
      setPanelWidth(newWidth);
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [panelWidth]);

  return (
    <div className="flex h-full flex-none border-l border-border" style={{ width: panelWidth }}>
      {/* Resize handle */}
      <div
        className="w-1.5 flex-none cursor-col-resize hover:bg-primary/20 active:bg-primary/30 transition-colors flex items-center justify-center"
        onMouseDown={handleResizeMouseDown}
      >
        <GripVertical className="h-4 w-4 text-muted-foreground/50" />
      </div>

      {/* Panel content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between px-2 py-1.5 border-b flex-none bg-muted/30">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
            Original
          </span>

          <div className="flex items-center gap-1">
            <button onClick={() => setZoom((z) => Math.max(0.15, z - 0.15))} className="p-0.5 rounded hover:bg-muted" title="Zoom out">
              <ZoomOut className="h-3 w-3" />
            </button>
            <span className="text-[10px] font-mono w-8 text-center text-muted-foreground">{Math.round(zoom * 100)}%</span>
            <button onClick={() => setZoom((z) => Math.min(3.0, z + 0.15))} className="p-0.5 rounded hover:bg-muted" title="Zoom in">
              <ZoomIn className="h-3 w-3" />
            </button>
            <div className="w-px h-3.5 bg-border mx-0.5" />
            <button onClick={() => setCompareMode('off')} className="p-0.5 rounded hover:bg-muted" title="Close compare panel">
              <X className="h-3 w-3" />
            </button>
          </div>
        </div>

        {/* Scrollable page list */}
        {pageInfos.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
          </div>
        ) : (
          <div
            ref={scrollRef}
            className="flex-1 overflow-auto"
            style={{ backgroundColor: 'var(--editor-canvas-bg, #e5e5e5)' }}
          >
            <div className="flex flex-col items-center py-4 px-3" style={{ gap: PAGE_GAP }}>
              {pageInfos.map((info, idx) => {
                const scaledW = info.width * zoom;
                const scaledH = info.height * zoom;
                const isNearViewport = Math.abs(idx - currentPage) <= VIRTUALIZATION_WINDOW;

                return (
                  <div
                    key={idx}
                    data-compare-page={idx}
                    className="shadow-md bg-white flex-shrink-0 relative"
                    style={{ width: scaledW, height: scaledH }}
                  >
                    {isNearViewport ? (
                      <PageRenderer pdfBytes={originalPdfBytes} pageIndex={idx} zoom={zoom} />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">
                        {idx + 1}
                      </div>
                    )}
                    {/* Page number badge */}
                    <div className="absolute bottom-1 right-1 bg-black/50 text-white text-[9px] px-1 rounded">
                      {idx + 1}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
