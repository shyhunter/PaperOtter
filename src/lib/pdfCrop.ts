import { PDFDocument } from 'pdf-lib';
import { normalisedRotation } from '@/lib/pdfPageNumbers';

export interface CropMargins {
  top: number;    // points to crop from top
  bottom: number; // points to crop from bottom
  left: number;   // points to crop from left
  right: number;  // points to crop from right
}

/**
 * The same margins expressed as the page's own edges.
 *
 * A crop box is in the page's coordinates, but the person setting it is looking
 * at the page through its /Rotate and means the edges they can see. On a
 * quarter-turned page the two disagree completely: cropping "the top" took a
 * strip off a side, because the margin was applied to the unturned box
 * underneath. The same defect page numbers, watermarks, signatures and the
 * editor's stamps all had.
 *
 * A quarter turn moves each edge to the next one round, which is why this is
 * four rotations of one list rather than four separate calculations.
 */
export function marginsInPageSpace(
  margins: CropMargins,
  rotation: 0 | 90 | 180 | 270,
): CropMargins {
  switch (rotation) {
    case 90:  return { top: margins.right, right: margins.bottom, bottom: margins.left, left: margins.top };
    case 180: return { top: margins.bottom, right: margins.left, bottom: margins.top, left: margins.right };
    case 270: return { top: margins.left, right: margins.top, bottom: margins.right, left: margins.bottom };
    default:  return margins;
  }
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
    // The edges the reader sees, turned into the edges the box is measured in.
    const m = marginsInPageSpace(margins, normalisedRotation(page));
    // setCropBox defines the visible area
    // Origin is bottom-left in PDF coordinate system
    page.setCropBox(
      m.left,                     // x: left margin
      m.bottom,                   // y: bottom margin
      width - m.left - m.right,   // width: remaining
      height - m.top - m.bottom,  // height: remaining
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
  // copyPages carries the /Rotate across, so the preview has to make the same
  // turn the document does. Without it the preview and the output would show
  // two different crops of the same page.
  const m = marginsInPageSpace(margins, normalisedRotation(page));
  page.setCropBox(
    m.left,
    m.bottom,
    width - m.left - m.right,
    height - m.top - m.bottom,
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
