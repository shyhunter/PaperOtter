// CompareView: full-page side-by-side comparison overlay.
// Shows original (unmodified) PDF alongside the current edited PDF.
// Supports: side-by-side mode, pinch/wheel zoom, scroll sync, minimize, close.
import { useEffect, useRef, useState, useCallback, memo } from 'react';
import { X, Minimize2, Maximize2, Columns2, Layers, ZoomIn, ZoomOut } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import { useEditorContext } from '@/context/EditorContext';

const PAGE_GAP = 16;
const VIRTUALIZATION_WINDOW = 3;

type ViewMode = 'side-by-side' | 'overlay';

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

// ── ScrollPanel: renders pages for one side ──────────────────────────

interface ScrollPanelProps {
  label: string;
  pdfBytes: Uint8Array;
  pageInfos: PageInfo[];
  zoom: number;
  currentPage: number;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  onScroll: () => void;
}

function ScrollPanel({ label, pdfBytes, pageInfos, zoom, currentPage, scrollRef, onScroll }: ScrollPanelProps) {
  return (
    <div className="flex-1 flex flex-col min-w-0">
      <div className="px-3 py-1.5 bg-muted/50 border-b text-[10px] font-medium text-muted-foreground text-center flex-none">
        {label}
      </div>
      <div
        ref={scrollRef}
        className="flex-1 overflow-auto"
        onScroll={onScroll}
        style={{ backgroundColor: 'var(--editor-canvas-bg, #e5e5e5)' }}
      >
        <div className="flex flex-col items-center py-6 px-6" style={{ gap: PAGE_GAP }}>
          {pageInfos.map((info, idx) => {
            const scaledW = info.width * zoom;
            const scaledH = info.height * zoom;
            const isNearViewport = Math.abs(idx - currentPage) <= VIRTUALIZATION_WINDOW;

            return (
              <div
                key={idx}
                className="shadow-md bg-white flex-shrink-0 relative"
                style={{ width: scaledW, height: scaledH }}
              >
                {isNearViewport ? (
                  <PageRenderer pdfBytes={pdfBytes} pageIndex={idx} zoom={zoom} />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">
                    {idx + 1}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Main CompareView ────────────────────────────────────────────────

export function CompareFloatingWindow() {
  const { state, setCompareMode } = useEditorContext();
  const { originalPdfBytes, pdfBytes, currentPage } = state;

  const [isMinimized, setIsMinimized] = useState(false);
  const [zoom, setZoom] = useState(1.0);
  const [viewMode, setViewMode] = useState<ViewMode>('side-by-side');
  const [pageInfos, setPageInfos] = useState<PageInfo[]>([]);
  const [sliderPos, setSliderPos] = useState(50);

  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
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

  // Scroll sync between left and right panels
  const syncingRef = useRef(false);
  const handleLeftScroll = useCallback(() => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    if (leftRef.current && rightRef.current) {
      rightRef.current.scrollTop = leftRef.current.scrollTop;
      rightRef.current.scrollLeft = leftRef.current.scrollLeft;
    }
    requestAnimationFrame(() => { syncingRef.current = false; });
  }, []);

  const handleRightScroll = useCallback(() => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    if (leftRef.current && rightRef.current) {
      leftRef.current.scrollTop = rightRef.current.scrollTop;
      leftRef.current.scrollLeft = rightRef.current.scrollLeft;
    }
    requestAnimationFrame(() => { syncingRef.current = false; });
  }, []);

  // Pinch-to-zoom: wheel+ctrlKey
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    function handleWheel(e: WheelEvent) {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        e.stopPropagation();
        const delta = -e.deltaY * 0.01;
        const newZoom = Math.min(3.0, Math.max(0.25, zoomRef.current + delta));
        setZoom(newZoom);
      }
    }

    // Safari gesture events
    let gestureStartZoom = 1.0;
    function handleGestureStart(e: Event) {
      e.preventDefault();
      gestureStartZoom = zoomRef.current;
    }
    function handleGestureChange(e: Event) {
      e.preventDefault();
      const ge = e as unknown as { scale: number };
      const newZoom = Math.min(3.0, Math.max(0.25, gestureStartZoom * ge.scale));
      setZoom(newZoom);
    }

    container.addEventListener('wheel', handleWheel, { passive: false });
    container.addEventListener('gesturestart', handleGestureStart, { passive: false } as EventListenerOptions);
    container.addEventListener('gesturechange', handleGestureChange, { passive: false } as EventListenerOptions);

    return () => {
      container.removeEventListener('wheel', handleWheel);
      container.removeEventListener('gesturestart', handleGestureStart);
      container.removeEventListener('gesturechange', handleGestureChange);
    };
  }, []);

  if (isMinimized) {
    return (
      <button
        onClick={() => setIsMinimized(false)}
        className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-3 py-2 rounded-lg bg-primary text-primary-foreground shadow-lg text-xs font-medium hover:bg-primary/90"
      >
        <Maximize2 className="h-3.5 w-3.5" />
        Before / After
      </button>
    );
  }

  return (
    <div ref={containerRef} className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b flex-none">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold">Before / After Comparison</h3>
          <div className="flex items-center gap-1 bg-muted rounded-md p-0.5">
            <button
              onClick={() => setViewMode('side-by-side')}
              className={`px-2 py-1 text-[10px] rounded flex items-center gap-1 ${
                viewMode === 'side-by-side' ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'
              }`}
              title="Side by side"
            >
              <Columns2 className="h-3.5 w-3.5" />
              <span>Side by Side</span>
            </button>
            <button
              onClick={() => setViewMode('overlay')}
              className={`px-2 py-1 text-[10px] rounded flex items-center gap-1 ${
                viewMode === 'overlay' ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'
              }`}
              title="Overlay slider"
            >
              <Layers className="h-3.5 w-3.5" />
              <span>Overlay</span>
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Zoom controls */}
          <button onClick={() => setZoom((z) => Math.max(0.25, z - 0.25))} className="p-1 rounded hover:bg-muted" title="Zoom out">
            <ZoomOut className="h-4 w-4" />
          </button>
          <span className="text-xs font-mono w-12 text-center">{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom((z) => Math.min(3.0, z + 0.25))} className="p-1 rounded hover:bg-muted" title="Zoom in">
            <ZoomIn className="h-4 w-4" />
          </button>
          <div className="w-px h-5 bg-border mx-1" />
          <button onClick={() => setIsMinimized(true)} className="p-1 rounded hover:bg-muted" title="Minimize">
            <Minimize2 className="h-4 w-4" />
          </button>
          <button onClick={() => setCompareMode('off')} className="p-1 rounded hover:bg-muted" title="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      {pageInfos.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
        </div>
      ) : viewMode === 'side-by-side' ? (
        <div className="flex-1 flex min-h-0">
          <ScrollPanel
            label="ORIGINAL"
            pdfBytes={originalPdfBytes}
            pageInfos={pageInfos}
            zoom={zoom}
            currentPage={currentPage}
            scrollRef={leftRef}
            onScroll={handleLeftScroll}
          />
          <div className="w-px bg-border flex-none" />
          <ScrollPanel
            label="EDITED"
            pdfBytes={pdfBytes}
            pageInfos={pageInfos}
            zoom={zoom}
            currentPage={currentPage}
            scrollRef={rightRef}
            onScroll={handleRightScroll}
          />
        </div>
      ) : (
        /* Overlay slider mode */
        <div className="flex-1 overflow-auto p-4 relative" style={{ backgroundColor: '#e5e5e5' }}>
          <div className="flex flex-col items-center gap-4">
            {pageInfos.map((info, idx) => {
              const scaledW = info.width * zoom;
              const scaledH = info.height * zoom;
              const isNearViewport = Math.abs(idx - currentPage) <= VIRTUALIZATION_WINDOW;

              return (
                <div key={idx} className="relative shadow-md overflow-hidden bg-white" style={{ width: scaledW, height: scaledH }}>
                  {isNearViewport ? (
                    <>
                      {/* Edited (full width behind) */}
                      <div className="absolute inset-0">
                        <PageRenderer pdfBytes={pdfBytes} pageIndex={idx} zoom={zoom} />
                      </div>
                      {/* Original (clipped by slider) */}
                      <div className="absolute inset-0 overflow-hidden" style={{ width: `${sliderPos}%` }}>
                        <div style={{ width: scaledW, height: scaledH }}>
                          <PageRenderer pdfBytes={originalPdfBytes} pageIndex={idx} zoom={zoom} />
                        </div>
                      </div>
                      {/* Slider line */}
                      <div
                        className="absolute top-0 bottom-0 w-0.5 bg-primary z-10"
                        style={{ left: `${sliderPos}%` }}
                      />
                    </>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">
                      {idx + 1}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {/* Slider control */}
          <div className="sticky bottom-4 flex justify-center mt-4">
            <div className="bg-background/90 backdrop-blur rounded-full px-4 py-2 shadow-lg flex items-center gap-3">
              <span className="text-[10px] text-muted-foreground">Original</span>
              <input
                type="range"
                min={0}
                max={100}
                value={sliderPos}
                onChange={(e) => setSliderPos(Number(e.target.value))}
                className="w-48"
                title="Comparison slider"
              />
              <span className="text-[10px] text-muted-foreground">Edited</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
