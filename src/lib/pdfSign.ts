// Embeds a PNG signature image onto specified pages of a PDF using pdf-lib.
import { PDFDocument } from 'pdf-lib';

export interface SignatureOptions {
  /** PNG image bytes (decoded from data URL) */
  imageBytes: Uint8Array;
  /** X position in PDF coordinate space (bottom-left origin) */
  x: number;
  /** Y position in PDF coordinate space (bottom-left origin) */
  y: number;
  /** Width in PDF points */
  width: number;
  /** Height in PDF points */
  height: number;
  /** Zero-based page indices to stamp */
  pageIndices: number[];
}

/**
 * Embeds a PNG signature image onto the specified pages of a PDF.
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
    page.drawImage(sigImage, {
      x: options.x,
      y: options.y,
      width: options.width,
      height: options.height,
    });
  }

  return new Uint8Array(await doc.save({ useObjectStreams: true }));
}
