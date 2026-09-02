# <img src="img/icons/rotate-cw.svg" width="28"/> Rotate PDF

**What it's for:** fix pages that are sideways or upside down: from a whole document to a single page.

## How to rotate a PDF

1. **Pick**: open a PDF file.
2. **Select & Rotate**: pick which page(s) to rotate, then rotate them.
3. **Save**: write the rotated PDF to disk.

## How rotation works

Each page click cycles through 0° → 90° → 180° → 270° → back to 0°. Only pages you've actually changed get touched: a page left at 0° is written back untouched. Rotation is a page-level property (the same mechanism PDF viewers use to display pages correctly), not a re-render of the page content, so text stays fully selectable and the file doesn't lose quality.

## Why a page might not look rotated after saving

If a page still looks the same orientation after you rotate it, double check you actually selected that page before clicking rotate: rotation only applies to pages explicitly included in the request. If a whole document needs the same rotation, look for a "rotate all" control rather than clicking through pages one at a time.

---

See also: [Organize PDF](Organize-PDF) · [Rotate Image](Rotate-Image)
