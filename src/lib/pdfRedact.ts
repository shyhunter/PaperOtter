// pdfRedact.ts: True permanent redaction via render-to-image approach.
//
// TRADEOFF: Pages with redactions are flattened to images — text on those pages
// becomes non-selectable. This is the CORRECT behavior for a redaction tool:
// security over convenience. Non-redacted pages pass through unchanged with
// selectable text preserved.
//
// Process:
// 1. Group redactions by page
// 2. Non-redacted pages: copy as-is (preserves text selectability)
// 3. Redacted pages: render to canvas → draw redaction rects → export as PNG → embed
import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument } from 'pdf-lib';
import type { RedactionRect } from '@/components/redact-pdf/RedactOverlay';
import { normaliseHex } from '@/lib/colorPresets';

/** What redactions were before they could be any other colour. */
export const DEFAULT_REDACTION_COLOR = '#000000';

/**
 * The colour a redaction box is actually painted with.
 *
 * Never passes a caller's string to `fillStyle` directly: canvas accepts
 * `transparent` and `rgba(0,0,0,0)`, and a box painted with either leaves the
 * content it was meant to cover fully visible in the rasterised page -- the
 * redaction would look applied and not be.
 */
export function resolveRedactionFill(color: string | undefined): string {
  return normaliseHex(color ?? DEFAULT_REDACTION_COLOR);
}

/**
 * Apply permanent redactions to a PDF.
 * Returns new PDF bytes with redacted content permanently removed.
 */
export async function applyRedactions(
  pdfBytes: Uint8Array,
  redactions: RedactionRect[],
  color?: string,
): Promise<Uint8Array> {
  const fill = resolveRedactionFill(color);

  if (redactions.length === 0) {
    return pdfBytes;
  }

  // Group redactions by page
  const redactionsByPage = new Map<number, RedactionRect[]>();
  for (const r of redactions) {
    const existing = redactionsByPage.get(r.pageIndex) ?? [];
    existing.push(r);
    redactionsByPage.set(r.pageIndex, existing);
  }

  // Load source with pdf-lib (for copying pages)
  const sourceDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const pageCount = sourceDoc.getPageCount();

  // Load source with pdfjs-dist (for rendering pages)
  const pdfJsDoc = await pdfjsLib.getDocument({ data: pdfBytes.slice() }).promise;

  // Create output document
  const outputDoc = await PDFDocument.create();

  try {
    for (let i = 0; i < pageCount; i++) {
      const pageRedactions = redactionsByPage.get(i);

      if (!pageRedactions || pageRedactions.length === 0) {
        // No redactions on this page — copy as-is (preserves text)
        const [copiedPage] = await outputDoc.copyPages(sourceDoc, [i]);
        outputDoc.addPage(copiedPage);
      } else {
        // Page has redactions — render to image for true redaction
        const page = await pdfJsDoc.getPage(i + 1); // pdfjs is 1-based
        const renderScale = 2.0; // High quality
        const viewport = page.getViewport({ scale: renderScale });

        // Render page to canvas
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        await page.render({ canvas, viewport }).promise;

        // Draw the redaction boxes over the rendered page. The content beneath
        // is gone either way -- this page is being replaced by a flat image --
        // so the colour is what the reader sees, not what protects them.
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = fill;
          for (const rect of pageRedactions) {
            const x = (rect.x / 100) * canvas.width;
            const y = (rect.y / 100) * canvas.height;
            const w = (rect.width / 100) * canvas.width;
            const h = (rect.height / 100) * canvas.height;
            ctx.fillRect(x, y, w, h);
          }
        }

        // Export the canvas as PNG bytes, without ever building a base64 string.
        //
        // `toDataURL` encodes on the main thread and cannot yield, and the
        // base64 it returns then has to be decoded a character at a time. On a
        // large page the two together measured as **one 2,251ms long task** --
        // per redacted page -- during which the window paints nothing and the
        // OS offers to close it. `toBlob` hands the encode to the browser's own
        // thread and `arrayBuffer()` skips base64 entirely: the same pixels,
        // measured at zero main-thread blocking for the encode itself.
        //
        // This does NOT make redaction responsive on a large page. What remains
        // is pdf-lib: embedPng parsing the PNG and save serialising it, ~9s in
        // one task on a 68-megapixel render, and that needs a worker rather than
        // a better API. This removes the part that could be removed today.
        const pngBlob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, 'image/png'),
        );
        // Loudly, not quietly: a redaction that half-worked is worse than one
        // that failed, because the page would be embedded without its cover.
        if (!pngBlob) throw new Error('Canvas to blob failed');
        const pngBytes = new Uint8Array(await pngBlob.arrayBuffer());

        // The size the reader sees, taken from the viewport rather than from
        // getSize(). pdf.js has already applied the page's /Rotate here, so on a
        // turned page the render is landscape while getSize() still reports the
        // portrait box underneath -- and the replacement page carries no
        // /Rotate of its own, so building it at the raw size squashed a
        // landscape image into a portrait sheet and turned the content with it.
        const pageWidth = viewport.width / renderScale;
        const pageHeight = viewport.height / renderScale;

        // Create new page at the size that was rendered, and embed the image
        const pngImage = await outputDoc.embedPng(pngBytes);
        const newPage = outputDoc.addPage([pageWidth, pageHeight]);
        newPage.drawImage(pngImage, {
          x: 0,
          y: 0,
          width: pageWidth,
          height: pageHeight,
        });
      }
    }

    const resultBytes = await outputDoc.save({ useObjectStreams: false });
    return new Uint8Array(resultBytes);
  } finally {
    pdfJsDoc.destroy();
  }
}
