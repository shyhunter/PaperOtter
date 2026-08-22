import { PDFDocument, PageSizes, StandardFonts, PDFName, PDFRawStream } from 'pdf-lib';

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
 * Creates a realistic multi-page PDF with embedded Helvetica text on each page.
 * More representative of real-world PDFs than the empty-page fixture.
 */
export async function createContentPdf(pageCount = 3): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < pageCount; i++) {
    const page = doc.addPage(PageSizes.A4);
    const { height } = page.getSize();
    page.drawText(
      `Page ${i + 1} — Lorem ipsum dolor sit amet, consectetur adipiscing elit.`,
      { x: 50, y: height - 100, size: 12, font },
    );
    page.drawText(
      'Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
      { x: 50, y: height - 120, size: 12, font },
    );
  }
  return doc.save({ useObjectStreams: true });
}

/**
 * Creates a minimal PDF whose page(s) each reference one image XObject filtered
 * with JPXDecode (JPEG2000) — the pixel data is a throwaway placeholder, only
 * the /Filter entry matters, since this fixture exists solely to exercise the
 * JPX-detection pre-scan (Ghostscript doesn't meaningfully re-encode JPXDecode
 * images, so the app flags this to explain a "0% smaller" compression result).
 */
export async function createPdfWithJpxImage(pageCount = 1): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const context = pdfDoc.context;

  const contents = new Uint8Array([0, 0, 0, 0]);
  const imageDict = context.obj({
    Type: 'XObject',
    Subtype: 'Image',
    Width: 4,
    Height: 4,
    ColorSpace: 'DeviceRGB',
    BitsPerComponent: 8,
    Filter: 'JPXDecode',
    Length: contents.length,
  });
  const imageRef = context.register(PDFRawStream.of(imageDict, contents));

  for (let i = 0; i < pageCount; i++) {
    const page = pdfDoc.addPage(PageSizes.A4);
    page.node.set(
      PDFName.of('Resources'),
      context.obj({ XObject: { Im0: imageRef } }),
    );
  }

  return pdfDoc.save();
}

/**
 * Creates a minimal PDF whose page(s) each reference one image XObject filtered
 * with DCTDecode (plain JPEG, not JPEG2000) — used where a test needs the
 * pre-scan to see "has real, non-JPX images" (compressibilityScore high enough,
 * jpxByteShare low enough) so Ghostscript actually gets invoked, as opposed to
 * createMinimalPdf's text-only content which the app now predicts as futile and
 * skips Ghostscript for entirely.
 */
export async function createPdfWithImage(pageCount = 1): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const context = pdfDoc.context;

  const contents = new Uint8Array([0, 0, 0, 0]);
  const imageDict = context.obj({
    Type: 'XObject',
    Subtype: 'Image',
    Width: 4,
    Height: 4,
    ColorSpace: 'DeviceRGB',
    BitsPerComponent: 8,
    Filter: 'DCTDecode',
    Length: contents.length,
  });
  const imageRef = context.register(PDFRawStream.of(imageDict, contents));

  for (let i = 0; i < pageCount; i++) {
    const page = pdfDoc.addPage(PageSizes.A4);
    page.node.set(
      PDFName.of('Resources'),
      context.obj({ XObject: { Im0: imageRef } }),
    );
  }

  return pdfDoc.save();
}

/**
 * Creates a PDF where every page shares ONE large non-JPX image (e.g. a repeated
 * header/logo, referenced by the same indirect object on every page) plus its own
 * unique, small JPX image. Regression fixture for a real bug: scanning naively
 * counted the shared image's bytes once per page it appeared on, which diluted
 * jpxByteShare far below the real figure for documents with a shared non-JPX
 * asset (e.g. 688 pages sharing one letterhead graphic). With correct dedup by
 * indirect reference, the shared image counts once regardless of page count.
 */
export async function createPdfWithSharedAndUniqueImages(pageCount: number): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const context = pdfDoc.context;

  const sharedContents = new Uint8Array(1000); // large — dominates totals if double-counted
  const sharedDict = context.obj({
    Type: 'XObject', Subtype: 'Image', Width: 4, Height: 4,
    ColorSpace: 'DeviceRGB', BitsPerComponent: 8, Filter: 'DCTDecode', Length: sharedContents.length,
  });
  const sharedRef = context.register(PDFRawStream.of(sharedDict, sharedContents));

  for (let i = 0; i < pageCount; i++) {
    const uniqueContents = new Uint8Array(100);
    const uniqueDict = context.obj({
      Type: 'XObject', Subtype: 'Image', Width: 4, Height: 4,
      ColorSpace: 'DeviceRGB', BitsPerComponent: 8, Filter: 'JPXDecode', Length: uniqueContents.length,
    });
    const uniqueRef = context.register(PDFRawStream.of(uniqueDict, uniqueContents));

    const page = pdfDoc.addPage(PageSizes.A4);
    page.node.set(
      PDFName.of('Resources'),
      context.obj({ XObject: { Shared: sharedRef, Unique: uniqueRef } }),
    );
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
