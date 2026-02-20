import { PDFDocument, PageSizes } from 'pdf-lib';

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
