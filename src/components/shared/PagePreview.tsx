import { useEffect, useRef, useState, type ReactNode } from 'react';
import * as pdfjsLib from 'pdfjs-dist';

export interface PageDimensions {
  /** Rendered width in CSS pixels (at current scale) */
  width: number;
  /** Rendered height in CSS pixels (at current scale) */
  height: number;
  /** Original PDF page width in PDF points */
  pdfWidth: number;
  /** Original PDF page height in PDF points */
  pdfHeight: number;
}

interface PagePreviewProps {
  /** PDF file bytes */
  pdfBytes: Uint8Array;
  /** Zero-based page index to render */
  pageIndex: number;
  /** Render scale factor (default 1.5) */
  scale?: number;
  /** Overlay content positioned absolutely on top of the canvas */
  children?: ReactNode;
  /** Additional CSS classes for the container */
  className?: string;
  /** Called when page dimensions are known after render */
  onDimensionsReady?: (dims: PageDimensions) => void;
}

/**
 * Renders a single PDF page to a canvas with an overlay slot for interactive elements.
 *
 * CRITICAL: Uses pdfBytes.slice() for React StrictMode safety -- PDF.js transfers
 * the ArrayBuffer to its web worker, which would detach it on second effect run.
 */
export function PagePreview({
  pdfBytes,
  pageIndex,
  scale = 1.5,
  children,
  className,
  onDimensionsReady,
}: PagePreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);
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

        // pageIndex is zero-based; pdfjs uses 1-based page numbers
        const pageNum = pageIndex + 1;
        if (pageNum < 1 || pageNum > pdfDoc.numPages) {
          setError(`Page ${pageNum} out of range (1-${pdfDoc.numPages})`);
          setIsLoading(false);
          return;
        }

        const page = await pdfDoc.getPage(pageNum);
        if (cancelled) return;

        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        await page.render({ canvas, viewport }).promise;
        if (cancelled) return;

        const dims: PageDimensions = {
          width: viewport.width,
          height: viewport.height,
          pdfWidth: page.getViewport({ scale: 1 }).width,
          pdfHeight: page.getViewport({ scale: 1 }).height,
        };

        setDimensions({ width: viewport.width, height: viewport.height });
        onDimensionsReady?.(dims);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to render page');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
        // Always destroy to free pdfjs-dist internal memory
        pdfDoc?.destroy();
      }
    }

    render();

    return () => {
      cancelled = true;
    };
    // onDimensionsReady intentionally excluded to avoid re-render loops
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfBytes, pageIndex, scale]);

  return (
    <div
      className={`relative inline-block ${className ?? ''}`}
      style={dimensions ? { width: dimensions.width, height: dimensions.height } : undefined}
    >
      {isLoading && (
        <div className="flex items-center justify-center p-8">
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
        style={{ display: 'block' }}
      />

      {/* Overlay slot — children positioned absolutely on top of the rendered page */}
      {dimensions && children && (
        <div
          className="absolute inset-0"
          style={{ width: dimensions.width, height: dimensions.height }}
        >
          {children}
        </div>
      )}
    </div>
  );
}
