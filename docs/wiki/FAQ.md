# FAQ

### Does Papercut send my files anywhere?

No. All processing happens locally using native code (qpdf,
LibreOffice, Calibre), and in-app libraries (pdf-lib, pdfjs, mammoth, and
the Rust `image` crate).
Your files never leave your machine: see the
[Privacy section](https://github.com/shyhunter/PaperOtter#privacy) of the
README for the full statement.

### Does Papercut need an internet connection?

No, not for document processing. Papercut makes exactly two network calls,
neither of which sends any data about you or your files: an update check on
launch, and a feedback-contact-address lookup when you open the About
dialog.

### What happens to temporary files created during processing?

They're deleted automatically once processing finishes. If Papercut crashes
before cleanup, any leftover temp files are swept on the next launch.

### Why does macOS say it "could not verify" Papercut on first launch?

Papercut is signed, but not yet notarised by Apple. Open it, click **Done** on
the refusal, then go to **System Settings → Privacy & Security**, scroll to
**Security**, and click **Open Anyway**. A second dialog appears: click
**Open Anyway** there too, then authenticate with Touch ID or your admin
password. Note that the blue default button in that dialog is **Move to Bin**,
which deletes the app, so click deliberately. The override only appears after
macOS has blocked you and expires about an hour later. See
[Troubleshooting](Troubleshooting) for the full sequence.

If you see the older _"damaged and can't be opened"_ message instead, run
`xattr -cr /Applications/Papercut.app`.

### Why does Windows show a SmartScreen warning?

Same reason, for Windows code-signing: it's on the roadmap, not a sign of
a problem with the installer. Click **More info**, then **Run anyway**.

### Do I need to install anything else?

LibreOffice and Calibre are
optional, only needed for DOC/ODT/RTF and EPUB/MOBI conversion respectively
-- see [Required Dependencies](Required-Dependencies).

### Is Papercut free?

Yes, it's open source under the MIT license. If it's useful to you, there's
an optional way to
[support development](https://buymeacoffee.com/shyhunter).

### How do I report a bug or suggest a feature?

Bugs go to the
[issue tracker](https://github.com/shyhunter/PaperOtter/issues/new/choose). Feature
ideas go to
[Discussions](https://github.com/shyhunter/PaperOtter/discussions/new?category=ideas),
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
[open an issue](https://github.com/shyhunter/PaperOtter/issues). Corrections from
native speakers are genuinely the most useful thing anyone can send this project.

