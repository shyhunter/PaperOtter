# <img src="img/icons/lock.svg" width="28"/> Protect PDF

**What it's for:** add password encryption to a PDF, so it can't be opened (or, depending on the password, edited) without the right password.

## How to protect a PDF

1. **Pick**: open a PDF file.
2. **Password**: set a password.
3. **Save**: write the encrypted PDF to disk.

## ⚠️ Papercut cannot recover this password

**Papercut never stores the password you set.** It is held in memory only for as
long as it takes to encrypt the file, and it is written nowhere, not to a
settings file, not to a log, not to disk, and never off your machine.

The consequence is worth being blunt about: **if you forget the password, the
file cannot be opened again. Not by you, not by us, not by anyone.** There is no
reset, no recovery code, and no back door. This is a property of PDF encryption,
not a limitation Papercut could remove.

Before you protect a file:

- **Write the password down somewhere you trust**: a password manager is ideal.
- **Keep the unprotected original** until you have confirmed the protected copy
  opens with the password you set. Papercut always writes the protected document
  as a *new* file and never encrypts your original in place, so keeping it costs
  you nothing.

  This makes Protect the one exception to how [Save works everywhere else](Using-Papercut#what-save-does),
  where Save replaces the file you opened. Protect does not, because it is the
  only operation whose result can become permanently unopenable.
- **Test it.** Close the protected file and reopen it with the password before
  you delete anything.

Because the loss is permanent and cannot be undone, Papercut asks you to tick a
box confirming you understand this before it will encrypt anything.

## How the encryption works

Protect PDF runs the file through [Ghostscript](https://ghostscript.com/) with 128-bit RC4 encryption (`-dEncryptionR=3 -dKeyLength=128`). PDF defines two passwords, and Papercut sets **both to the value you type**:

- **User password**: required to *open* the PDF at all.
- **Owner password**: controls permissions (printing, editing, copying) once the file is open. A PDF reader is expected to honor these restrictions, though enforcement ultimately depends on the software opening the file.

Papercut does not currently offer the "openable by anyone, but restricted" variant that setting only an owner password would give you. Whatever you type is required to open the document.

Ghostscript's PDF writer supports only encryption revisions 2 and 3: RC4-40 and RC4-128. AES is not available through it, which is why the stronger AES-256 option common in other tools is not offered here.

## Protecting from inside Edit PDF

The Protect panel in the PDF editor writes a **separate protected file** and
leaves the document you have open untouched. That is deliberate: an encrypted
PDF cannot be re-saved by the editor, and encrypting the open document in place
would put your original at risk.

## Why protection might fail

- **Corrupted or unusual PDF structure.** If Ghostscript can't process the source file at all, protection fails outright: try [Repair PDF](Repair-PDF) first.
- **Ghostscript isn't available.** See [Required Dependencies](Required-Dependencies).

Note that 128-bit RC4 is an older, widely-supported PDF encryption standard: it protects against casual access, but shouldn't be relied on as strong protection for highly sensitive documents.

---

See also: [Unlock PDF](Unlock-PDF) · [Redact PDF](Redact-PDF)
