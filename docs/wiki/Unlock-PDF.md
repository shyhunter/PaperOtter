# <img src="img/icons/unlock.svg" width="28"/> Unlock PDF

**What it's for:** remove password protection from a PDF you already have the password for.

## How to unlock a PDF

1. **Pick**: open a password-protected PDF file.
2. **Password**: enter the current password.
3. **Save**: write the unlocked (unencrypted) PDF to disk.

## If you have forgotten the password

Unlock PDF cannot help you. It needs the correct password, and there is no way
to recover or reset a lost one, not in Papercut and not anywhere else. See
[Protect PDF](Protect-PDF) for what this means and how to avoid it.

## How it works

Papercut runs the file through [Ghostscript](https://ghostscript.com/), supplying your password (`-sPDFPassword=...`), and re-writing the PDF without encryption. This isn't a password-cracking tool: you need to already know the correct password for the file.

## Why unlocking might fail

- **"PDF unlock failed. The password may be incorrect or the file may be corrupted."**: this is the one message you'll see for both causes, since Ghostscript doesn't distinguish between them. Double-check the password first (case and special characters matter); if you're confident it's right, try [Repair PDF](Repair-PDF) on a copy to rule out corruption.
- **Ghostscript isn't available.** See [Required Dependencies](Required-Dependencies).

---

See also: [Protect PDF](Protect-PDF) · [Repair PDF](Repair-PDF)
