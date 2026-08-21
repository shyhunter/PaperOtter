# <img src="img/icons/arrow-left-right.svg" width="28"/> Convert Image

**What it's for:** convert an image between JPG, PNG, and WebP.

## How to convert an image

1. **Pick** — open an image file.
2. **Configure** — choose the output format (and quality, for JPG/WebP).
3. **Save** — write the converted image to disk.

## How the formats differ

- **JPG** — lossy, no transparency support, generally smallest for photos.
- **PNG** — lossless, supports transparency, generally larger.
- **WebP** — supports both lossy and lossless modes plus transparency, usually smaller than an equivalent-quality JPG or PNG.

Quality (default 80) applies to JPG and WebP output; PNG is always lossless regardless of the slider.

## Why converting to JPG changes a transparent image's background

JPG has no transparency channel at all, so converting a PNG or WebP with transparent areas to JPG fills those areas with solid white before encoding. If you need to keep transparency, convert to PNG or WebP instead.

---

See also: [Compress Image](Compress-Image) · [PDF to JPG](PDF-to-JPG)
