import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
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

/**
 * Where the number goes on one page, and what it reads.
 *
 * Shared by the full-document and single-page-preview paths so the preview
 * cannot drift from the output the user actually gets.
 */
function computeNumberPlacement(
  page: PDFPage,
  font: PDFFont,
  displayNumber: number,
  options: PageNumberOptions,
): { x: number; y: number; text: string } {
  const { width, height } = page.getSize();
  const text = formatNumber(displayNumber, options.format);
  const textWidth = font.widthOfTextAtSize(text, options.fontSize);
  const m = options.margin;

  let x: number, y: number;
  switch (options.position) {
    case 'bottom-center': x = (width - textWidth) / 2; y = m; break;
    case 'bottom-left':   x = m; y = m; break;
    case 'bottom-right':  x = width - textWidth - m; y = m; break;
    case 'top-center':    x = (width - textWidth) / 2; y = height - m - options.fontSize; break;
    case 'top-left':      x = m; y = height - m - options.fontSize; break;
    case 'top-right':     x = width - textWidth - m; y = height - m - options.fontSize; break;
  }

  return { x, y, text };
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
    const { x, y, text } = computeNumberPlacement(page, font, options.startNumber + i, options);

    page.drawText(text, { x, y, size: options.fontSize, font, color: rgb(r, g, b) });
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
  const { x, y, text } = computeNumberPlacement(page, font, options.startNumber + clampedIndex, options);

  page.drawText(text, { x, y, size: options.fontSize, font, color: rgb(r, g, b) });

  return new Uint8Array(await previewDoc.save({ useObjectStreams: true }));
}
