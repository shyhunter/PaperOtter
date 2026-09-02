# <img src="img/icons/arrow-left-right.svg" width="28"/> Convert Document

**What it's for:** convert between PDF, DOCX, DOC, ODT, RTF, TXT, EPUB, MOBI, AZW3, and (fully offline, no external tools needed) Markdown, HTML, JSON, and structure-preserving DOCX.

## How to convert a document

1. **Pick**: open a document file.
2. **Configure**: choose the output format and any format-specific options; for long documents, optionally split the output **by chapter** into a `.zip`, one file per chapter.
3. **Compare**: review the result.
4. **Save**: write the converted file (or the chapter `.zip`) to disk.

## How Papercut picks which tool actually does the conversion

This is the part that surprises people, so it's worth explaining directly: **Papercut never asks you to install anything.** Instead, it silently uses the best tool it can already find on your machine, trying engines in this priority order for each output format:

1. **Built-in**: an in-process engine with no external dependency at all. Handles Markdown, HTML, and JSON output (from PDF or DOCX input), and structure-preserving DOCX output. This is what powers the "structure-preserving conversion" feature: headings, paragraphs, and lists are detected and preserved, and long documents can be split by chapter using the PDF's own bookmarks/outline when available, falling back to detected headings.
2. **Browser export** (HTML source only): renders HTML through the OS's own web engine, the same way a browser would, to produce a PDF.
3. **textutil** (macOS built-in): always available on a Mac, handles plain conversions like TXT/RTF/DOC/DOCX/ODT.
4. **Microsoft Word**: used if installed, for its native format support.
5. **LibreOffice**: used if installed, broad format coverage.
6. **Calibre**: used if installed, specifically for ebook formats (EPUB, MOBI, AZW3).

For each conversion, Papercut checks both that an engine can *produce* your target format **and** that it can actually *read* your source format: an engine that can write DOCX but can't parse EPUB won't be offered for an EPUB→DOCX conversion, even though it can write DOCX from other inputs.

## Why a conversion option might not be available

If a format pairing you expect isn't offered, it's because no engine currently available on your machine can do that specific input→output combination:

- **Markdown, HTML, JSON, and structure-preserving DOCX** always work, from PDF or DOCX input: no installation needed.
- **EPUB, MOBI, AZW3** need [Calibre](Required-Dependencies): these formats only have one engine that handles them.
- **DOC, ODT, RTF, and PDF-output conversions** need [LibreOffice](Required-Dependencies) (or Microsoft Word, or, on Mac, textutil for simpler cases): without any of those, those specific pairings aren't offered.

Papercut only ever shows you output formats it can actually produce right now: there's no "install X to unlock this" dead end, the option just won't appear until a capable tool is present.

---

See also: [Required Dependencies](Required-Dependencies) · [Troubleshooting](Troubleshooting)
