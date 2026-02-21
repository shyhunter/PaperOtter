import { PDFDocument, PageSizes } from 'pdf-lib';

// ─── Image fixtures ───────────────────────────────────────────────────────────
// These are synthetic byte arrays with the correct format magic bytes.
// They are NOT valid decodable images — safe to use only with mocked createImageBitmap.

/**
 * Returns a synthetic JPEG byte array (magic bytes FF D8 FF).
 * Size is configurable so tests can distinguish source vs processed by byteLength.
 */
export function createMinimalJpeg(size = 128): Uint8Array {
  const bytes = new Uint8Array(size);
  bytes[0] = 0xff; bytes[1] = 0xd8; bytes[2] = 0xff; // SOI + APP marker
  return bytes;
}

/**
 * Returns a synthetic PNG byte array (magic bytes 89 50 4E 47 0D 0A 1A 0A).
 */
export function createMinimalPng(size = 128): Uint8Array {
  const bytes = new Uint8Array(size);
  bytes[0] = 0x89; bytes[1] = 0x50; bytes[2] = 0x4e; bytes[3] = 0x47; // PNG magic
  bytes[4] = 0x0d; bytes[5] = 0x0a; bytes[6] = 0x1a; bytes[7] = 0x0a;
  return bytes;
}

/**
 * Returns a synthetic WebP byte array (RIFF....WEBP layout at bytes 0–11).
 */
export function createMinimalWebP(size = 128): Uint8Array {
  const bytes = new Uint8Array(size);
  bytes[0] = 0x52; bytes[1] = 0x49; bytes[2] = 0x46; bytes[3] = 0x46; // "RIFF"
  bytes[8] = 0x57; bytes[9] = 0x45; bytes[10] = 0x42; bytes[11] = 0x50; // "WEBP"
  return bytes;
}

/**
 * Creates a minimal valid in-memory PDF with the given number of pages.
 * Uses pdf-lib directly — no file I/O, safe to call in any test environment.
 *
 * @param pageCount  Number of pages to create (default 1)
 * @param pageSizePts  [width, height] in PDF points. Defaults to A4 (595.28 × 841.89 pt).
 */
export async function createMinimalPdf(
  pageCount = 1,
  pageSizePts?: [number, number],
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const size = pageSizePts ?? PageSizes.A4;
  for (let i = 0; i < pageCount; i++) {
    pdfDoc.addPage(size);
  }
  return pdfDoc.save();
}

/**
 * Loads a PDF from bytes and returns the [width, height] in points for every page.
 * Useful for asserting resize outcomes on non-first pages.
 */
export async function getPageDimensions(
  pdfBytes: Uint8Array,
): Promise<Array<{ widthPt: number; heightPt: number }>> {
  const pdfDoc = await PDFDocument.load(pdfBytes);
  return pdfDoc.getPages().map((page) => {
    const { width, height } = page.getSize();
    return { widthPt: width, heightPt: height };
  });
}
