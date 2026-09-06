/**
 * [UNL] Unlock refuses a PDF that has no lock on it.
 *
 * Reported from a real build: Unlock PDF accepted any PDF at all. It went
 * straight to the password screen for a document that was never protected,
 * took whatever was typed, and produced a "unlocked" copy of a file that was
 * already open -- a second identical document, and a password prompt that
 * could not be answered correctly because there was no answer.
 *
 * Detection reads the real fixtures, not a stub: `locked.pdf` is a genuinely
 * encrypted PDF (Ghostscript, RC4-128, user password `papercut`) and the rest
 * are ordinary documents (P007).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isPdfEncrypted, pdfNeedsPassword, encryptedPdfRefusal } from '@/lib/pdfEncryption';

const fixture = (name: string) =>
  new Uint8Array(readFileSync(join(process.cwd(), 'test-fixtures', name)));

describe('isPdfEncrypted', () => {
  it('[UNL-01] says yes to a genuinely password-protected PDF', async () => {
    await expect(isPdfEncrypted(fixture('locked.pdf'))).resolves.toBe(true);
  });

  it('[UNL-02] says no to an ordinary text PDF', async () => {
    await expect(isPdfEncrypted(fixture('warnock_camelot.pdf'))).resolves.toBe(false);
  });

  it('[UNL-03] says no to the other unprotected fixtures too', async () => {
    for (const name of ['sample.pdf', 'scanned.pdf', 'photo_heavy.pdf']) {
      await expect(isPdfEncrypted(fixture(name)), `${name} is not protected`).resolves.toBe(false);
    }
  });

  it('[UNL-04] treats bytes it cannot parse as not-protected rather than throwing', async () => {
    // A damaged file is Repair's problem, not Unlock's. Reporting "locked"
    // here would send someone hunting for a password that never existed.
    await expect(isPdfEncrypted(new Uint8Array([1, 2, 3, 4]))).resolves.toBe(false);
  });
});

/**
 * [ENC] A PDF that is encrypted but opens with no password is not locked.
 *
 * Reported from a real Windows build: a BMW annual report downloaded from the
 * web was refused by every tool with "this PDF is password protected", and the
 * suggested fix, Unlock, would have asked for a password that does not exist.
 *
 * The file was encrypted, just not against the reader. Corporate publishing
 * templates routinely set an owner password to restrict printing and copying
 * and leave the user password empty, so every viewer opens the document without
 * prompting. `isEncrypted` cannot see that difference; pdf.js can, because it
 * tries the empty password and only raises PasswordException when one is really
 * required.
 *
 * `permissions-only.pdf` is that shape, built with the bundled Ghostscript:
 * RC4-128, owner password set, user password empty.
 */
describe('pdfNeedsPassword', () => {
  it('[ENC-01] says no to a permissions-encrypted PDF that opens with no password', async () => {
    await expect(pdfNeedsPassword(fixture('permissions-only.pdf'))).resolves.toBe(false);
  });

  it('[ENC-02] still says yes to a PDF with a real user password', async () => {
    await expect(pdfNeedsPassword(fixture('locked.pdf'))).resolves.toBe(true);
  });

  it('[ENC-03] says no to an ordinary unencrypted PDF', async () => {
    await expect(pdfNeedsPassword(fixture('warnock_camelot.pdf'))).resolves.toBe(false);
  });

  /* The distinction the bug turned on: both files are encrypted, only one is
     locked against the reader. Asserted together so a future change that
     collapses them back into one question fails here. */
  it('[ENC-04] both files are encrypted, but only one needs a password', async () => {
    await expect(isPdfEncrypted(fixture('permissions-only.pdf'))).resolves.toBe(true);
    await expect(isPdfEncrypted(fixture('locked.pdf'))).resolves.toBe(true);
    await expect(pdfNeedsPassword(fixture('permissions-only.pdf'))).resolves.toBe(false);
    await expect(pdfNeedsPassword(fixture('locked.pdf'))).resolves.toBe(true);
  });
});

describe('encryptedPdfRefusal', () => {
  it('[ENC-05] lets a permissions-encrypted PDF through, so the twelve tools accept it', async () => {
    await expect(encryptedPdfRefusal(fixture('permissions-only.pdf'))).resolves.toBeNull();
  });

  it('[ENC-06] still refuses a PDF that genuinely needs a password', async () => {
    await expect(encryptedPdfRefusal(fixture('locked.pdf'))).resolves.not.toBeNull();
  });
});
