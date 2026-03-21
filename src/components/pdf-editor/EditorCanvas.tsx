// EditorCanvas: renders all PDF pages stacked vertically in a continuous scroll.
// Each page renders itself independently via PageCanvasRenderer.
// CRITICAL: Uses pdfBytes.slice() for React StrictMode safety.
import { useEffect, useRef, useState, useCallback, memo } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { useEditorContext } from '@/context/EditorContext';
import { TextEditingLayer } from './TextEditingLayer';

const PAGE_GAP = 16; // px between pages
const ZOOM_DEBOUNCE_MS = 150;
const VIRTUALIZATION_WINDOW = 3; // render current page +/- this many pages

interface PageInfo {
  width: number;  // PDF points
  height: number; // PDF points
}

// ── Self-rendering page component ────────────────────────────────────
// Each page independently loads and renders its content from the PDF.
// This eliminates the timing issue where a batch renderer misses canvas refs.

interface PageCanvasRendererProps {
  pdfBytes: Uint8Array;
  pageIndex: number;
  zoom: number;
  pageWidth: number;
  pageHeight: number;
}

const PageCanvasRenderer = memo(function PageCanvasRenderer({
  pdfBytes,
  pageIndex,
  zoom,
  pageWidth,
  pageHeight,
}: PageCanvasRendererProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderIdRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || pdfBytes.byteLength === 0) return;

    const currentId = ++renderIdRef.current;

    // Debounce zoom changes, render immediately for pdfBytes changes
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const doRender = async () => {
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
        // Non-fatal: page render failure
      }
    };

    debounceRef.current = setTimeout(doRender, ZOOM_DEBOUNCE_MS);
    // Also render immediately on first mount or pdfBytes change
    if (renderIdRef.current === 1) {
      clearTimeout(debounceRef.current);
      doRender();
    }

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [pdfBytes, pageIndex, zoom]);

  return (
    <>
      <canvas
        ref={canvasRef}
        style={{ display: 'block', width: '100%', height: '100%' }}
      />
      <TextEditingLayer
        pageIndex={pageIndex}
        pageWidth={pageWidth}
        pageHeight={pageHeight}
        zoom={zoom}
      />
    </>
  );
});

// ── Main EditorCanvas ────────────────────────────────────────────────

export function EditorCanvas() {
  const { state, setCurrentPage, setFitWidthZoom, setZoom, scrollToPageRef } = useEditorContext();
  const { pdfBytes, zoom, pageCount } = state;

  const containerRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const [pageInfos, setPageInfos] = useState<PageInfo[]>([]);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  // Load page dimensions on mount / when pdfBytes change
  // For large PDFs, sample first page dimensions and apply to all initially,
  // then load real dimensions in batches to avoid blocking.
  useEffect(() => {
    let cancelled = false;

    async function loadPageInfos() {
      if (pdfBytes.byteLength === 0) return;

      const loadingTask = pdfjsLib.getDocument({ data: pdfBytes.slice() });
      const pdfDoc = await loadingTask.promise;

      try {
        const numPages = pdfDoc.numPages;

        // For large PDFs (50+ pages), load first page dimensions immediately
        // and estimate the rest to avoid blocking
        if (numPages > 50) {
          const firstPage = await pdfDoc.getPage(1);
          const vp = firstPage.getViewport({ scale: 1 });
          const defaultInfo = { width: vp.width, height: vp.height };
          const infos = Array.from({ length: numPages }, () => ({ ...defaultInfo }));
          if (!cancelled) setPageInfos(infos);

          // Then load real dimensions in batches (non-blocking)
          const BATCH_SIZE = 20;
          for (let start = 2; start <= numPages; start += BATCH_SIZE) {
            if (cancelled) break;
            const end = Math.min(start + BATCH_SIZE, numPages + 1);
            for (let i = start; i < end; i++) {
              const page = await pdfDoc.getPage(i);
              const pageVp = page.getViewport({ scale: 1 });
              infos[i - 1] = { width: pageVp.width, height: pageVp.height };
            }
            if (!cancelled) setPageInfos([...infos]);
            // Yield to main thread between batches
            await new Promise((r) => requestAnimationFrame(r));
          }
        } else {
          const infos: PageInfo[] = [];
          for (let i = 1; i <= numPages; i++) {
            const page = await pdfDoc.getPage(i);
            const vp = page.getViewport({ scale: 1 });
            infos.push({ width: vp.width, height: vp.height });
          }
          if (!cancelled) setPageInfos(infos);
        }
      } finally {
        pdfDoc.destroy();
      }
    }

    loadPageInfos();
    return () => { cancelled = true; };
  }, [pdfBytes]);

  // Calculate fit-width zoom when container resizes or page infos load
  useEffect(() => {
    if (pageInfos.length === 0 || !containerRef.current) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const containerWidth = entry.contentRect.width - 48;
        if (containerWidth > 0 && pageInfos[0]) {
          setFitWidthZoom(containerWidth / pageInfos[0].width);
        }
      }
    });

    observer.observe(containerRef.current);

    const containerWidth = containerRef.current.clientWidth - 48;
    if (containerWidth > 0 && pageInfos[0]) {
      setFitWidthZoom(containerWidth / pageInfos[0].width);
    }

    return () => observer.disconnect();
  }, [pageInfos, setFitWidthZoom]);

  // IntersectionObserver to track which page is most visible
  useEffect(() => {
    if (pageInfos.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        let maxRatio = 0;
        let maxIdx = -1;
        for (const entry of entries) {
          const idx = Number(entry.target.getAttribute('data-page-idx'));
          if (!isNaN(idx) && entry.intersectionRatio > maxRatio) {
            maxRatio = entry.intersectionRatio;
            maxIdx = idx;
          }
        }
        if (maxRatio > 0 && maxIdx >= 0) {
          setCurrentPage(maxIdx);
        }
      },
      {
        root: containerRef.current,
        threshold: [0, 0.25, 0.5, 0.75, 1.0],
      },
    );

    pageRefs.current.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageInfos, pageCount, setCurrentPage]);

  // Register page div refs
  const setPageRef = useCallback((idx: number, el: HTMLDivElement | null) => {
    if (el) pageRefs.current.set(idx, el);
    else pageRefs.current.delete(idx);
  }, []);

  // Pinch-to-zoom: wheel+ctrlKey (trackpad pinch on macOS sends this)
  // + gesturechange for native Safari/WebKit gesture events
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    function handleWheel(e: WheelEvent) {
      if (e.ctrlKey) {
        e.preventDefault();
        e.stopPropagation();
        const delta = -e.deltaY * 0.01;
        const newZoom = Math.min(3.0, Math.max(0.25, zoomRef.current + delta));
        setZoom(newZoom);
      }
    }

    // Safari/WebKit gesture events (macOS trackpad)
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
    container.addEventListener('gesturestart', handleGestureStart, { passive: false } as AddEventListenerOptions);
    container.addEventListener('gesturechange', handleGestureChange, { passive: false } as AddEventListenerOptions);

    return () => {
      container.removeEventListener('wheel', handleWheel);
      container.removeEventListener('gesturestart', handleGestureStart);
      container.removeEventListener('gesturechange', handleGestureChange);
    };
  }, [setZoom]);

  // Expose scrollToPage for PagePanel via context ref
  useEffect(() => {
    scrollToPageRef.current = (idx: number) => {
      // Immediately update currentPage so the target page renders without
      // waiting for the IntersectionObserver (which may be delayed in WKWebView).
      setCurrentPage(idx);
      const el = pageRefs.current.get(idx);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    };
    return () => { scrollToPageRef.current = null; };
  }, [scrollToPageRef, setCurrentPage]);

  if (pageInfos.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-auto"
      style={{ backgroundColor: 'var(--editor-canvas-bg, #e5e5e5)' }}
    >
      <div className="flex flex-col items-center py-6 px-6" style={{ gap: PAGE_GAP }}>
        {pageInfos.map((info, idx) => {
          const scaledW = info.width * zoom;
          const scaledH = info.height * zoom;
          // Virtualization: only render full page content for pages near viewport
          const isNearViewport = Math.abs(idx - state.currentPage) <= VIRTUALIZATION_WINDOW;

          return (
            <div
              key={idx}
              data-page-idx={idx}
              ref={(el) => setPageRef(idx, el)}
              className="shadow-md bg-white flex-shrink-0 relative"
              style={{ width: scaledW, height: scaledH }}
            >
              {isNearViewport ? (
                <PageCanvasRenderer
                  pdfBytes={pdfBytes}
                  pageIndex={idx}
                  zoom={zoom}
                  pageWidth={info.width}
                  pageHeight={info.height}
                />
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
  );
}
