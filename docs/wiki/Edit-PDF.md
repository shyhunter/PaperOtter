# <img src="img/icons/file-edit.svg" width="28"/> Edit PDF

**What it's for:** directly edit text and images on a PDF's pages: the full editor, with access to most other PDF tools from its sidebar.

## How to edit a PDF

1. **Pick**: open a PDF file.
2. **Edit**: modify text and images directly on the page canvas. Most other PDF tools (Compress, Rotate, Page Numbers, Watermark, Crop, Sign, Redact, PDF/A, Repair, Protect, Unlock) are available from the editor's sidebar too, so you can chain operations without leaving the editor.
3. **Save**: write the edited PDF to disk.

## How text and image edits work

- **Deleted or replaced text**: the original text is covered with a white rectangle, and any new/modified text is drawn on top with the closest matching standard font (Helvetica, Times, or Courier, with bold/italic variants detected from the original).
- **Image edits**: modified or newly added images are embedded and drawn onto the page at the position you place them.

## Why edited text isn't truly "gone" from the file

This is the single most important thing to know about this tool: **covering old text with a white rectangle is not the same as removing it.** The original text object can still exist underneath, in the PDF's internal structure: a white box just visually hides it, the same way covering a word with correction fluid on paper doesn't erase what's printed underneath. For text edits made for cosmetic or content reasons, this is fine. But if the reason you're changing text is to permanently get rid of sensitive information, this is the wrong tool: use [Redact PDF](Redact-PDF) instead, which actually flattens the page so nothing is recoverable.

## Why a font might not look exactly right after editing

Papercut maps whatever font the original text used to the closest of three standard PDF fonts (Helvetica, Times Roman, or Courier) with the right bold/italic variant. If the original used a distinctive custom font, the edited text will look close but not pixel-identical to the surrounding text.

---

See also: [Redact PDF](Redact-PDF) · [Sign PDF](Sign-PDF) · [Watermark](Watermark)
