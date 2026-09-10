# <img src="img/icons/file-down.svg" width="28"/> Compress PDF

**What it's for:** shrink a PDF's file size for emailing, uploading, or archiving, without needing to re-export it from the original source app.

## How to compress a PDF

1. **Pick**: open a PDF, or drop it anywhere on the window.
2. **Configure**: drag the compression slider (or pick a Quality Preset), optionally turn on **Resize pages** and/or **Remove personal info**.
3. **Compare**: see the before/after file size and a page preview before committing.
4. **Save**: write the compressed file to disk.

## How the Quality Preset slider works

The slider has four zones, each setting a target resolution and image quality:

| Zone | Preset | Resolution | Best for |
|---|---|---|---|
| Web | `screen` | 72 dpi | Smallest file, screen-only viewing |
| Screen | `ebook` | 150 dpi | Balanced: good for reading on devices |
| Print | `printer` | 300 dpi | High quality, suitable for printing |
| Archive | `prepress` | Lossless | No recompression: structural cleanup only |

Papercut re-encodes every embedded image at the target resolution/quality for the chosen preset. Papercut also shows an estimated output size per zone before you commit, based on how many images the PDF actually contains: a text-only PDF won't shrink much no matter which preset you pick, since there's nothing image-heavy to recompress.

If you turn on **Target file size** instead of picking a preset directly, Papercut tries presets from your starting point down to `screen` (the smallest), stopping as soon as one hits your target, or keeping the smallest result it found if none do.

## What "Resize pages" and "Remove personal info" do

- **Resize pages**: scales page content to a standard size (A4/A3/Letter), or a custom size, centered and scaled to fit. This runs *before* compression, so it's not undone by the compression step.
- **Remove personal info**: clears the PDF's title, author, subject, keywords, creator, and producer metadata fields, for GDPR-style data minimization. It does **not** touch DRM, encryption, or copyright metadata.

## Why your file may not get smaller

- **It's already small relative to its content.** If the result would be *larger* than the input — which happens on text-only or already-optimized PDFs, where there is nothing to take away — Papercut keeps the original instead. A document with no images is returned byte-for-byte unchanged. You'll see a note that the file was already optimal rather than a bigger "compressed" file.
- **Few or no images.** Compression here works by recompressing embedded images. A PDF that's mostly text has little to shrink: try a lower preset, but don't expect the same reduction you'd see on a scan-heavy or photo-heavy PDF.

---

See also: [Repair PDF](Repair-PDF) · [Required Dependencies](Required-Dependencies)
