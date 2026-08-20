# Required Dependencies

Most of Papercut works with nothing extra to install. Two tools are bundled or
optional, listed below.

## Ghostscript (bundled, used for PDF compression)

Ghostscript ships bundled with the Papercut installer, so PDF compression
should work out of the box. If Papercut reports it as missing or it crashes,
Papercut falls back to looking for a system copy on your `PATH`:

- **macOS:** `brew install ghostscript` (Papercut also checks
  `/opt/homebrew/bin/gs` and `/usr/local/bin/gs` directly, in case it's
  installed but not on your `PATH`)
- **Linux:** `sudo apt install ghostscript` (or your distribution's package
  manager equivalent)
- **Windows:** download from [ghostscript.com](https://ghostscript.com/releases/gsdnld.html)
  and make sure `gswin64c` (or `gs`) is on your `PATH`

If it crashes with a missing-library error even after installing, try
reinstalling Papercut first -- that usually fixes a corrupted bundled copy.

## LibreOffice (optional, used for DOC/DOCX conversion)

Not bundled. Needed only for converting to/from DOC and DOCX. Install from
[libreoffice.org](https://www.libreoffice.org/download/) and make sure
`soffice` is on your `PATH`. Without it, Papercut shows a prompt naming the
missing dependency when you try to use a tool that needs it.

## Calibre (optional, used for EPUB/MOBI conversion)

Not bundled. Needed only for ebook formats (EPUB, MOBI). Install from
[calibre-ebook.com](https://calibre-ebook.com/download) and make sure
`ebook-convert` is on your `PATH`. Same fallback behavior as LibreOffice above.

---

See also: [Troubleshooting](Troubleshooting)
