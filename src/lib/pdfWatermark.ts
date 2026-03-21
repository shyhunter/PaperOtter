// Adds a centered text watermark to every page of a PDF using pdf-lib.
import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib';

export interface WatermarkOptions {
  text: string;
  fontSize: number;      // default 48
  opacity: number;       // 0.0 to 1.0, default 0.3
  rotation: number;      // degrees, default -45 (diagonal)
  color: 'gray' | 'red' | 'blue'; // simple color presets
}

const COLOR_MAP = {
  gray: rgb(0.5, 0.5, 0.5),
  red: rgb(0.8, 0.2, 0.2),
  blue: rgb(0.2, 0.2, 0.8),
};

export const DEFAULT_WATERMARK_OPTIONS: WatermarkOptions = {
  text: 'CONFIDENTIAL',
  fontSize: 48,
  opacity: 0.3,
  rotation: -45,
  color: 'gray',
};

export async function addWatermark(
  pdfBytes: Uint8Array,
  options: WatermarkOptions,
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages = doc.getPages();

  for (const page of pages) {
    const { width, height } = page.getSize();
    const textWidth = font.widthOfTextAtSize(options.text, options.fontSize);

    // For diagonal watermark we rotate around page center.
    // Offset by half text width (adjusted for rotation) to visually center.
    const rad = Math.abs(options.rotation) * (Math.PI / 180);
    const adjustedX = width / 2 - (textWidth * Math.cos(rad)) / 2;
    const adjustedY = height / 2 - (textWidth * Math.sin(rad)) / 2;

    page.drawText(options.text, {
      x: adjustedX,
      y: adjustedY,
      size: options.fontSize,
      font,
      color: COLOR_MAP[options.color],
      opacity: options.opacity,
      rotate: degrees(options.rotation),
    });
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
  const page = previewDoc.getPages()[0];
  const { width, height } = page.getSize();
  const textWidth = font.widthOfTextAtSize(options.text, options.fontSize);

  const rad = Math.abs(options.rotation) * (Math.PI / 180);
  const adjustedX = width / 2 - (textWidth * Math.cos(rad)) / 2;
  const adjustedY = height / 2 - (textWidth * Math.sin(rad)) / 2;

  page.drawText(options.text, {
    x: adjustedX,
    y: adjustedY,
    size: options.fontSize,
    font,
    color: COLOR_MAP[options.color],
    opacity: options.opacity,
    rotate: degrees(options.rotation),
  });

  return new Uint8Array(await previewDoc.save({ useObjectStreams: true }));
}
