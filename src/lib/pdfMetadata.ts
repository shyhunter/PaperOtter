import { PDFDocument, PDFName } from 'pdf-lib';

/**
 * Removes identifying metadata from a PDF.
 *
 * Ghostscript has no single flag for this -- its presets rewrite the document
 * but carry the Info dictionary across -- so the strip happens here, after
 * compression, as a separate pdf-lib pass.
 *
 * Two places hold metadata and both are cleared: the Info dictionary (title,
 * author, subject, keywords, creator, producer) and the XMP packet hanging off
 * the catalog, which readers prefer when present and which would otherwise
 * survive an Info-only wipe.
 *
 * `updateMetadata: false` matters: pdf-lib otherwise stamps its own Producer
 * and a fresh ModDate during save, so a "stripped" file would come out
 * advertising the library and the moment it was written.
 */
export async function stripPdfMetadata(pdfBytes: Uint8Array): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true, updateMetadata: false });

  doc.setTitle('');
  doc.setAuthor('');
  doc.setSubject('');
  doc.setKeywords([]);
  doc.setCreator('');
  doc.setProducer('');

  doc.catalog.delete(PDFName.of('Metadata'));

  return new Uint8Array(await doc.save({ useObjectStreams: true }));
}
