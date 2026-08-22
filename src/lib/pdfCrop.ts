import { PDFDocument } from 'pdf-lib';

export interface CropMargins {
  top: number;    // points to crop from top
  bottom: number; // points to crop from bottom
  left: number;   // points to crop from left
  right: number;  // points to crop from right
}

/**
 * Crops all pages of a PDF by setting the crop box with the given margins.
 * Margins are specified in PDF points (1 pt = 1/72 inch = 0.3528 mm).
 * The crop doesn't remove content — it hides it (like CSS overflow:hidden).
 *
 * PDF coordinate system: origin is bottom-left, y increases upward.
 */
export async function cropPdf(
  pdfBytes: Uint8Array,
  margins: CropMargins,
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const pages = doc.getPages();

  for (const page of pages) {
    const { width, height } = page.getSize();
    // setCropBox defines the visible area
    // Origin is bottom-left in PDF coordinate system
    page.setCropBox(
      margins.left,                         // x: left margin
      margins.bottom,                       // y: bottom margin
      width - margins.left - margins.right, // width: remaining
      height - margins.top - margins.bottom, // height: remaining
    );
  }

  return new Uint8Array(await doc.save({ useObjectStreams: true }));
}

/**
 * Crops a single page, extracted into its own minimal document, for fast live
 * previews. Cropping via the full document on every margin change freezes the UI
 * on large documents — pdf-lib has to reparse and re-save every page and embedded
 * image just to preview one cropped page.
 */
export async function cropPdfSinglePage(
  pdfBytes: Uint8Array,
  margins: CropMargins,
  pageIndex: number,
): Promise<Uint8Array> {
  const srcDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const previewDoc = await PDFDocument.create();

  const clampedIndex = Math.min(Math.max(pageIndex, 0), srcDoc.getPageCount() - 1);
  const [copiedPage] = await previewDoc.copyPages(srcDoc, [clampedIndex]);
  previewDoc.addPage(copiedPage);

  const page = previewDoc.getPages()[0];
  const { width, height } = page.getSize();
  page.setCropBox(
    margins.left,
    margins.bottom,
    width - margins.left - margins.right,
    height - margins.top - margins.bottom,
  );

  return new Uint8Array(await previewDoc.save({ useObjectStreams: true }));
}

/** Convert millimeters to PDF points. 1 mm = 2.83465 pt */
export function mmToPoints(mm: number): number {
  return mm * 2.83465;
}

/** Convert PDF points to millimeters. 1 pt = 0.3528 mm */
export function pointsToMm(pts: number): number {
  return pts / 2.83465;
}
