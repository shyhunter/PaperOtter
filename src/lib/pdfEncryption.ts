// pdfEncryption.ts: is this PDF actually locked?
//
// Unlock PDF used to accept any PDF at all, so an unprotected document went to
// the password screen and no password could be right. Answering that up front
// is the difference between "there is nothing here to unlock" and a prompt with
// no correct answer.
import { PDFDocument } from 'pdf-lib';

/**
 * Whether `pdfBytes` carries an encryption dictionary.
 *
 * Loads with `ignoreEncryption` on purpose: without it pdf-lib throws on the
 * very documents this needs to identify. Bytes that cannot be parsed at all
 * count as not encrypted -- a damaged file is Repair's problem, and calling it
 * locked would send someone hunting for a password that never existed.
 */
export async function isPdfEncrypted(pdfBytes: Uint8Array): Promise<boolean> {
  try {
    const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
    return doc.isEncrypted;
  } catch {
    return false;
  }
}
