// Embeds a PNG signature image onto specified pages of a PDF using pdf-lib.
import { PDFDocument, degrees } from 'pdf-lib';
import { normalisedRotation, visualToRaw } from '@/lib/pdfPageNumbers';

export interface SignatureOptions {
  /** PNG image bytes (decoded from data URL) */
  imageBytes: Uint8Array;
  /**
   * Where the signature sits, as a fraction of the page's visible box, with
   * the origin at the bottom-left corner the reader sees.
   *
   * A fraction rather than a point, because the user positions the signature
   * on one page and it is stamped on every page they chose. Absolute points
   * taken from the previewed page land off the edge of any page that is a
   * different size: reported on a 438-page report where the signature "applied
   * only first 3-4 pages" -- it was drawn on all of them, and everything past
   * the run of same-sized pages at the front fell outside the visible area.
   */
  xRatio: number;
  yRatio: number;
  /** Size in PDF points, kept the same on every page a signature lands on. */
  width: number;
  height: number;
  /** Zero-based page indices to stamp */
  pageIndices: number[];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Embeds a PNG signature image onto the specified pages of a PDF.
 *
 * Placement is worked out per page in the frame the reader sees and then mapped
 * back, so a page that is a different size, or turned by a /Rotate, gets the
 * signature in the same place on the page rather than in the same place in an
 * unturned coordinate space nobody is looking at.
 *
 * Follows the pdfWatermark.ts pattern: load with ignoreEncryption,
 * iterate pages, save with useObjectStreams (never useCompression per pdf-lib bug #1445).
 */
export async function addSignature(
  pdfBytes: Uint8Array,
  options: SignatureOptions,
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const sigImage = await doc.embedPng(options.imageBytes);
  const pages = doc.getPages();

  for (const idx of options.pageIndices) {
    if (idx < 0 || idx >= pages.length) continue;
    const page = pages[idx];

    const { width: rawW, height: rawH } = page.getSize();
    const rotation = normalisedRotation(page);
    // A quarter turn swaps what the reader perceives as width and height.
    const quarter = rotation === 90 || rotation === 270;
    const visW = quarter ? rawH : rawW;
    const visH = quarter ? rawW : rawH;

    // The same size on every page, unless the page is too small to hold it.
    const w = Math.min(options.width, visW);
    const h = Math.min(options.height, visH);

    // Clamped so a signature near an edge on a tall page stays fully on a
    // short one instead of hanging over it.
    const vx = clamp(options.xRatio * visW, 0, visW - w);
    const vy = clamp(options.yRatio * visH, 0, visH - h);

    const { x, y } = visualToRaw(vx, vy, rawW, rawH, rotation);
    page.drawImage(sigImage, { x, y, width: w, height: h, rotate: degrees(rotation) });
  }

  return new Uint8Array(await doc.save({ useObjectStreams: true }));
}
