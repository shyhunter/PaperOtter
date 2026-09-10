# Roadmap

What PaperOtter is working towards, and what it has deliberately decided not to do.

This page is about direction, not dates. PaperOtter is built by one person; an item
being here means it is agreed and scoped, not that it is scheduled.

***

## Before 1.0

Four things stand between PaperOtter and its first stable release. None of them
are new features: they are checks and pages that no automated test can produce.

| # | Item | What it is |
|---|------|------------|
| 2 | Read the German UI | Nine languages ship. German has the most recently written strings, including several warnings about losing work that nobody has yet read in German |
| 3 | A visual pass over the UI | Automated tests render no pixels, so nothing has checked that the layout still looks right |
| 4 | A proper home page | PaperOtter is a desktop app, and a desktop app needs somewhere to download it from that is not a source-code repository |

Recently closed: the version number is settled at **1.0.0**; the README's
dependency claims were checked line by line and were already accurate; and
cancelling a batch is now proven to stop the work by a test that asks the
operating system, rather than by reading the code and believing it.

***

## After 1.0

### Named presets for Watermark and Page Numbers

Compress PDF already lets you save a named setting and pick it up again later.
The same idea belongs in the two tools where the settings repeat the most.

A watermark is the clearest case: text, opacity, rotation, position, size and
colour, set once and then wanted on every document for years. Page numbers are
the same story: position, format, size and starting number are house style, not
a per-document decision.

Presets will work the same way whether you use the standalone tool or the
matching panel inside **Edit PDF**. A preset saved in one appears in the other.

**Deliberately not everywhere.** Tools like Split, Merge, Rotate and Organise are
per-document decisions, where a saved preset would save a single click. Convert
Image and PDF to JPG are plausible later, once presets have proved themselves in
the first two.

### Prepare for AI

Turn a document into something an AI model can actually work with, without it
ever leaving your machine.

- **Clean Markdown, structure kept.** Word heading styles become real headings,
  emphasis survives, and Word's invisible formatting noise is stripped. Where
  chapter markers are inconsistent, PaperOtter flags them for you rather than
  guessing.
- **Split by heading**, into one file per chapter or section, plus the whole
  document as a single file.
- **Export presets** for the shape you need: the whole document, chapter by
  chapter, or both.

The point is preparation, not analysis. **PaperOtter prepares; your own AI
reasons.** You already have a model you trust. PaperOtter's job is to hand it the
thing it cannot make for itself: a clean, structured, local bundle.

**What this will not do, and why.** Chapter summaries, automatic story bibles and
continuity-contradiction reports have all been suggested, and all of them need a
language model. That means either bundling one: breaking the promise that
PaperOtter needs no other software installed, or sending your document to a cloud
service, which breaks the more important promise on every screen of this app:
your files never leave your device. For anyone working on a confidential
manuscript, that promise is the whole reason to use PaperOtter. So those steps stay
out.

***

## Not planned

- **Cloud processing, accounts, or sync.** PaperOtter runs on your machine. That is
  the product, not a limitation of it.
- **Telemetry or usage analytics.** Nothing is collected, so nothing is sent.
- **Saved passwords**, in presets or anywhere else.

***

Have a use case that is not here? Open an issue: the tools that exist today came
from people describing what they were stuck doing by hand.
