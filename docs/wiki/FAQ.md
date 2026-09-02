# FAQ

### Does Papercut send my files anywhere?

No. All processing happens locally using native binaries (Ghostscript,
LibreOffice, Calibre), and in-app libraries (pdf-lib, pdfjs, mammoth, and
the Rust `image` crate).
Your files never leave your machine: see the
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

Same reason, for Windows code-signing: it's on the roadmap, not a sign of
a problem with the installer. Click **More info**, then **Run anyway**.

### I forgot the password on a PDF I protected. Can you recover it?

No. Nobody can.

Papercut never stores the password you set: it is used to encrypt the file and
then discarded, and it is never written to disk or sent anywhere. There is no
reset, no recovery code and no back door, and this is a property of PDF
encryption rather than something Papercut chose.

If you still have the unprotected original, use that. Papercut always writes
the protected document as a new file and never encrypts your original in place.
If you do not, the file cannot be opened again.

[Unlock PDF](Unlock-PDF) removes protection from a PDF **you already know the
password for**. It cannot open a file whose password is lost.

### Do I need to install anything else?

Ghostscript ships bundled with Papercut. LibreOffice and Calibre are
optional, only needed for DOC/ODT/RTF and EPUB/MOBI conversion respectively
-- see [Required Dependencies](Required-Dependencies).

### Is Papercut free?

Yes, it's open source under the MIT license. If it's useful to you, there's
an optional way to
[support development](https://buymeacoffee.com/shyhunter).

### How do I report a bug or suggest a feature?

Bugs go to the
[issue tracker](https://github.com/shyhunter/Papercut/issues/new/choose). Feature
ideas go to
[Discussions](https://github.com/shyhunter/Papercut/discussions/new?category=ideas),
where they can be talked through before anyone commits to building them.

---

See also: [Troubleshooting](Troubleshooting) · [Using Papercut](Using-Papercut)

### What languages does Papercut speak, and how good are the translations?

Nine: English, German, Turkish, French, Spanish, Italian, Dutch, Polish and
Portuguese. You can switch language from the icon in the top bar; your choice is
remembered.

**All nine were written with AI assistance, English included, and none has been
checked by a professional translator.** They ship anyway, because for most people
a good-enough translation beats an English-only interface, but that is a
limitation worth stating rather than hoping you do not notice.

One exception is handled strictly. Sentences that warn you about losing data,
overwriting a file or deleting something are either translated in every language
or left in English in every language, never half-done. A test enforces it. A
warning you half-understand is more dangerous than one in a language you do not
speak at all.

If something reads oddly, says the wrong thing, or is missing, please
[open an issue](https://github.com/shyhunter/Papercut/issues). Corrections from
native speakers are genuinely the most useful thing anyone can send this project.

