import { PDFDocument } from 'pdf-lib';

/**
 * Reorganizes pages of a PDF according to the given order.
 * @param pdfBytes - Source PDF bytes
 * @param pageOrder - Array of 0-based source page indices (duplicates allowed)
 *                    e.g. [2, 0, 1, 1] = page 3 first, then 1, then 2 twice
 */
export async function organizePdf(
  pdfBytes: Uint8Array,
  pageOrder: number[],
): Promise<Uint8Array> {
  const sourceDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const newDoc = await PDFDocument.create();

  const copiedPages = await newDoc.copyPages(sourceDoc, pageOrder);
  for (const page of copiedPages) {
    newDoc.addPage(page);
  }

  return new Uint8Array(await newDoc.save({ useObjectStreams: true }));
}
