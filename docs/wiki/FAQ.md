# FAQ

### Does Papercut send my files anywhere?

No. All processing happens locally using native binaries (Ghostscript,
LibreOffice, Calibre) and in-app libraries (pdf-lib, pdfjs, mammoth, Sharp).
Your files never leave your machine -- see the
[Privacy section](https://github.com/shyhunter/Papercut#privacy) of the
README for the full statement.

### Does Papercut need an internet connection?

No, not for document processing. Papercut makes exactly two network calls,
neither of which sends any data about you or your files: an update check on
launch, and a feedback-contact-address lookup when you open the About
dialog.

### What happens to temporary files created during processing?

They're deleted automatically once processing finishes. If Papercut crashes
before cleanup, any leftover temp files are swept on the next launch.

### Why does macOS say "Papercut is damaged and can't be opened"?

The app isn't yet signed with an Apple Developer certificate. Open
**Terminal** and run `xattr -cr /Applications/Papercut.app`, then open
Papercut normally.

### Why does Windows show a SmartScreen warning?

Same reason, for Windows code-signing -- it's on the roadmap, not a sign of
a problem with the installer. Click **More info**, then **Run anyway**.

### Do I need to install anything else?

Ghostscript ships bundled with Papercut. LibreOffice and Calibre are
optional, only needed for DOC/ODT/RTF and EPUB/MOBI conversion respectively
-- see [Required Dependencies](Required-Dependencies).

### Is Papercut free?

Yes, it's open source under the MIT license. If it's useful to you, there's
an optional way to
[support development](https://buymeacoffee.com/shyhunter).

### How do I report a bug or request a feature?

[Open an issue](https://github.com/shyhunter/Papercut/issues/new/choose) --
templates are provided for both.

---

See also: [Troubleshooting](Troubleshooting) · [Using Papercut](Using-Papercut)
