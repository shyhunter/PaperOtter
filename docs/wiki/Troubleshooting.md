# Troubleshooting

## "Papercut is damaged and can't be opened" (macOS)

Open **Terminal** and run:

```
xattr -cr /Applications/Papercut.app
```

Then open Papercut normally. This happens because the app isn't yet signed
with an Apple Developer certificate, not because anything is actually wrong
with it.

## "Windows protected your PC" (SmartScreen warning)

Click **More info**, then **Run anyway**. Same cause as above, but for
Windows code-signing -- it's on the roadmap, not a sign of a broken
installer.

## Ghostscript is missing or crashes

See [Required Dependencies](Required-Dependencies#ghostscript-bundled-used-for-pdf-compression)
for per-platform install steps and the reinstall fallback.

## DOC/DOCX or EPUB/MOBI conversion isn't available

You need [LibreOffice or Calibre](Required-Dependencies) installed and on
your `PATH`. Papercut will show a prompt naming the missing dependency when
this happens.

## "PDF unlock failed" / "password protection failed"

For **Unlock**, this means the password you entered doesn't match the one on
the file, or the PDF itself is corrupted. For **Protect**, it usually means
the source file is corrupted or uses a PDF feature Ghostscript can't encrypt.
Try re-exporting the source PDF and protecting it again.

## Still stuck?

[Open an issue](https://github.com/shyhunter/Papercut/issues/new/choose) and
include the exact error message -- happy to help.

---

See also: [Required Dependencies](Required-Dependencies) · [FAQ](FAQ)
