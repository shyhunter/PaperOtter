// CompareCanvas: read-only PDF canvas for live comparison mode.
// Shows the original (unmodified) PDF in a scrollable view that syncs with EditorCanvas.
// Does NOT include TextEditingLayer or any editing capabilities.
import { useEffect, useRef, useState, memo } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { useEditorContext } from '@/context/EditorContext';

const PAGE_GAP = 16;
const VIRTUALIZATION_WINDOW = 3;

interface PageInfo {
  width: number;
  height: number;
}

interface OriginalPageRendererProps {
  pdfBytes: Uint8Array;
  pageIndex: number;
  zoom: number;
}

const OriginalPageRenderer = memo(function OriginalPageRenderer({
  pdfBytes,
  pageIndex,
  zoom,
}: OriginalPageRendererProps) {
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
    }, 150);

    return () => {
      clearTimeout(timer);
    };
  }, [pdfBytes, pageIndex, zoom]);

  return <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />;
});

interface CompareCanvasProps {
  /** Ref for scroll sync — EditorCanvas will sync scroll from this */
  scrollRef?: React.RefObject<HTMLDivElement | null>;
  onScroll?: () => void;
}

export function CompareCanvas({ scrollRef, onScroll }: CompareCanvasProps) {
  const { state } = useEditorContext();
  const { originalPdfBytes, zoom, currentPage } = state;

  const containerRef = useRef<HTMLDivElement>(null);
  const [pageInfos, setPageInfos] = useState<PageInfo[]>([]);

  // Expose container ref for scroll sync
  useEffect(() => {
    if (scrollRef && 'current' in scrollRef) {
      (scrollRef as React.MutableRefObject<HTMLDivElement | null>).current = containerRef.current;
    }
  });

  // Load page dimensions
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (originalPdfBytes.byteLength === 0) return;
      const loadingTask = pdfjsLib.getDocument({ data: originalPdfBytes.slice() });
      const pdfDoc = await loadingTask.promise;
      try {
        const infos: PageInfo[] = [];
        const numPages = pdfDoc.numPages;
        // Sample first page for large PDFs
        const firstPage = await pdfDoc.getPage(1);
        const vp = firstPage.getViewport({ scale: 1 });
        for (let i = 0; i < numPages; i++) {
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

  if (pageInfos.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-auto"
      style={{ backgroundColor: 'var(--editor-canvas-bg, #e5e5e5)' }}
      onScroll={onScroll}
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
                <OriginalPageRenderer
                  pdfBytes={originalPdfBytes}
                  pageIndex={idx}
                  zoom={zoom}
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
