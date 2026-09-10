# <img src="img/icons/stamp.svg" width="28"/> Watermark

**What it's for:** overlay a text watermark (like "CONFIDENTIAL" or "DRAFT") across every page of a PDF.

## How to add a watermark

1. **Pick**: open a PDF file.
2. **Configure**: set the watermark text and its appearance.
3. **Save**: write the watermarked PDF to disk.

## How watermark appearance works

- **Text**: any text you enter; defaults to "CONFIDENTIAL".
- **Font size**: defaults to 48pt.
- **Opacity**: 0 (invisible) to 1 (fully solid); defaults to 0.3, a translucent look that doesn't obscure content underneath.
- **Rotation**: defaults to -45° (the classic diagonal watermark angle), but can be set to any angle.
- **Color**: gray, red, or blue presets.

The watermark text is centered on the page and applied identically to every page: there's no per-page customization. PaperOtter renders a live single-page preview as you adjust these settings so you can see the effect before committing to all pages.

## Why the watermark might look cut off or oddly placed

Very long watermark text at a large font size can extend past the page edges, especially at steep rotation angles: the text is centered based on its rendered width, so extreme combinations of long text + large size + rotation can push parts of it off-page. Shorten the text or reduce the font size if that happens.

---

See also: [Page Numbers](Page-Numbers) · [Sign PDF](Sign-PDF)
