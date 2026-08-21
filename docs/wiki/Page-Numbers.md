# <img src="img/icons/hash.svg" width="28"/> Page Numbers

**What it's for:** stamp page numbers onto a PDF's pages.

## How to add page numbers

1. **Pick** — open a PDF file.
2. **Configure** — set position, format, starting number, and which pages to number.
3. **Save** — write the numbered PDF to disk.

## How numbering options work

- **Position** — any of the six combinations of top/bottom and left/center/right.
- **Format** — `numeric` (1, 2, 3…), `roman` (i, ii, iii… — lowercase), or `alphabetic` (a, b, c… continuing to aa, ab… past z).
- **Starting number** — the number printed on the *first numbered page*, not necessarily page 1 of the document (useful if this PDF continues numbering from another document).
- **Page range** — leave unset to number every page, or restrict numbering to specific pages.

Numbers are drawn in Helvetica, sized and positioned relative to each page's own dimensions, so placement stays consistent even across pages of different sizes within the same document.

## Why a number might be missing on a page

If a specific page shows no number, check whether it was excluded by your page range setting — pages outside the selected range are left untouched entirely, not just skipped visually.

---

See also: [Watermark](Watermark) · [Organize PDF](Organize-PDF)
