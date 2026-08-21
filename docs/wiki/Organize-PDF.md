# <img src="img/icons/layout-grid.svg" width="28"/> Organize PDF

**What it's for:** reorder, delete, or duplicate pages within a PDF using a visual thumbnail grid.

## How to organize a PDF

1. **Pick** — open a PDF file.
2. **Organize** — drag pages to reorder them, use the up/down arrows, duplicate a page, or delete pages you don't want — a **Reverse** button flips the whole order, and **Reset** undoes all changes back to the original order.
3. **Save** — write the reorganized PDF to disk.

## How it works

Every page in the output is a fresh copy from the source PDF, placed in exactly the sequence shown in the grid — including duplicates. If you duplicate page 3, the same source page is copied into the output twice; each copy is independent from that point on. Pages you delete simply aren't included when building the output — nothing is destructively removed from your original file until you save.

## Why the page count in the output might not match the original

This is expected, not a bug — the whole point of Organize is to change the page count when you duplicate or delete pages. If the count looks wrong, check the grid for any pages still marked as duplicated or removed before saving.

---

See also: [Split PDF](Split-PDF) · [Merge PDFs](Merge-PDFs) · [Rotate PDF](Rotate-PDF)
