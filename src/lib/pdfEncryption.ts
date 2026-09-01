// pdfEncryption.ts: is this PDF actually locked?
//
// Unlock PDF used to accept any PDF at all, so an unprotected document went to
// the password screen and no password could be right. Answering that up front
// is the difference between "there is nothing here to unlock" and a prompt with
// no correct answer.
import { PDFDocument } from 'pdf-lib';
import { t } from '@/i18n';

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

/**
 * The refusal to show when a tool is handed an encrypted PDF, or null when the
 * document can be worked on.
 *
 * Every flow opens its document with pdf-lib's `ignoreEncryption: true`, which
 * does exactly what it says: the load succeeds and `getPageCount()` reports
 * honestly. Measured on `test-fixtures/locked.pdf` — it loads, `isEncrypted` is
 * true, and it reports six pages. So a flow advances, lays out six tiles, and
 * only then does pdf.js fail to decrypt any of them, leaving the user on a
 * working-looking screen with nothing on it and no statement of what happened.
 *
 * The check belongs at the door rather than in each renderer: by the time a
 * thumbnail fails, the tool has already claimed it opened the file.
 *
 * Unlock is the one tool that must *accept* an encrypted file, and Protect
 * refuses one for its own reason (it cannot re-encrypt what it cannot open), so
 * neither uses this.
 */
export async function encryptedPdfRefusal(pdfBytes: Uint8Array): Promise<string | null> {
  return (await isPdfEncrypted(pdfBytes)) ? t('pdfEncryption.lockedUseUnlock') : null;
}
