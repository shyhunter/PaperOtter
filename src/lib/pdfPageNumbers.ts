import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export type NumberPosition = 'bottom-center' | 'bottom-left' | 'bottom-right' | 'top-center' | 'top-left' | 'top-right';
export type NumberFormat = 'numeric' | 'roman' | 'alphabetic';

export interface PageNumberOptions {
  position: NumberPosition;
  format: NumberFormat;
  fontSize: number;       // in points, default 12
  startNumber: number;    // default 1
  margin: number;         // distance from edge in points, default 30
  pageRange?: Set<number>; // 1-based pages to number (undefined = all)
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

export async function addPageNumbers(
  pdfBytes: Uint8Array,
  options: PageNumberOptions,
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages = doc.getPages();

  for (let i = 0; i < pages.length; i++) {
    const pageNum1Based = i + 1;
    if (options.pageRange && !options.pageRange.has(pageNum1Based)) continue;

    const page = pages[i];
    const { width, height } = page.getSize();
    const text = formatNumber(options.startNumber + i, options.format);
    const textWidth = font.widthOfTextAtSize(text, options.fontSize);

    let x: number, y: number;
    const m = options.margin;
    switch (options.position) {
      case 'bottom-center': x = (width - textWidth) / 2; y = m; break;
      case 'bottom-left':   x = m; y = m; break;
      case 'bottom-right':  x = width - textWidth - m; y = m; break;
      case 'top-center':    x = (width - textWidth) / 2; y = height - m - options.fontSize; break;
      case 'top-left':      x = m; y = height - m - options.fontSize; break;
      case 'top-right':     x = width - textWidth - m; y = height - m - options.fontSize; break;
    }

    page.drawText(text, { x, y, size: options.fontSize, font, color: rgb(0, 0, 0) });
  }

  return new Uint8Array(await doc.save({ useObjectStreams: true }));
}
