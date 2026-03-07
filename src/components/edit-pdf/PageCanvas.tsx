// PageCanvas: renders a single PDF page at high quality in a canvas element.
// Wraps canvas in a relative container for overlay children (text/image editing).
//
// CRITICAL: Uses pdfBytes.slice() for React StrictMode safety.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import * as pdfjsLib from 'pdfjs-dist';

export interface CanvasDimensions {
  /** Rendered canvas width in CSS pixels */
  width: number;
  /** Rendered canvas height in CSS pixels */
  height: number;
  /** Original PDF page width in PDF points */
  pdfWidth: number;
  /** Original PDF page height in PDF points */
  pdfHeight: number;
  /** Scale used for rendering */
  scale: number;
}

interface PageCanvasProps {
  /** PDF file bytes */
  pdfBytes: Uint8Array;
  /** Zero-based page index */
  pageIndex: number;
  /** Render scale factor. If omitted, auto-fits to container width. */
  scale?: number;
  /** Overlay elements (text blocks, image blocks) */
  children?: ReactNode;
}

/**
 * Renders a PDF page at high quality to a canvas with an overlay container.
 * When scale is not provided, fits page width to the container width automatically.
 */
export function PageCanvas({ pdfBytes, pageIndex, scale, children }: PageCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dimensions, setDimensions] = useState<CanvasDimensions | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let pdfDoc: pdfjsLib.PDFDocumentProxy | null = null;

    async function render() {
      setIsLoading(true);
      setError(null);

      try {
        const loadingTask = pdfjsLib.getDocument({ data: pdfBytes.slice() });
        pdfDoc = await loadingTask.promise;
        if (cancelled) return;

        const pageNum = pageIndex + 1;
        if (pageNum < 1 || pageNum > pdfDoc.numPages) {
          setError(`Page ${pageNum} out of range (1-${pdfDoc.numPages})`);
          setIsLoading(false);
          return;
        }

        const page = await pdfDoc.getPage(pageNum);
        if (cancelled) return;

        // Calculate scale: use provided scale or fit to container width
        let renderScale = scale ?? 1.5;
        const baseViewport = page.getViewport({ scale: 1 });

        if (scale == null && containerRef.current) {
          const containerWidth = containerRef.current.clientWidth;
          if (containerWidth > 0) {
            renderScale = containerWidth / baseViewport.width;
          }
        }

        const viewport = page.getViewport({ scale: renderScale });
        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        await page.render({ canvas, viewport }).promise;
        if (cancelled) return;

        const dims: CanvasDimensions = {
          width: viewport.width,
          height: viewport.height,
          pdfWidth: baseViewport.width,
          pdfHeight: baseViewport.height,
          scale: renderScale,
        };

        setDimensions(dims);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to render page');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
        pdfDoc?.destroy();
      }
    }

    render();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfBytes, pageIndex, scale]);

  return (
    <div ref={containerRef} className="relative inline-block w-full">
      {isLoading && (
        <div className="flex items-center justify-center p-12">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
        </div>
      )}

      {error && (
        <div className="flex items-center justify-center p-8 text-sm text-destructive">
          {error}
        </div>
      )}

      <canvas
        ref={canvasRef}
        className={isLoading ? 'invisible' : ''}
        style={{ display: 'block', maxWidth: '100%' }}
      />

      {/* Overlay container for text/image editing elements */}
      {dimensions && children && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ width: dimensions.width, height: dimensions.height }}
        >
          {children}
        </div>
      )}
    </div>
  );
}
