// CompareOverlay: full-page before/after comparison that overlays the editor canvas.
// Features: side-by-side or overlay mode, zoom, scroll sync, closable, minimizable.
// Opens from ToolSidebarPreview when user wants a closer look.
import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Minimize2, Maximize2, Columns2, Layers, ZoomIn, ZoomOut } from 'lucide-react';
import { renderAllPdfPages } from '@/lib/pdfThumbnail';

export type CompareMode = 'overlay' | 'side-by-side';

interface CompareOverlayProps {
  originalBytes: Uint8Array;
  previewBytes: Uint8Array;
  onClose: () => void;
  initialPage?: number;
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
  const [beforeUrls, setBeforeUrls] = useState<string[]>([]);
  const [afterUrls, setAfterUrls] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  // For overlay mode: slider position (0-100%)
  const [sliderPos, setSliderPos] = useState(50);
  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);

  // Render all pages
  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    Promise.all([
      renderAllPdfPages(originalBytes, 1.5),
      renderAllPdfPages(previewBytes, 1.5),
    ]).then(([before, after]) => {
      if (!cancelled) {
        setBeforeUrls(before);
        setAfterUrls(after);
        setIsLoading(false);
      }
    }).catch(() => {
      if (!cancelled) setIsLoading(false);
    });

    return () => { cancelled = true; };
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
    if (beforeUrls.length > 0 && initialPage > 0) {
      const target = leftRef.current?.children[initialPage] as HTMLElement;
      target?.scrollIntoView({ block: 'start' });
    }
  }, [beforeUrls, initialPage]);

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
        className="fixed bottom-20 right-4 z-50 flex items-center gap-2 px-3 py-2 rounded-lg bg-primary text-primary-foreground shadow-lg text-xs font-medium hover:bg-primary/90"
      >
        <Maximize2 className="h-3.5 w-3.5" />
        Before / After
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold">Before / After Comparison</h3>
          <div className="flex items-center gap-1 bg-muted rounded-md p-0.5">
            <button
              onClick={() => setMode('side-by-side')}
              className={`px-2 py-1 text-[10px] rounded ${mode === 'side-by-side' ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'}`}
              title="Side by side"
            >
              <Columns2 className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setMode('overlay')}
              className={`px-2 py-1 text-[10px] rounded ${mode === 'overlay' ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'}`}
              title="Overlay slider"
            >
              <Layers className="h-3.5 w-3.5" />
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
          <button onClick={onClose} className="p-1 rounded hover:bg-muted" title="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
        </div>
      ) : mode === 'side-by-side' ? (
        <div className="flex-1 flex min-h-0">
          {/* Before panel */}
          <div className="flex-1 flex flex-col min-w-0 border-r">
            <div className="px-3 py-1.5 bg-muted/50 border-b text-[10px] font-medium text-muted-foreground text-center">
              BEFORE
            </div>
            <div
              ref={leftRef}
              className="flex-1 overflow-auto p-4"
              onScroll={() => handleScroll('left')}
              style={{ backgroundColor: '#e5e5e5' }}
            >
              <div className="flex flex-col items-center gap-4">
                {beforeUrls.map((url, i) => (
                  <img
                    key={i}
                    src={url}
                    alt={`Before page ${i + 1}`}
                    className="shadow-md"
                    style={{ transform: `scale(${zoom})`, transformOrigin: 'top center' }}
                  />
                ))}
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
              <div className="flex flex-col items-center gap-4">
                {afterUrls.map((url, i) => (
                  <img
                    key={i}
                    src={url}
                    alt={`After page ${i + 1}`}
                    className="shadow-md"
                    style={{ transform: `scale(${zoom})`, transformOrigin: 'top center' }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Overlay slider mode */
        <div className="flex-1 overflow-auto p-4 relative" style={{ backgroundColor: '#e5e5e5' }}>
          <div className="flex flex-col items-center gap-4">
            {beforeUrls.map((beforeUrl, i) => (
              <div key={i} className="relative shadow-md overflow-hidden" style={{ transform: `scale(${zoom})`, transformOrigin: 'top center' }}>
                {/* After (full) */}
                <img src={afterUrls[i] || beforeUrl} alt={`After page ${i + 1}`} className="block" />
                {/* Before (clipped) */}
                <div
                  className="absolute inset-0 overflow-hidden"
                  style={{ width: `${sliderPos}%` }}
                >
                  <img src={beforeUrl} alt={`Before page ${i + 1}`} className="block" style={{ width: `${100 / (sliderPos / 100)}%`, maxWidth: 'none' }} />
                </div>
                {/* Slider line */}
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-primary cursor-ew-resize z-10"
                  style={{ left: `${sliderPos}%` }}
                />
              </div>
            ))}
          </div>
          {/* Slider control at bottom */}
          <div className="sticky bottom-4 flex justify-center mt-4">
            <div className="bg-background/90 backdrop-blur rounded-full px-4 py-2 shadow-lg flex items-center gap-3">
              <span className="text-[10px] text-muted-foreground">Before</span>
              <input
                type="range"
                min={0}
                max={100}
                value={sliderPos}
                onChange={(e) => setSliderPos(Number(e.target.value))}
                className="w-48"
                title="Comparison slider"
              />
              <span className="text-[10px] text-muted-foreground">After</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
