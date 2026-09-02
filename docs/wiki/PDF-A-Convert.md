# <img src="img/icons/archive.svg" width="28"/> PDF/A Convert

**What it's for:** convert a PDF to PDF/A: an ISO-standardized, self-contained format built for long-term archival, where a document should look identical decades from now regardless of what software opens it.

## How to convert to PDF/A

1. **Select PDF**: open a PDF file.
2. **Configure**: choose a PDF/A conformance level.
3. **Save**: write the PDF/A file to disk.

## How it works

Conversion runs through [Ghostscript](https://ghostscript.com/) with PDF/A-specific flags, targeting one of three conformance levels (1, 2, or 3). Papercut validates the level before running, so only these three are accepted. Ghostscript also converts the color space to RGB and embeds an sRGB output intent, since PDF/A requires documents to be self-describing about color, not dependent on the viewing device's assumptions.

The core idea behind PDF/A: everything the document needs to render correctly (fonts, color profiles, metadata) is embedded *inside* the file itself, rather than relying on anything external.

## Why you might want this over a regular PDF

Regular PDFs can rely on external resources (like system fonts) that may not be present on some future computer, or use PDF features that get deprecated over time. PDF/A intentionally restricts what a PDF can depend on. This matters for legal records, compliance archives, or anything where "this needs to open correctly in 20 years" is a real requirement, not for everyday documents you're just sharing or printing now.

## Why conversion might fail

Ghostscript reports failures with its actual exit output, since PDF/A conversion is stricter than a normal Ghostscript pass: some PDFs use features that can't be automatically resolved into a valid PDF/A structure. If it fails, try [Repair PDF](Repair-PDF) on the source first.

---

See also: [Repair PDF](Repair-PDF) · [Compress PDF](Compress-PDF)
