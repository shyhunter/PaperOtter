# <img src="img/icons/image-down.svg" width="28"/> Compress Image

**What it's for:** reduce an image's file size, optionally resize it, and convert its format: all in one step.

## How to compress an image

1. **Pick**: open an image file.
2. **Configure**: set output format, quality, and (optionally) resize dimensions.
3. **Compare**: check the before/after side by side.
4. **Save**: write the compressed image to disk.

## How quality and resizing work

- **Quality**: a 0-100 slider (defaults to 80) controlling JPEG/WebP compression. Higher keeps more detail at a larger file size. This has no effect on PNG output, which is lossless.
- **Resize**: set a target width/height. By default, the image is scaled to *fit* those dimensions while keeping its aspect ratio; an "exact" mode is also available that stretches the image to match the dimensions precisely, ignoring aspect ratio. Resizing uses a high-quality Lanczos filter, which preserves detail noticeably better than simple nearest-neighbor scaling.

## Why a transparent PNG might get a white background

Converting a transparent image to **JPEG** fills any transparent areas with solid white first: JPEG doesn't support transparency at all, so this is unavoidable when choosing that output format. If you need to keep transparency, export as **PNG** or **WebP** instead.

---

See also: [Convert Image](Convert-Image) · [Rotate Image](Rotate-Image)
