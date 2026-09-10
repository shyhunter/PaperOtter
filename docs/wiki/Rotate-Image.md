# <img src="img/icons/rotate-cw.svg" width="28"/> Rotate Image

**What it's for:** rotate an image 90°, 180°, or 270°.

## How to rotate an image

1. **Pick**: open an image file.
2. **Rotate**: choose the rotation angle.
3. **Save**: write the rotated image to disk.

## How it works

The image is decoded, rotated by the exact angle you chose, and re-encoded: you can also change the output format and quality at the same time, since rotation goes through the same image encoder as [Compress Image](Compress-Image).

## Why the output file size might change after just rotating

Since rotating re-encodes the image, the output size depends on the quality/format settings applied during that re-encode, not just the rotation itself. If you notice a size difference, check the quality and format PaperOtter used for the save, same as you would for [Compress Image](Compress-Image).

---

See also: [Compress Image](Compress-Image) · [Rotate PDF](Rotate-PDF)
