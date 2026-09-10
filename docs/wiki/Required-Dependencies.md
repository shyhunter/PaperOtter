# Required Dependencies

Most of Papercut works with nothing extra to install. Two tools are bundled or
optional, listed below.

## What needs nothing at all

**Twenty-one of the twenty-two tools.** Only Convert Document ever reaches for
another program, and even then only for some formats.

Converting to **Markdown, HTML, JSON, plain text or DOCX runs entirely inside
Papercut** and needs neither of the programs below. This page previously said
DOCX required LibreOffice, which sent people to install 300 MB they did not
need.

## LibreOffice (optional, for DOC, ODT, RTF and PDF output)

Not bundled. Needed for converting **to or from DOC, ODT and RTF**, and for
producing a PDF from a document on Windows and Linux. Install from
[libreoffice.org](https://www.libreoffice.org/download/), and make sure
`soffice` is on your `PATH`. Without it, Papercut names the missing program
rather than failing quietly, and the formats that do not need it stay
available.

## Calibre (optional, used for EPUB/MOBI conversion)

Not bundled. Needed only for ebook formats (EPUB, MOBI). Install from
[calibre-ebook.com](https://calibre-ebook.com/download), and make sure
`ebook-convert` is on your `PATH`. Same fallback behavior as LibreOffice above.

## Two features depend on the operating system

Not dependencies you can install: they are what the platform does or does not
provide, so Papercut hides them where they cannot work rather than offering
something that will fail.

| Feature | macOS | Windows | Linux |
|---|---|---|---|
| **Make Searchable** (reading text from scans) | Yes | Not yet | Not yet |
| **HEIC / HEIF photos** as input | Yes | Only with the HEIF extension installed | Only where the distribution ships libheif |

HEIC is limited by patent licensing rather than effort: Papercut never ships its
own decoder and uses the operating system's where one is licensed.

---

See also: [Troubleshooting](Troubleshooting) · [FAQ](FAQ)
