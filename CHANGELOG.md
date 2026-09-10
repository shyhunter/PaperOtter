# Changelog

Grouped by what someone using PaperOtter would notice, not by commit.

## Unreleased

### Changed

- **Papercut is now PaperOtter.** New name, new logo, and a redesigned interface.
  The app installs as `PaperOtter.app` and its settings live in a new folder, so
  a previous install's preferences are not carried over. Releases published under
  the old name still work: GitHub keeps the old repository address pointing here.
- **Feedback and crash reports go to GitHub Discussions** instead of opening an
  email draft. Crash reports open a pre-filled discussion; nothing is posted
  until you read it and press the button yourself.

### Removed

- **Protect PDF, Unlock PDF and PDF/A conversion.** All three ran through
  Ghostscript. Its licence made a closed-source release impossible, and two of
  the three did not work properly anyway: PDF/A claimed a conformance it did not
  meet, and "repair" returned a blank page while reporting success. Rather than
  ship a replacement that was worse, the features are gone.

### Fixed

- **Compression got better without Ghostscript, not worse.** The new in-process
  compressor produced 29,326 bytes where Ghostscript produced 40,366 on the same
  scanned document. The installer went from 52 MB to 24 MB.
- **Repairing a damaged PDF** now rebuilds it with qpdf, and says so honestly
  when a file is beyond repair instead of returning an empty document.

## v1.0.0

The first stable release. Since `v1.0.0-beta.9`, 243 commits.

### New

- **Nine languages.** English, German, Turkish, French, Spanish, Italian, Dutch,
  Polish and Portuguese, picked from the top bar and remembered. Papercut guesses
  from the operating system on first launch. Plural forms are handled properly,
  Polish has three, and several languages have categories English does not.
  *All nine are AI-assisted; see the note at the end.*
- **Read text from scans** (macOS). A scanned PDF becomes searchable and
  copyable, using the text recognition already built into the operating system.
  Every language the OS can read is offered, not a fixed list. The redact tool
  can search a scanned page too.
- **Batch processing.** Drop several files at once and run one operation over
  all of them, with progress and a summary at the end. Cancelling stops the
  queue *and* the file being worked on.
- **A PDF editor.** Edit text and images in place, find text across a document,
  reorder and rotate pages, and add page numbers or a watermark without leaving
  it.
- **HEIC photos** as input (macOS, and on Windows or Linux where the system has
  a decoder).
- **Saved settings.** Name the settings you use often and pick them up again
  later. The list ships empty on purpose: a preset named for a portal would be
  Papercut claiming to know which office you are dealing with.
- **Ghostscript is bundled.** Compression works out of the box on macOS,
  Windows and Linux with nothing to install.
- **Watermarks you place by hand.** Drag it where you want it and turn it with
  arrows rather than typing an angle.
- **Signature and redaction colour**, and page numbers you can colour or remove.

### Safer

These are the changes that stop Papercut damaging something of yours.

- **Save no longer risks your original.** Writing over a file is now atomic:
  Papercut writes a complete copy alongside it and swaps it in, so an
  interruption leaves the original untouched rather than half-overwritten.
- **Save and Save as… mean different things.** Save replaces the file you
  opened; Save as… keeps it and writes a copy. Previously "Save Again" could
  ignore a Save as… and overwrite the original anyway.
- **Save as… opens where the document came from**, not one folder above.
- **A read-only, deleted or moved file is reported, not guessed at.** You are
  told what happened and offered Save as… where retrying could not work.
- **Password-protected PDFs are refused at the door.** Eleven tools used to open
  one and show an empty document; they now say what is wrong and point at Unlock.
- **Encrypting in the editor no longer destroys the original.**
- **Redaction boxes are opaque.** A placed box was see-through, so redacted text
  could still be read.
- **Page rotation survives compression.** Ghostscript was silently undoing it.
- **An image is never returned larger than the one you gave it.**
- **Arriving at the save step no longer opens two dialogs.**

### Fixed

- PNG conversion froze the window and had no quality control; its slider had ten
  steps and two outcomes.
- Unlock refused to admit a PDF had no password; Protect accepted one that was
  already encrypted.
- The light theme was too bright and its hint text failed contrast requirements.
- Dropdown options were unreadable in dark mode, and native controls ignored the
  theme entirely.
- Dropping a second file replaced the first instead of joining it.
- Page grids could not be scrolled, and each thumbnail re-parsed the whole PDF.
- Width and Height fields did not line up.
- Turning a page in the editor needed a separate Apply; a compass showed the
  wrong direction.
- Tools whose engine does not exist on a platform are hidden rather than offered
  and failed.
- The diagnostic logger no longer runs in a shipped build.

### Known limits

- **Reading scans and HEIC input are macOS-only.** Both rely on what the
  operating system provides. Papercut hides them elsewhere rather than offering
  something that cannot work.
- **Converting to EPUB or MOBI needs [Calibre](https://calibre-ebook.com/)**, and
  some document formats use [LibreOffice](https://www.libreoffice.org/). The
  other twenty-one tools need nothing installed.
- **All nine languages are AI-assisted and have not been reviewed by a
  professional translator.** Warnings about losing files are translated in every
  language or left in English in every language, never half-done, and a test
  enforces it. Corrections are the most useful contribution this project can
  receive: please [open an issue](https://github.com/shyhunter/PaperOtter/issues).
- **The app is not code-signed.** macOS may say it is damaged and Windows may
  show a SmartScreen warning. Both are the absence of a paid certificate, not a
  problem with the download.
