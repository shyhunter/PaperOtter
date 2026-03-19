// Full comparison overlay: side-by-side Before (original) / After (current edited)
// with synced scrolling, zoom controls — mirrors the CompareStep UX.
import { useEffect, useState, useRef, useCallback } from 'react';
import { X, ZoomIn, ZoomOut } from 'lucide-react';
import { renderAllPdfPages } from '@/lib/pdfThumbnail';
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

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(2)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

interface PreviewPanelProps {
  label: string;
  sizeLabel: string;
  pageUrls: string[];
  isRendering: boolean;
  hasError: boolean;
  zoomWrapperClass: string;
  scrollRef?: React.RefObject<HTMLDivElement | null>;
  onScroll?: () => void;
}

function PreviewPanel({
  label,
  sizeLabel,
  pageUrls,
  isRendering,
  hasError,
  zoomWrapperClass,
  scrollRef,
  onScroll,
}: PreviewPanelProps) {
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
        ) : isRendering ? (
          <div className="flex h-full min-h-[300px] flex-col items-center justify-center gap-3">
            <div className="h-8 w-8 rounded-full border-2 border-muted-foreground/30 border-t-primary animate-spin" />
            <span className="text-sm text-muted-foreground">Rendering preview...</span>
          </div>
        ) : (
          <div className={cn(zoomWrapperClass, 'animate-fade-slide-in')}>
            {pageUrls.map((url, i) => (
              <img
                key={i}
                src={url}
                alt={`${label} page ${i + 1}`}
                className="w-full h-auto block border-b border-border/30 last:border-b-0"
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function CompareFloatingWindow() {
  const { state, setCompareMode } = useEditorContext();
  const { originalPdfBytes, pdfBytes } = state;

  const [originalUrls, setOriginalUrls] = useState<string[]>([]);
  const [currentUrls, setCurrentUrls] = useState<string[]>([]);
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

  // Render original (Before)
  useEffect(() => {
    if (originalPdfBytes.byteLength === 0) return;
    let cancelled = false;
    setOriginalUrls([]);
    setOriginalRendering(true);
    setOriginalError(false);

    renderAllPdfPages(originalPdfBytes, RENDER_SCALE)
      .then((urls) => {
        if (cancelled) return;
        setOriginalUrls(urls);
        setOriginalRendering(false);
      })
      .catch(() => {
        if (cancelled) return;
        setOriginalError(true);
        setOriginalRendering(false);
      });
    return () => { cancelled = true; };
  }, [originalPdfBytes]);

  // Render current (After)
  useEffect(() => {
    if (pdfBytes.byteLength === 0) return;
    let cancelled = false;
    setCurrentUrls([]);
    setCurrentRendering(true);
    setCurrentError(false);

    renderAllPdfPages(pdfBytes, RENDER_SCALE)
      .then((urls) => {
        if (cancelled) return;
        setCurrentUrls(urls);
        setCurrentRendering(false);
      })
      .catch(() => {
        if (cancelled) return;
        setCurrentError(true);
        setCurrentRendering(false);
      });
    return () => { cancelled = true; };
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
          pageUrls={originalUrls}
          isRendering={originalRendering}
          hasError={originalError}
          zoomWrapperClass={zoomWrapperClass}
          scrollRef={beforeScrollRef}
          onScroll={() => handleScroll('before')}
        />
        <PreviewPanel
          label="Current"
          sizeLabel={formatBytes(currentSize)}
          pageUrls={currentUrls}
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
