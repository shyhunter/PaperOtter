# Roadmap

What Papercut is working towards, and what it has deliberately decided not to do.

This page is about direction, not dates. Papercut is built by one person; an item
being here means it is agreed and scoped, not that it is scheduled.

***

## Before 1.0

Six things stand between Papercut and its first stable release. None of them are
new features — they are checks that no automated test can make.

| # | Item | What it is |
|---|------|------------|
| 1 | Windows Ghostscript | Five tools depend on Ghostscript, including Compress PDF. The installed Windows app has never been run against it |
| 2 | Read the German UI | Nine languages ship; German is the one with the most recent untested strings |
| 3 | One agreed version number | `package.json`, `tauri.conf.json` and `Cargo.toml` currently disagree with the last tag |
| 4 | README states the dependencies | "No installation required" is true of 21 of 22 tools — Convert Document needs Calibre, and the README should say so plainly |
| 5 | Cancel a batch mid-run | Fixed by inspection; no run has yet confirmed the child process actually dies |
| 6 | A visual pass over the UI | Automated tests render no pixels, so nothing has checked that the layout still looks right |

***

## After 1.0

### Named presets for Watermark and Page Numbers

Compress PDF already lets you save a named setting and pick it up again later.
The same idea belongs in the two tools where the settings repeat the most.

A watermark is the clearest case: text, opacity, rotation, position, size and
colour, set once and then wanted on every document for years. Page numbers are
the same story — position, format, size and starting number are house style, not
a per-document decision.

Presets will work the same way whether you use the standalone tool or the
matching panel inside **Edit PDF**. A preset saved in one appears in the other.

**Deliberately not everywhere.** Protect PDF will never get presets — that would
mean saving a password. Tools like Split, Merge, Rotate and Organise are
per-document decisions, where a saved preset would save a single click. Convert
Image and PDF to JPG are plausible later, once presets have proved themselves in
the first two.

### Prepare for AI

Turn a document into something an AI model can actually work with, without it
ever leaving your machine.

- **Clean Markdown, structure kept.** Word heading styles become real headings,
  emphasis survives, and Word's invisible formatting noise is stripped. Where
  chapter markers are inconsistent, Papercut flags them for you rather than
  guessing.
- **Split by heading**, into one file per chapter or section, plus the whole
  document as a single file.
- **Export presets** for the shape you need: the whole document, chapter by
  chapter, or both.

The point is preparation, not analysis. **Papercut prepares; your own AI
reasons.** You already have a model you trust — Papercut's job is to hand it the
thing it cannot make for itself: a clean, structured, local bundle.

**What this will not do, and why.** Chapter summaries, automatic story bibles and
continuity-contradiction reports have all been suggested, and all of them need a
language model. That means either bundling one — breaking the promise that
Papercut needs no other software installed — or sending your document to a cloud
service, which breaks the more important promise on every screen of this app:
your files never leave your device. For anyone working on a confidential
manuscript, that promise is the whole reason to use Papercut. So those steps stay
out.

***

## Not planned

- **Cloud processing, accounts, or sync.** Papercut runs on your machine. That is
  the product, not a limitation of it.
- **Telemetry or usage analytics.** Nothing is collected, so nothing is sent.
- **Saved passwords**, in presets or anywhere else.

***

Have a use case that is not here? Open an issue — the tools that exist today came
from people describing what they were stuck doing by hand.
