# <img src="img/icons/file-plus-2.svg" width="28"/> JPG to PDF

**What it's for:** turn one or more images into a single PDF document — one image per page.

## How to convert images to a PDF

1. **Pick Images** — select one or more images to include, in the order you want them to appear.
2. **Configure** — set the page size, orientation, and margin.
3. **Save** — write the resulting PDF to disk.

## How page layout works

- **Page size** — A4, Letter, or **Auto-fit**, where the page is sized to exactly match each image's own dimensions plus the margin (so no image is ever letterboxed or cropped).
- **Orientation** — Portrait, Landscape, or **Auto**, which matches each image's own aspect ratio automatically.
- **Margin** — a small, medium, or large border kept empty around the image on each page.

Each image is scaled to fit within the page's drawable area (page size minus margins on all sides) while keeping its original aspect ratio — images are never stretched or distorted to fill the page.

## Why an image might look smaller than expected on the page

If you picked a fixed page size (A4/Letter) with an image whose aspect ratio doesn't match, the image is scaled down to fit fully within the margins without cropping — this can leave empty space above/below or left/right of the image. Switch to **Auto-fit** page size if you want the page itself to match each image's shape exactly, with no empty space.

---

See also: [PDF to JPG](PDF-to-JPG) · [Merge PDFs](Merge-PDFs)
