# <img src="img/icons/crop.svg" width="28"/> Crop PDF

**What it's for:** trim margins or an unwanted border/region from a PDF's pages.

## How to crop a PDF

1. **Pick**: open a PDF file.
2. **Crop**: select the crop area (as margins from each edge).
3. **Save**: write the cropped PDF to disk.

## How cropping actually works

Cropping sets each page's **crop box**: the region a PDF viewer treats as the visible page. It works like CSS `overflow: hidden`: content outside the crop box is hidden, not deleted. The underlying page content (and its original dimensions) technically still exists in the file; the crop box just tells viewers/printers what to show. This means cropping is safe to undo by adjusting margins again, but it's *not* a way to permanently remove sensitive content that happens to sit outside the visible area: for that, use [Redact PDF](Redact-PDF) instead.

Margins are specified in points (1 pt = 1/72 inch), measured in from each edge (top, bottom, left, right) independently: you don't need a symmetric crop.

## Why cropped content might reappear elsewhere

If you're relying on a crop to hide something you don't want visible, remember it's a display setting, not a deletion. Anyone with a tool that reads the full page content (rather than respecting the crop box) can still see what was cropped out. Use Redact PDF instead when the goal is actually removing content, not just trimming the visible page.

---

See also: [Redact PDF](Redact-PDF) · [Compress PDF](Compress-PDF)
