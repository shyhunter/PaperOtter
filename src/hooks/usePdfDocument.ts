// usePdfDocument: load a PDF once and share it across every thumbnail in a grid.
//
// The bug this exists for: LazyPageThumbnail used to call
// `pdfjsLib.getDocument({ data: pdfBytes.slice() })` per tile. That is a full
// copy of the file plus a complete parse of the whole document, for each page
// square in the grid. Opening Split PDF on a 3-4 MB, 134-page file froze the
// window for minutes and Ubuntu reported the app as not responding; scrolling
// made it worse, because scrolling activated more tiles.
//
// The lazy rendering was never the problem and is kept. What changes is that
// the document is parsed once, here, and the resulting proxy is handed to every
// tile.
import { useEffect, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';

/**
 * Parses `pdfBytes` once and returns the shared document, or null until it is
 * ready (or if it could not be read).
 *
 * Reloads only when the byte array identity changes, which is how page
 * operations elsewhere signal that thumbnails are stale.
 */
export function usePdfDocument(
  pdfBytes: Uint8Array | null | undefined,
): pdfjsLib.PDFDocumentProxy | null {
  const [doc, setDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);

  useEffect(() => {
    if (!pdfBytes) {
      setDoc(null);
      return;
    }

    // `cancelled` rather than relying on unmount alone: React StrictMode runs
    // every effect twice in development, and the second run must not adopt a
    // document the first run is already tearing down.
    let cancelled = false;
    let loaded: pdfjsLib.PDFDocumentProxy | null = null;

    (async () => {
      try {
        // .slice() is required, not defensive. pdf.js transfers the ArrayBuffer
        // to its worker, so handing it the caller's array detaches it — and
        // under StrictMode the second effect run would then receive an empty
        // buffer and render nothing.
        const task = pdfjsLib.getDocument({ data: pdfBytes.slice() });
        loaded = await task.promise;
        if (cancelled) {
          loaded.destroy();
          return;
        }
        setDoc(loaded);
      } catch {
        // A document that will not parse leaves the grid showing placeholders,
        // which is the same outcome as before and not worth failing the step for.
        if (!cancelled) setDoc(null);
      }
    })();

    return () => {
      cancelled = true;
      setDoc(null);
      loaded?.destroy();
    };
  }, [pdfBytes]);

  return doc;
}
