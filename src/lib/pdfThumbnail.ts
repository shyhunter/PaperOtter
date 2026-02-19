// Renders the first page of a PDF (from bytes in memory) to a canvas data URL.
// Uses pdfjs-dist (Mozilla PDF.js). NOT pdf-lib — pdf-lib cannot render.
//
// CRITICAL: workerSrc must be set at module load time (top level), not inside a function.
// Use import.meta.url so Vite resolves and bundles the .mjs worker correctly.
// Never use a CDN URL — the app runs offline.
//
// CRITICAL: Call pdfDoc.destroy() after rendering to prevent memory leaks.
// Each renderPdfThumbnail call creates a new PDFDocumentProxy; not destroying it
// causes unbounded memory growth if the user triggers Generate Preview repeatedly.
import * as pdfjsLib from 'pdfjs-dist';

// Set worker before any getDocument() call — Vite resolves via import.meta.url.
// The .mjs extension is required for pdfjs-dist v4+; do not use .js.
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

/**
 * Renders the first page of a PDF (provided as Uint8Array) to a PNG data URL.
 * @param pdfBytes - The processed PDF bytes (from pdfProcessor.ts result.bytes)
 * @param scale    - Render scale factor. 0.5 produces a half-resolution thumbnail.
 * @returns        - PNG data URL string suitable for <img src={...} />
 */
export async function renderPdfThumbnail(
  pdfBytes: Uint8Array,
  scale = 0.5,
): Promise<string> {
  const loadingTask = pdfjsLib.getDocument({ data: pdfBytes });
  const pdfDoc = await loadingTask.promise;

  try {
    const page = await pdfDoc.getPage(1); // first page only
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await page.render({ canvas, viewport }).promise;

    return canvas.toDataURL('image/png');
  } finally {
    // Always destroy to free pdfjs-dist internal memory
    pdfDoc.destroy();
  }
}
