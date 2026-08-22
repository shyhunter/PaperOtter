// Renders PDF pages (from bytes in memory) to canvas data URLs.
// Uses pdfjs-dist (Mozilla PDF.js). NOT pdf-lib — pdf-lib cannot render.
//
// CRITICAL: workerSrc must be set at module load time (top level), not inside a function.
// Use import.meta.url so Vite resolves and bundles the .mjs worker correctly.
// Never use a CDN URL — the app runs offline.
//
// CRITICAL: Call pdfDoc.destroy() after rendering to prevent memory leaks.
// Each getDocument() call creates a new PDFDocumentProxy; not destroying it
// causes unbounded memory growth if the user triggers Generate Preview repeatedly.
//
// CRITICAL: Always pass pdfBytes.slice() to getDocument(), never the raw Uint8Array.
// PDF.js transfers the ArrayBuffer to its web worker (postMessage transfer list),
// which detaches the original buffer (byteLength becomes 0). Under React StrictMode,
// effects run twice — the second run would get a neutered buffer → render failure.
// .slice() creates a fresh copy each call so the original bytes remain intact.
import * as pdfjsLib from 'pdfjs-dist';

// Set worker before any getDocument() call — Vite resolves via import.meta.url.
// The .mjs extension is required for pdfjs-dist v4+; do not use .js.
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

// Keyed by the exact pdfBytes reference — parsing a document (including the
// pdfBytes.slice() copy) is not free, and the editor renders many single-page
// components (page-panel thumbnails, main-canvas pages) against the same
// document at once. Without sharing, a large, image-heavy document (e.g. a
// 688-page/30MB PDF) gets re-parsed from scratch by every single one of them,
// concurrently, on every scroll — enough to starve the UI thread indefinitely.
// Callers must NOT call .destroy() on a document obtained this way; it's shared
// and is released via releaseSharedPdfDocument once every caller is done with it.
const sharedDocCache = new Map<Uint8Array, { promise: Promise<pdfjsLib.PDFDocumentProxy>; refCount: number }>();

/** Acquire a shared, parsed document for `pdfBytes`. Pair with releaseSharedPdfDocument. */
export function acquireSharedPdfDocument(pdfBytes: Uint8Array): Promise<pdfjsLib.PDFDocumentProxy> {
  let entry = sharedDocCache.get(pdfBytes);
  if (!entry) {
    entry = { promise: pdfjsLib.getDocument({ data: pdfBytes.slice() }).promise, refCount: 0 };
    sharedDocCache.set(pdfBytes, entry);
  }
  entry.refCount++;
  return entry.promise;
}

/** Release a document obtained via acquireSharedPdfDocument; destroys it once unused. */
export function releaseSharedPdfDocument(pdfBytes: Uint8Array): void {
  const entry = sharedDocCache.get(pdfBytes);
  if (!entry) return;
  entry.refCount--;
  if (entry.refCount <= 0) {
    sharedDocCache.delete(pdfBytes);
    entry.promise.then((doc) => doc.destroy()).catch(() => {});
  }
}

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
  const pdfDoc = await acquireSharedPdfDocument(pdfBytes);

  try {
    const page = await pdfDoc.getPage(1); // first page only
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await page.render({ canvas, viewport }).promise;

    return canvas.toDataURL('image/png');
  } finally {
    releaseSharedPdfDocument(pdfBytes);
  }
}

/**
 * Renders a single specific page of a PDF to a PNG data URL.
 * @param pdfBytes  - PDF bytes
 * @param pageIndex - 0-based page index
 * @param scale     - Render scale factor
 * @returns         - PNG data URL string
 */
export async function renderPdfPageThumbnail(
  pdfBytes: Uint8Array,
  pageIndex: number,
  scale = 1.0,
): Promise<string> {
  const pdfDoc = await acquireSharedPdfDocument(pdfBytes);

  try {
    const pageNum = Math.min(Math.max(pageIndex + 1, 1), pdfDoc.numPages);
    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await page.render({ canvas, viewport }).promise;

    return canvas.toDataURL('image/png');
  } finally {
    releaseSharedPdfDocument(pdfBytes);
  }
}

/**
 * Renders ALL pages of a PDF to an array of PNG data URLs.
 * @param pdfBytes - PDF bytes (source or processed)
 * @param scale    - Render scale factor. 2.0 gives crisp display at full panel width.
 * @returns        - Array of PNG data URL strings, one per page (page 1 first)
 */
export async function renderAllPdfPages(
  pdfBytes: Uint8Array,
  scale = 2.0,
): Promise<string[]> {
  const loadingTask = pdfjsLib.getDocument({ data: pdfBytes.slice() });
  const pdfDoc = await loadingTask.promise;

  try {
    const pageCount = pdfDoc.numPages;
    const urls: string[] = [];

    for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
      const page = await pdfDoc.getPage(pageNum);
      const viewport = page.getViewport({ scale });

      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;

      await page.render({ canvas, viewport }).promise;
      urls.push(canvas.toDataURL('image/png'));
    }

    return urls;
  } finally {
    // Always destroy to free pdfjs-dist internal memory
    pdfDoc.destroy();
  }
}

/** A PDF document opened for on-demand, per-page rendering (see openPdfForLazyRender). */
export interface LazyPdfHandle {
  numPages: number;
  /** height/width ratio for each page (0-indexed), fetched cheaply without rasterizing. */
  pageAspectRatios: number[];
  /** Rasterize a single page (0-indexed) to a PNG data URL. */
  renderPage(pageIndex: number, scale: number): Promise<string>;
  /** Free pdfjs-dist internal memory. Must be called when the handle is no longer needed. */
  destroy(): void;
}

/**
 * Opens a PDF for lazy, per-page rendering instead of rasterizing every page up front.
 * Used by CompareStep so large documents (hundreds of pages) don't block on rendering
 * pages the user may never scroll to, and don't hold every rendered page in memory at once.
 *
 * Page aspect ratios are fetched for all pages immediately (cheap — page geometry only,
 * no rasterization) so callers can lay out correctly-sized placeholders before any page
 * is actually rendered.
 */
export async function openPdfForLazyRender(pdfBytes: Uint8Array): Promise<LazyPdfHandle> {
  const loadingTask = pdfjsLib.getDocument({ data: pdfBytes.slice() });
  const pdfDoc = await loadingTask.promise;
  const numPages = pdfDoc.numPages;

  const pageAspectRatios: number[] = [];
  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1 });
    pageAspectRatios.push(viewport.height / viewport.width);
  }

  return {
    numPages,
    pageAspectRatios,
    async renderPage(pageIndex: number, scale: number): Promise<string> {
      const page = await pdfDoc.getPage(pageIndex + 1);
      const viewport = page.getViewport({ scale });

      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;

      await page.render({ canvas, viewport }).promise;
      return canvas.toDataURL('image/png');
    },
    destroy(): void {
      pdfDoc.destroy();
    },
  };
}
