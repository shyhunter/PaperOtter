# <img src="img/icons/lock.svg" width="28"/> Protect PDF

**What it's for:** add password encryption to a PDF, so it can't be opened (or, depending on the password, edited) without the right password.

## How to protect a PDF

1. **Pick** — open a PDF file.
2. **Password** — set a password.
3. **Save** — write the encrypted PDF to disk.

## How the encryption works

Protect PDF runs the file through [Ghostscript](https://ghostscript.com/) with 128-bit RC4 encryption (`-dEncryptionR=3 -dKeyLength=128`) and sets two separate passwords:

- **User password** — required to *open* the PDF at all.
- **Owner password** — controls permissions (printing, editing, copying) once the file is open. A PDF reader is expected to honor these restrictions, though enforcement ultimately depends on the software opening the file.

Both fields are required — Papercut won't run Protect with either password left empty.

## Why protection might fail

- **Corrupted or unusual PDF structure.** If Ghostscript can't process the source file at all, protection fails outright — try [Repair PDF](Repair-PDF) first.
- **Ghostscript isn't available.** See [Required Dependencies](Required-Dependencies).

Note that 128-bit RC4 is an older, widely-supported PDF encryption standard — it protects against casual access, but shouldn't be relied on as strong protection for highly sensitive documents.

---

See also: [Unlock PDF](Unlock-PDF) · [Redact PDF](Redact-PDF)
