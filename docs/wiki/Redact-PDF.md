# <img src="img/icons/eye-off.svg" width="28"/> Redact PDF

**What it's for:** permanently remove sensitive content from a PDF — the content is actually gone, not just hidden.

## How to redact a PDF

1. **Select PDF** — open a PDF file.
2. **Redact** — draw black boxes over the areas you want permanently removed.
3. **Save** — write the redacted PDF to disk.

## How real redaction works (and why it's different from Crop or covering text)

This is the one tool in Papercut where "security over convenience" is the explicit design goal. Any page that has at least one redaction on it is **rendered to an image** and rebuilt as a picture — the black boxes are drawn directly onto that image before it's embedded as the new page. This means:

- Text on a redacted page is **no longer selectable, searchable, or copyable** — because it's a picture now, not text. There is nothing left underneath the black box to extract.
- Pages with **no redactions** are left completely untouched — copied over as-is, keeping their original selectable text.

This is a deliberate tradeoff. A redaction tool that just draws a black rectangle *over* live text (the way [Watermark](Watermark) draws over content, or the way [Crop PDF](Crop-PDF)'s crop box just hides content) doesn't actually delete anything — the "hidden" text is often still selectable, copyable, or extractable by anyone who knows to try. Papercut's Redact avoids that failure mode entirely by flattening the page.

## Why redacted pages look slightly different from the rest of the document

Since redacted pages become images, very fine text or thin lines can look marginally softer than the vector-rendered text on unredacted pages, especially if you zoom in. That's the cost of true redaction — it's rendered at high quality specifically to keep this difference minimal, but a rendered image will never be pixel-identical to vector text.

## Why content might still be visible after redacting

Double-check the black box actually fully covers the sensitive area on **that exact page** before saving — a box that's slightly misaligned, or a redaction placed on the wrong page, won't remove content it doesn't cover. Once saved, though, whatever *is* under a redaction box is genuinely gone from that output file.

---

See also: [Crop PDF](Crop-PDF) · [Protect PDF](Protect-PDF)
