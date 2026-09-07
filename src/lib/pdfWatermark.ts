// Adds a text watermark to every page of a PDF using pdf-lib.
import { PDFDocument, StandardFonts, rgb, degrees, type PDFFont, type PDFPage } from 'pdf-lib';
import { hexToRgb } from '@/lib/colorPresets';
import { normalisedRotation, visualToRaw } from '@/lib/pdfPageNumbers';

export interface WatermarkOptions {
  text: string;
  fontSize: number;      // default 48
  opacity: number;       // 0.0 to 1.0, default 0.3
  rotation: number;      // degrees, default -45 (diagonal)
  color: string;         // #RRGGBB, any colour the shared picker offers
  /** Horizontal centre of the text, as a fraction of page width (0..1). */
  centerX: number;
  /** Vertical centre of the text, as a fraction of page height (0..1),
   *  measured from the bottom as PDF coordinates are. */
  centerY: number;
}

export const DEFAULT_WATERMARK_OPTIONS: WatermarkOptions = {
  text: 'CONFIDENTIAL',
  fontSize: 48,
  opacity: 0.3,
  // rgb(0.5, 0.5, 0.5) to 8 bits — what the retired 'gray' preset drew, so the
  // default keeps looking exactly as it did.
  color: '#808080',
  rotation: -45,
  centerX: 0.5,
  centerY: 0.5,
};

/** Bounds for the watermark's font size, shared by the sidebar field and the
 *  canvas resize handle so the two cannot disagree about what is allowed. */
export const WATERMARK_FONT_SIZE_MIN = 8;
export const WATERMARK_FONT_SIZE_MAX = 200;

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0.5;
  return Math.min(1, Math.max(0, n));
}

/**
 * Where the text's baseline-left origin has to go for its *centre* to land on
 * the requested point, and which way up to draw it.
 *
 * The position is stored as a centre because that is what the user drags: the
 * grab point and the anchor have to be the same thing, or the watermark jumps
 * out from under the cursor on the first pixel of movement. pdf-lib draws from
 * a baseline-left origin and rotates about that origin, so the offset back to
 * it has to be rotated too.
 *
 * All of that is worked out in the frame the reader sees and then mapped back,
 * because /Rotate turns the page at display time and pdf-lib draws in the
 * unturned space underneath. centerX and centerY come from a drag on the
 * rendered page, where pdf.js has already applied the rotation, so on a turned
 * page they were being multiplied by the wrong edge -- and the text was drawn
 * at the angle the user picked in a space the viewer then turned again, so a
 * -45 degree watermark came out on the other diagonal. The same defect page
 * numbers and signatures had.
 *
 * Shared by the full-document and single-page-preview paths so the preview
 * cannot drift from the output the user actually gets.
 */
export function computeWatermarkPlacement(
  page: PDFPage,
  font: PDFFont,
  options: WatermarkOptions,
): { x: number; y: number; rotation: number } {
  const { width: rawW, height: rawH } = page.getSize();
  const pageRotation = normalisedRotation(page);
  // A quarter turn swaps what the reader perceives as width and height.
  const quarter = pageRotation === 90 || pageRotation === 270;
  const width = quarter ? rawH : rawW;
  const height = quarter ? rawW : rawH;

  const textWidth = font.widthOfTextAtSize(options.text, options.fontSize);
  // Cap height is the visual middle of capitals far better than the full font
  // box, which includes descender space a watermark rarely uses.
  const textHeight = font.heightAtSize(options.fontSize) * 0.5;

  const cx = clamp01(options.centerX) * width;
  const cy = clamp01(options.centerY) * height;

  const rad = (options.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  // Rotate the half-extent vector (-w/2, -h/2) by the angle the reader will see,
  // then step from the centre by it.
  const dx = -textWidth / 2;
  const dy = -textHeight / 2;

  const vx = cx + dx * cos - dy * sin;
  const vy = cy + dx * sin + dy * cos;

  const { x, y } = visualToRaw(vx, vy, rawW, rawH, pageRotation);
  // The viewer's own rotation cancels the page's share, leaving the text at the
  // angle that was chosen.
  return { x, y, rotation: options.rotation + pageRotation };
}

function drawWatermark(page: PDFPage, font: PDFFont, options: WatermarkOptions): void {
  const { x, y, rotation } = computeWatermarkPlacement(page, font, options);
  const { r, g, b } = hexToRgb(options.color);

  page.drawText(options.text, {
    x,
    y,
    size: options.fontSize,
    font,
    color: rgb(r, g, b),
    opacity: options.opacity,
    rotate: degrees(rotation),
  });
}

export async function addWatermark(
  pdfBytes: Uint8Array,
  options: WatermarkOptions,
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const font = await doc.embedFont(StandardFonts.Helvetica);

  for (const page of doc.getPages()) {
    drawWatermark(page, font, options);
  }

  return new Uint8Array(await doc.save({ useObjectStreams: true }));
}

/**
 * Creates a single-page preview PDF with the watermark applied to one page only.
 * Use this for live before/after thumbnail previews to avoid the performance cost
 * of processing every page in large documents.
 *
 * @param pdfBytes  - Source PDF bytes
 * @param options   - Watermark options to apply
 * @param pageIndex - 0-based page index to use for the preview (defaults to first page)
 * @returns         - Single-page PDF bytes with the watermark applied
 */
export async function addWatermarkSinglePage(
  pdfBytes: Uint8Array,
  options: WatermarkOptions,
  pageIndex = 0,
): Promise<Uint8Array> {
  const srcDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const previewDoc = await PDFDocument.create();

  // Clamp pageIndex to valid range
  const clampedIndex = Math.min(Math.max(pageIndex, 0), srcDoc.getPageCount() - 1);
  const [copiedPage] = await previewDoc.copyPages(srcDoc, [clampedIndex]);
  previewDoc.addPage(copiedPage);

  const font = await previewDoc.embedFont(StandardFonts.Helvetica);
  drawWatermark(previewDoc.getPages()[0], font, options);

  return new Uint8Array(await previewDoc.save({ useObjectStreams: true }));
}
