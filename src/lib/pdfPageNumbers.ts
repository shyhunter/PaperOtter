import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { DEFAULT_TEXT_COLOR, hexToRgb } from '@/lib/colorPresets';

export type NumberPosition = 'bottom-center' | 'bottom-left' | 'bottom-right' | 'top-center' | 'top-left' | 'top-right';
export type NumberFormat = 'numeric' | 'roman' | 'alphabetic';

export interface PageNumberOptions {
  position: NumberPosition;
  format: NumberFormat;
  fontSize: number;       // in points, default 12
  startNumber: number;    // default 1
  margin: number;         // distance from edge in points, default 30
  pageRange?: Set<number>; // 1-based pages to number (undefined = all)
  color?: string;         // #RRGGBB, default DEFAULT_TEXT_COLOR
}

function toRoman(num: number): string {
  const vals = [1000, 900, 500, 400, 100, 90, 50, 40, 10, 9, 5, 4, 1];
  const syms = ['M', 'CM', 'D', 'CD', 'C', 'XC', 'L', 'XL', 'X', 'IX', 'V', 'IV', 'I'];
  let result = '';
  for (let i = 0; i < vals.length; i++) {
    while (num >= vals[i]) { result += syms[i]; num -= vals[i]; }
  }
  return result;
}

function toAlpha(num: number): string {
  let result = '';
  while (num > 0) { num--; result = String.fromCharCode(65 + (num % 26)) + result; num = Math.floor(num / 26); }
  return result;
}

export function formatNumber(n: number, format: NumberFormat): string {
  switch (format) {
    case 'roman': return toRoman(n).toLowerCase();
    case 'alphabetic': return toAlpha(n);
    default: return String(n);
  }
}

/** A page's /Rotate, normalised to 0, 90, 180 or 270. */
export function normalisedRotation(page: PDFPage): 0 | 90 | 180 | 270 {
  const raw = page.getRotation().angle;
  const snapped = Math.round(raw / 90) * 90;
  return (((snapped % 360) + 360) % 360) as 0 | 90 | 180 | 270;
}

/**
 * Maps a point in the frame the reader sees back into the page's own
 * coordinates.
 *
 * /Rotate turns the page clockwise at display time, and pdf-lib draws in the
 * unturned space underneath. Placing a number without undoing that put it on a
 * side edge, lying on its side, on every rotated page: reported after rotating a
 * document and then numbering it.
 *
 * The rotation is clockwise and PDF's origin is bottom-left with y upward, so
 * for 90 degrees the raw point (x, y) is seen at (y, W - x). These are the
 * inverses of that, per quarter turn.
 */
export function visualToRaw(
  vx: number, vy: number, rawW: number, rawH: number, rotation: 0 | 90 | 180 | 270,
): { x: number; y: number } {
  switch (rotation) {
    case 90:  return { x: rawW - vy, y: vx };
    case 180: return { x: rawW - vx, y: rawH - vy };
    case 270: return { x: vy, y: rawH - vx };
    default:  return { x: vx, y: vy };
  }
}

/**
 * Where the number goes on one page, what it reads, and which way up it sits.
 *
 * Shared by the full-document and single-page-preview paths so the preview
 * cannot drift from the output the user actually gets.
 *
 * Positions are worked out in the frame the reader sees, then mapped back, so
 * "bottom centre" means the bottom the reader is looking at rather than the
 * bottom of the unturned page. The glyphs are then turned by the same angle,
 * which the viewer's own rotation cancels out, leaving them upright.
 */
function computeNumberPlacement(
  page: PDFPage,
  font: PDFFont,
  displayNumber: number,
  options: PageNumberOptions,
): { x: number; y: number; text: string; rotation: 0 | 90 | 180 | 270 } {
  const { width: rawW, height: rawH } = page.getSize();
  const rotation = normalisedRotation(page);

  // A quarter turn swaps what the reader perceives as width and height.
  const quarter = rotation === 90 || rotation === 270;
  const width = quarter ? rawH : rawW;
  const height = quarter ? rawW : rawH;

  const text = formatNumber(displayNumber, options.format);
  const textWidth = font.widthOfTextAtSize(text, options.fontSize);
  const m = options.margin;

  let vx: number, vy: number;
  switch (options.position) {
    case 'bottom-center': vx = (width - textWidth) / 2; vy = m; break;
    case 'bottom-left':   vx = m; vy = m; break;
    case 'bottom-right':  vx = width - textWidth - m; vy = m; break;
    case 'top-center':    vx = (width - textWidth) / 2; vy = height - m - options.fontSize; break;
    case 'top-left':      vx = m; vy = height - m - options.fontSize; break;
    case 'top-right':     vx = width - textWidth - m; vy = height - m - options.fontSize; break;
  }

  const { x, y } = visualToRaw(vx, vy, rawW, rawH, rotation);
  return { x, y, text, rotation };
}

export async function addPageNumbers(
  pdfBytes: Uint8Array,
  options: PageNumberOptions,
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages = doc.getPages();
  const { r, g, b } = hexToRgb(options.color ?? DEFAULT_TEXT_COLOR);

  for (let i = 0; i < pages.length; i++) {
    const pageNum1Based = i + 1;
    if (options.pageRange && !options.pageRange.has(pageNum1Based)) continue;

    const page = pages[i];
    const { x, y, text, rotation } = computeNumberPlacement(page, font, options.startNumber + i, options);

    page.drawText(text, { x, y, size: options.fontSize, font, color: rgb(r, g, b), rotate: degrees(rotation) });
  }

  return new Uint8Array(await doc.save({ useObjectStreams: true }));
}

/**
 * Numbers a single page, extracted into its own minimal document, for fast live
 * previews. Numbering the full document on every option change (position, format,
 * font size, start number, colour) freezes the UI on large documents — pdf-lib has
 * to reparse and re-save every page and embedded image just to preview one page.
 */
export async function addPageNumbersSinglePage(
  pdfBytes: Uint8Array,
  options: PageNumberOptions,
  pageIndex = 0,
): Promise<Uint8Array> {
  const srcDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const previewDoc = await PDFDocument.create();

  const clampedIndex = Math.min(Math.max(pageIndex, 0), srcDoc.getPageCount() - 1);
  const [copiedPage] = await previewDoc.copyPages(srcDoc, [clampedIndex]);
  previewDoc.addPage(copiedPage);

  const font = await previewDoc.embedFont(StandardFonts.Helvetica);
  const page = previewDoc.getPages()[0];
  const { r, g, b } = hexToRgb(options.color ?? DEFAULT_TEXT_COLOR);
  const { x, y, text, rotation } = computeNumberPlacement(page, font, options.startNumber + clampedIndex, options);

  page.drawText(text, { x, y, size: options.fontSize, font, color: rgb(r, g, b), rotate: degrees(rotation) });

  return new Uint8Array(await previewDoc.save({ useObjectStreams: true }));
}
