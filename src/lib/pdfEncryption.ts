// pdfEncryption.ts: is this PDF actually locked?
//
// Unlock PDF used to accept any PDF at all, so an unprotected document went to
// the password screen and no password could be right. Answering that up front
// is the difference between "there is nothing here to unlock" and a prompt with
// no correct answer.
import { PDFDocument } from 'pdf-lib';
import { t } from '@/i18n';
import * as pdfjsLib from 'pdfjs-dist';

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
 * The refusal to show when a tool is handed a PDF it cannot open, or null when
 * the document can be worked on.
 *
 * Asks whether a password is *needed*, not whether the file is encrypted: see
 * pdfNeedsPassword. Unlock and Protect deliberately still ask the other
 * question, because a permissions-encrypted file is genuinely something Unlock
 * can strip and something Protect should not re-encrypt.
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
/**
 * Whether opening this PDF actually requires a password from the reader.
 *
 * Not the same question as `isPdfEncrypted`, and conflating the two is what
 * this exists to stop. A great many published PDFs (annual reports, statements,
 * anything from a corporate template) carry an encryption dictionary with an
 * *empty* user password and an owner password that only restricts printing and
 * copying. Every reader opens those without prompting. `isEncrypted` is true for
 * them all the same, so twelve tools refused documents that need no password,
 * and pointed the reader at Unlock, which would then ask for one that does not
 * exist.
 *
 * pdf.js is the oracle because it is the only one of the two libraries that
 * tries the empty password and reports the difference: it raises
 * PasswordException only when a password is genuinely needed. Measured on a
 * Ghostscript-built owner-password-only fixture, which pdf-lib calls encrypted
 * and pdf.js opens and renders.
 *
 * A document that fails for any other reason counts as not password protected:
 * damaged bytes are Repair's problem, and the flow's own error handling gives a
 * better message than a wrong one about passwords.
 *
 * CRITICAL: slice() the bytes. PDF.js transfers the ArrayBuffer to its worker
 * and detaches the original, so the caller's copy would come back empty.
 *
 * Deliberately does not import pdfThumbnail to arrange a worker. That module is
 * browser-only, and importing it here dragged DOM setup into every lib test.
 * Nothing is rendered on this path: pdf.js parses the header, tries the empty
 * password and stops, which it does perfectly well on a fake worker.
 */
export async function pdfNeedsPassword(pdfBytes: Uint8Array): Promise<boolean> {
  // An unencrypted document needs no password and no pdf.js to prove it. This
  // is also the overwhelmingly common case, so it stays off the slow path.
  if (!(await isPdfEncrypted(pdfBytes))) return false;

  try {
    const task = pdfjsLib.getDocument({ data: pdfBytes.slice(), password: '' });
    const doc = await task.promise;
    await doc.destroy();
    return false;
  } catch (err) {
    if ((err as { name?: string })?.name === 'PasswordException') return true;
    // pdf.js could not answer. The document is definitely encrypted, so keep
    // the old, conservative refusal rather than waving through a file the
    // renderers may then fail on, which is the blank-screen failure the refusal
    // was written to prevent in the first place.
    return true;
  }
}

export async function encryptedPdfRefusal(pdfBytes: Uint8Array): Promise<string | null> {
  return (await pdfNeedsPassword(pdfBytes)) ? t('pdfEncryption.lockedUseUnlock') : null;
}
