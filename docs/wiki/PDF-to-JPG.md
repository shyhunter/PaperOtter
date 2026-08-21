# <img src="img/icons/file-image.svg" width="28"/> PDF to JPG

**What it's for:** export PDF pages as standalone image files — useful for sharing a page as a picture, or dropping it into something that doesn't accept PDFs.

## How to export PDF pages as images

1. **Pick** — open a PDF file.
2. **Configure** — choose which pages to export, the output format (JPG or PNG), the resolution, and (for JPG) the quality.
3. **Save** — each selected page is saved as its own image file.

## How resolution and quality work

Each page is rendered at one of three scales, matching common screen/print resolutions:

| Scale | Resolution | Use |
|---|---|---|
| 1x | 72 dpi | Smallest files, screen-only |
| 2x | 150 dpi (default) | Good balance for most uses |
| 3x | 300 dpi | Print-quality, largest files |

For JPG output, a quality slider (0-100, default 85) controls JPEG compression — higher keeps more detail at a larger file size. PNG is lossless, so the quality slider doesn't apply to it, but PNG files are typically larger than a JPG at the same resolution.

## Why the output might look different from the PDF

Each page is rendered exactly as it appears in the PDF viewer — vector text and graphics become pixels at your chosen resolution. If text looks slightly soft at 1x/72 dpi, that's expected: bump the scale to 2x or 3x for sharper output, especially for pages you plan to zoom into or print.

---

See also: [JPG to PDF](JPG-to-PDF) · [Convert Image](Convert-Image)
