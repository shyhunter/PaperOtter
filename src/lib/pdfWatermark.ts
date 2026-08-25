// Adds a text watermark to every page of a PDF using pdf-lib.
import { PDFDocument, StandardFonts, rgb, degrees, type PDFFont, type PDFPage } from 'pdf-lib';
import { hexToRgb } from '@/lib/colorPresets';

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

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0.5;
  return Math.min(1, Math.max(0, n));
}

/**
 * Where the text's baseline-left origin has to go for its *centre* to land on
 * the requested point.
 *
 * The position is stored as a centre because that is what the user drags: the
 * grab point and the anchor have to be the same thing, or the watermark jumps
 * out from under the cursor on the first pixel of movement. pdf-lib draws from
 * a baseline-left origin and rotates about that origin, so the offset back to
 * it has to be rotated too.
 *
 * Shared by the full-document and single-page-preview paths so the preview
 * cannot drift from the output the user actually gets.
 */
export function computeWatermarkPlacement(
  page: PDFPage,
  font: PDFFont,
  options: WatermarkOptions,
): { x: number; y: number } {
  const { width, height } = page.getSize();
  const textWidth = font.widthOfTextAtSize(options.text, options.fontSize);
  // Cap height is the visual middle of capitals far better than the full font
  // box, which includes descender space a watermark rarely uses.
  const textHeight = font.heightAtSize(options.fontSize) * 0.5;

  const cx = clamp01(options.centerX) * width;
  const cy = clamp01(options.centerY) * height;

  const rad = (options.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  // Rotate the half-extent vector (-w/2, -h/2) by the same angle pdf-lib will
  // apply, then step from the centre by it.
  const dx = -textWidth / 2;
  const dy = -textHeight / 2;

  return {
    x: cx + dx * cos - dy * sin,
    y: cy + dx * sin + dy * cos,
  };
}

function drawWatermark(page: PDFPage, font: PDFFont, options: WatermarkOptions): void {
  const { x, y } = computeWatermarkPlacement(page, font, options);
  const { r, g, b } = hexToRgb(options.color);

  page.drawText(options.text, {
    x,
    y,
    size: options.fontSize,
    font,
    color: rgb(r, g, b),
    opacity: options.opacity,
    rotate: degrees(options.rotation),
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
