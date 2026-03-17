// EditorCanvas: renders all PDF pages stacked vertically in a continuous scroll.
// Uses IntersectionObserver to track the most visible page.
// Virtualizes rendering: only renders pages within +/- 2 of the visible page.
// CRITICAL: Uses pdfBytes.slice() for React StrictMode safety.
import { useEffect, useRef, useState, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { useEditorContext } from '@/context/EditorContext';
import { TextEditingLayer } from './TextEditingLayer';

const PAGE_GAP = 16; // px between pages
const RENDER_WINDOW = 2; // render current page +/- this many pages
const ZOOM_DEBOUNCE_MS = 150;

interface PageInfo {
  width: number;  // PDF points
  height: number; // PDF points
}

export function EditorCanvas() {
  const { state, setCurrentPage, setFitWidthZoom } = useEditorContext();
  const { pdfBytes, zoom, pageCount } = state;

  const containerRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const canvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map());
  const [pageInfos, setPageInfos] = useState<PageInfo[]>([]);
  const [visiblePage, setVisiblePage] = useState(0);
  const renderTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevZoomRef = useRef(zoom);

  // Load page dimensions on mount / when pdfBytes change
  useEffect(() => {
    let cancelled = false;

    async function loadPageInfos() {
      if (pdfBytes.byteLength === 0) return;

      const loadingTask = pdfjsLib.getDocument({ data: pdfBytes.slice() });
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

    loadPageInfos();
    return () => { cancelled = true; };
  }, [pdfBytes]);

  // Calculate fit-width zoom when container resizes or page infos load
  useEffect(() => {
    if (pageInfos.length === 0 || !containerRef.current) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const containerWidth = entry.contentRect.width - 48; // subtract padding
        if (containerWidth > 0 && pageInfos[0]) {
          const fwz = containerWidth / pageInfos[0].width;
          setFitWidthZoom(fwz);
        }
      }
    });

    observer.observe(containerRef.current);

    // Initial calculation
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
        let maxIdx = visiblePage;
        for (const entry of entries) {
          const idx = Number(entry.target.getAttribute('data-page-idx'));
          if (!isNaN(idx) && entry.intersectionRatio > maxRatio) {
            maxRatio = entry.intersectionRatio;
            maxIdx = idx;
          }
        }
        if (maxRatio > 0) {
          setVisiblePage(maxIdx);
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

  // Render visible pages to canvas (debounced on zoom change)
  const renderPages = useCallback(async () => {
    if (pdfBytes.byteLength === 0 || pageInfos.length === 0) return;

    const loadingTask = pdfjsLib.getDocument({ data: pdfBytes.slice() });
    const pdfDoc = await loadingTask.promise;

    try {
      const start = Math.max(0, visiblePage - RENDER_WINDOW);
      const end = Math.min(pageCount - 1, visiblePage + RENDER_WINDOW);

      for (let i = start; i <= end; i++) {
        const canvas = canvasRefs.current.get(i);
        if (!canvas) continue;

        const page = await pdfDoc.getPage(i + 1);
        const viewport = page.getViewport({ scale: zoom });

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        await page.render({ canvas, viewport }).promise;
      }
    } finally {
      pdfDoc.destroy();
    }
  }, [pdfBytes, pageInfos, visiblePage, pageCount, zoom]);

  // Trigger render on visible page or zoom change (debounced for zoom)
  useEffect(() => {
    if (renderTimeoutRef.current) clearTimeout(renderTimeoutRef.current);

    const zoomChanged = prevZoomRef.current !== zoom;
    prevZoomRef.current = zoom;

    if (zoomChanged) {
      renderTimeoutRef.current = setTimeout(() => {
        renderPages();
      }, ZOOM_DEBOUNCE_MS);
    } else {
      renderPages();
    }

    return () => {
      if (renderTimeoutRef.current) clearTimeout(renderTimeoutRef.current);
    };
  }, [renderPages, zoom]);

  // Register page div refs
  const setPageRef = useCallback((idx: number, el: HTMLDivElement | null) => {
    if (el) {
      pageRefs.current.set(idx, el);
    } else {
      pageRefs.current.delete(idx);
    }
  }, []);

  const setCanvasRef = useCallback((idx: number, el: HTMLCanvasElement | null) => {
    if (el) {
      canvasRefs.current.set(idx, el);
    } else {
      canvasRefs.current.delete(idx);
    }
  }, []);

  const isInRenderWindow = (idx: number) =>
    idx >= visiblePage - RENDER_WINDOW && idx <= visiblePage + RENDER_WINDOW;

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

          return (
            <div
              key={idx}
              data-page-idx={idx}
              ref={(el) => setPageRef(idx, el)}
              className="shadow-md bg-white dark:bg-zinc-900 flex-shrink-0 relative"
              style={{ width: scaledW, height: scaledH }}
            >
              {isInRenderWindow(idx) ? (
                <>
                  <canvas
                    ref={(el) => setCanvasRef(idx, el)}
                    style={{ display: 'block', width: '100%', height: '100%' }}
                  />
                  <TextEditingLayer
                    pageIndex={idx}
                    pageWidth={info.width}
                    pageHeight={info.height}
                    zoom={zoom}
                  />
                </>
              ) : (
                <div
                  className="w-full h-full bg-white dark:bg-zinc-800"
                  style={{ width: scaledW, height: scaledH }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
