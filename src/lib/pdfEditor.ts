/**
 * PDF editor save engine — applies text and image edits back to a PDF.
 *
 * Uses pdf-lib to modify the PDF document:
 * - Deleted content: covered with white rectangles
 * - Modified/new text: drawn with drawText()
 * - Modified/new images: embedded and drawn with drawImage()
 *
 * Image coordinates use PDF bottom-left origin throughout.
 *
 * ## Two coordinate spaces, and which is which
 *
 * The editor renders each page through pdf.js `getViewport`, which applies the
 * page's /Rotate, and every overlay positions itself against those dimensions.
 * So anything the user placed by pointing at the page -- an image block, a
 * signature stamp, a text box they clicked into being -- is in the frame the
 * reader sees. pdf-lib draws in the unturned space underneath, so those have to
 * be mapped back on the way out. `placeVisual` below does that.
 *
 * Text that came out of the document is the other case. `getTextContent` hands
 * back transforms in the page's own space, so extracted blocks are already raw
 * and are drawn as they are. On a page with a /Rotate their overlay boxes are
 * drawn in the wrong place on screen, because the layer positions them against
 * the rotated dimensions -- a separate defect, in a different layer, and one
 * that cannot be fixed here: extraction reads the font size out of
 * `transform[3]`, which on a rotated page holds part of the rotation rather
 * than a size, so those blocks are wrong before anything is drawn at all.
 * Editing existing text on a turned page needs its own work.
 *
 * On an unrotated page the two spaces are identical and `placeVisual` is the
 * identity, which is why this changes nothing for almost every document.
 */

import {
  PDFDocument,
  StandardFonts,
  degrees,
  rgb,
  type PDFPage,
  type PDFFont,
  type PDFImage,
} from 'pdf-lib';
import { normalisedRotation, visualToRaw } from '@/lib/pdfPageNumbers';
import type { PageEditState, ImageBlock } from '@/types/editor';

/**
 * A point the user pointed at, in the page's own coordinates, with the angle to
 * draw at so it faces the reader the right way up.
 *
 * The viewer turns the page by its /Rotate, so drawing at that same angle has
 * the two cancel out. Identical to what the page numberer and the signature
 * placer do, and deliberately the same helpers, so the three cannot drift.
 */
function placeVisual(page: PDFPage, vx: number, vy: number): { x: number; y: number; rotation: 0 | 90 | 180 | 270 } {
  const { width: rawW, height: rawH } = page.getSize();
  const rotation = normalisedRotation(page);
  return { ...visualToRaw(vx, vy, rawW, rawH, rotation), rotation };
}

/** Base font -> variant mapping for pdf-lib StandardFonts */
const FONT_VARIANTS: Record<string, Record<string, keyof typeof StandardFonts>> = {
  Helvetica: {
    regular: 'Helvetica',
    bold: 'HelveticaBold',
    italic: 'HelveticaOblique',
    bolditalic: 'HelveticaBoldOblique',
  },
  TimesRoman: {
    regular: 'TimesRoman',
    bold: 'TimesRomanBold',
    italic: 'TimesRomanItalic',
    bolditalic: 'TimesRomanBoldItalic',
  },
  Courier: {
    regular: 'Courier',
    bold: 'CourierBold',
    italic: 'CourierOblique',
    bolditalic: 'CourierBoldOblique',
  },
};

/**
 * Map a PDF font name to the closest pdf-lib StandardFonts base family.
 * Falls back to Helvetica for unknown fonts.
 */
export function mapFontName(pdfFontName: string): string {
  const lower = pdfFontName.toLowerCase();
  if (lower.includes('courier')) return 'Courier';
  if (lower.includes('times')) return 'TimesRoman';
  return 'Helvetica';
}

/**
 * Resolve font name + bold/italic flags to a StandardFonts key.
 */
export function resolveFontKey(
  fontName: string,
  bold: boolean,
  italic: boolean,
): keyof typeof StandardFonts {
  const base = mapFontName(fontName);
  const variants = FONT_VARIANTS[base] ?? FONT_VARIANTS['Helvetica'];
  const variant = bold && italic ? 'bolditalic' : bold ? 'bold' : italic ? 'italic' : 'regular';
  return variants[variant];
}

/**
 * Convert a hex color string (#RRGGBB) to 0-1 range RGB values for pdf-lib.
 */
export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16) / 255,
    g: parseInt(h.slice(2, 4), 16) / 255,
    b: parseInt(h.slice(4, 6), 16) / 255,
  };
}

/** Parse a hex color string (#RRGGBB) to pdf-lib rgb() */
function parseColor(hex: string) {
  const { r, g, b } = hexToRgb(hex);
  return rgb(r, g, b);
}

/**
 * Apply all text and image edits to the PDF and return modified bytes.
 *
 * Order: text edits first, then image edits (images can overlap text).
 */
export async function applyAllEdits(
  pdfBytes: Uint8Array,
  pageEdits: PageEditState[],
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const pages = doc.getPages();

  // Cache embedded fonts
  const fontCache = new Map<string, PDFFont>();
  // and embedded images: the same signature on every page must not be embedded
  // once per page.
  const embedCache: EmbedCache = new Map();

  for (const pageEdit of pageEdits) {
    const pageIndex = pageEdit.pageIndex;
    if (pageIndex < 0 || pageIndex >= pages.length) continue;
    const page = pages[pageIndex];

    // ── Text edits ──────────────────────────────────────────────────────

    // Cover deleted text blocks with white rectangles using stored bounds
    for (const deleted of pageEdit.deletedTextBlocks ?? []) {
      page.drawRectangle({
        x: deleted.x - 1,
        y: deleted.y - 1,
        width: deleted.width + 2,
        height: deleted.height + 2,
        color: rgb(1, 1, 1),
        borderWidth: 0,
      });
    }

    // Draw modified/new text blocks (only those actually changed)
    for (const block of pageEdit.textBlocks) {
      if (!block.isNew && !block.isModified) continue;

      // Cover original area with white rect for modified blocks
      if (!block.isNew) {
        page.drawRectangle({
          x: block.x - 1,
          y: block.y - 1,
          width: block.width + 2,
          height: block.height + 2,
          color: rgb(1, 1, 1),
          borderWidth: 0,
        });
      }

      // Get or embed font (with bold/italic variant)
      const fontKey = resolveFontKey(block.fontName, block.bold ?? false, block.italic ?? false);
      let font = fontCache.get(fontKey);
      if (!font) {
        font = await doc.embedFont(StandardFonts[fontKey]);
        fontCache.set(fontKey, font);
      }

      // Calculate x position based on alignment
      const textColor = parseColor(block.color);
      let drawX = block.x;
      if (block.alignment === 'center') {
        const textWidth = font.widthOfTextAtSize(block.text, block.fontSize);
        drawX = block.x + (block.width - textWidth) / 2;
      } else if (block.alignment === 'right') {
        const textWidth = font.widthOfTextAtSize(block.text, block.fontSize);
        drawX = block.x + block.width - textWidth;
      }

      // A box the user clicked into being is in the frame they were looking at,
      // so it is mapped back like an image block. A block that came out of the
      // document already carries the page's own coordinates and is left alone:
      // see the note at the top of this file for why those two differ, and why
      // this distinction costs nothing on an unrotated page.
      const place = block.isNew
        ? placeVisual(page, drawX, block.y)
        : { x: drawX, y: block.y, rotation: 0 as const };

      page.drawText(block.text, {
        x: place.x,
        y: place.y,
        size: block.fontSize,
        font,
        color: textColor,
        rotate: degrees(place.rotation),
      });

      // Draw underline if enabled
      if (block.underline) {
        const textWidth = font.widthOfTextAtSize(block.text, block.fontSize);
        const underlineY = block.y - block.fontSize * 0.15;
        // Both ends mapped, not one end plus a width: on a turned page the
        // line runs along a different axis, and the two mapped points carry
        // that between them.
        const from = block.isNew
          ? placeVisual(page, drawX, underlineY)
          : { x: drawX, y: underlineY };
        const to = block.isNew
          ? placeVisual(page, drawX + textWidth, underlineY)
          : { x: drawX + textWidth, y: underlineY };
        page.drawLine({
          start: { x: from.x, y: from.y },
          end: { x: to.x, y: to.y },
          thickness: Math.max(0.5, block.fontSize * 0.05),
          color: textColor,
        });
      }
    }

    // ── Image edits ─────────────────────────────────────────────────────

    // Cover deleted images with white rectangles using stored bounds.
    // Image blocks are only ever created in the editor -- nothing extracts one
    // from the document -- so their bounds are in the frame the reader sees,
    // and the cover has to be mapped like the stamp it is covering. An
    // unmapped cover on a turned page whites out a different part of the page
    // and leaves the thing it was hiding on show.
    for (const deleted of pageEdit.deletedImageBlocks ?? []) {
      const cover = placeVisual(page, deleted.x - 1, deleted.y - 1);
      page.drawRectangle({
        x: cover.x,
        y: cover.y,
        width: deleted.width + 2,
        height: deleted.height + 2,
        color: rgb(1, 1, 1),
        borderWidth: 0,
        rotate: degrees(cover.rotation),
      });
    }

    // Draw modified and new images
    await applyImageEditsToPage(doc, page, pageEdit, embedCache);
  }

  return doc.save({ useObjectStreams: false });
}

/**
 * Apply image edits to a single page.
 */
/** Images already embedded in this save, keyed on the exact buffer given. */
type EmbedCache = Map<Uint8Array, PDFImage>;

async function applyImageEditsToPage(
  doc: PDFDocument,
  page: PDFPage,
  pageEdit: PageEditState,
  embedCache: EmbedCache,
): Promise<void> {
  for (const block of pageEdit.imageBlocks) {
    if (!block.isNew && !isImageModified(block)) continue;

    // Cover original position with white rectangle for modified (non-new) images
    if (!block.isNew) {
      const cover = placeVisual(page, block.x - 1, block.y - 1);
      page.drawRectangle({
        x: cover.x,
        y: cover.y,
        width: block.width + 2,
        height: block.height + 2,
        color: rgb(1, 1, 1),
        borderWidth: 0,
        rotate: degrees(cover.rotation),
      });
    }

    // Apply rotation/flip to image bytes if needed
    let finalBytes = block.imageBytes;
    if (block.rotation !== 0 || block.flipH || block.flipV) {
      finalBytes = await transformImageBytes(
        block.imageBytes,
        block.rotation,
        block.flipH,
        block.flipV,
      );
    }

    // Determine image type and embed, once per distinct buffer.
    //
    // Signing every page hands the same bytes to every page's block, and
    // pdf-lib embeds whatever it is given: without this, a signature on a
    // 438-page contract would put 438 copies of the same PNG in the file.
    // Keyed on the buffer itself, so two images that merely look alike are
    // still embedded separately and nothing is shared by accident.
    let embeddedImg = embedCache.get(finalBytes);
    if (!embeddedImg) {
      embeddedImg = isPngBytes(finalBytes)
        ? await doc.embedPng(finalBytes)
        : await doc.embedJpg(finalBytes);
      embedCache.set(finalBytes, embeddedImg);
    }

    // Draw where the user put it, as they saw the page. Before this, a stamp
    // dropped on a turned page was written at the same numbers in the unturned
    // space underneath, so it came out somewhere else entirely and lying on its
    // side. Reported for signatures; every image block had it.
    const { x, y, rotation } = placeVisual(page, block.x, block.y);
    page.drawImage(embeddedImg, {
      x,
      y,
      width: block.width,
      height: block.height,
      rotate: degrees(rotation),
    });
  }
}

/**
 * Check if an image has been modified from its original state.
 */
function isImageModified(block: ImageBlock): boolean {
  return (
    block.rotation !== 0 ||
    block.flipH ||
    block.flipV ||
    block.isNew
  );
}


/**
 * Check if bytes represent a PNG image (by magic bytes).
 */
function isPngBytes(bytes: Uint8Array): boolean {
  if (bytes.length < 8) return false;
  return (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  );
}

/**
 * Apply rotation and flip transforms to image bytes using an offscreen canvas.
 * Returns PNG bytes of the transformed image.
 */
async function transformImageBytes(
  imageBytes: Uint8Array,
  rotation: number,
  flipH: boolean,
  flipV: boolean,
): Promise<Uint8Array> {
  // Create an image from the bytes
  const blob = new Blob([imageBytes], { type: isPngBytes(imageBytes) ? 'image/png' : 'image/jpeg' });
  const bitmap = await createImageBitmap(blob);

  const radians = (rotation * Math.PI) / 180;
  const cos = Math.abs(Math.cos(radians));
  const sin = Math.abs(Math.sin(radians));

  // Calculate output dimensions after rotation
  const outWidth = Math.round(bitmap.width * cos + bitmap.height * sin);
  const outHeight = Math.round(bitmap.width * sin + bitmap.height * cos);

  const canvas = document.createElement('canvas');
  canvas.width = outWidth;
  canvas.height = outHeight;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    return imageBytes;
  }

  ctx.translate(outWidth / 2, outHeight / 2);
  ctx.rotate(radians);

  if (flipH) ctx.scale(-1, 1);
  if (flipV) ctx.scale(1, -1);

  ctx.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
  bitmap.close();

  const outputBlob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/png'),
  );
  if (!outputBlob) return imageBytes;

  const buffer = await outputBlob.arrayBuffer();
  return new Uint8Array(buffer);
}

/**
 * Apply only text edits to a PDF (convenience for text-only editing).
 * Uses the overlay+redraw pattern: white rectangle over original text, drawText for new.
 */
export async function applyTextEdits(
  pdfBytes: Uint8Array,
  pageEdits: PageEditState[],
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const pages = doc.getPages();
  const fontCache = new Map<string, PDFFont>();

  for (const pageEdit of pageEdits) {
    const pageIndex = pageEdit.pageIndex;
    if (pageIndex < 0 || pageIndex >= pages.length) continue;
    const page = pages[pageIndex];

    // Cover deleted text blocks
    for (const deleted of pageEdit.deletedTextBlocks ?? []) {
      page.drawRectangle({
        x: deleted.x - 1,
        y: deleted.y - 1,
        width: deleted.width + 2,
        height: deleted.height + 2,
        color: rgb(1, 1, 1),
        borderWidth: 0,
      });
    }

    // Draw text blocks (modified + new)
    for (const block of pageEdit.textBlocks) {
      if (!block.isNew && !block.isModified) continue;

      // Cover original area with white rect for modified blocks
      if (!block.isNew) {
        page.drawRectangle({
          x: block.x - 1,
          y: block.y - 1,
          width: block.width + 2,
          height: block.height + 2,
          color: rgb(1, 1, 1),
          borderWidth: 0,
        });
      }

      // Get or embed font (with bold/italic variant)
      const fontKey = resolveFontKey(block.fontName, block.bold ?? false, block.italic ?? false);
      let font = fontCache.get(fontKey);
      if (!font) {
        font = await doc.embedFont(StandardFonts[fontKey]);
        fontCache.set(fontKey, font);
      }

      // Calculate x position based on alignment
      let drawX = block.x;
      if (block.alignment === 'center') {
        const textWidth = font.widthOfTextAtSize(block.text, block.fontSize);
        drawX = block.x + (block.width - textWidth) / 2;
      } else if (block.alignment === 'right') {
        const textWidth = font.widthOfTextAtSize(block.text, block.fontSize);
        drawX = block.x + block.width - textWidth;
      }

      const textColor = parseColor(block.color);
      // A box the user clicked into being is in the frame they were looking at,
      // so it is mapped back like an image block. A block that came out of the
      // document already carries the page's own coordinates and is left alone:
      // see the note at the top of this file for why those two differ, and why
      // this distinction costs nothing on an unrotated page.
      const place = block.isNew
        ? placeVisual(page, drawX, block.y)
        : { x: drawX, y: block.y, rotation: 0 as const };

      page.drawText(block.text, {
        x: place.x,
        y: place.y,
        size: block.fontSize,
        font,
        color: textColor,
        rotate: degrees(place.rotation),
      });

      // Draw underline if enabled
      if (block.underline) {
        const textWidth = font.widthOfTextAtSize(block.text, block.fontSize);
        const underlineY = block.y - block.fontSize * 0.15;
        // Both ends mapped, not one end plus a width: on a turned page the
        // line runs along a different axis, and the two mapped points carry
        // that between them.
        const from = block.isNew
          ? placeVisual(page, drawX, underlineY)
          : { x: drawX, y: underlineY };
        const to = block.isNew
          ? placeVisual(page, drawX + textWidth, underlineY)
          : { x: drawX + textWidth, y: underlineY };
        page.drawLine({
          start: { x: from.x, y: from.y },
          end: { x: to.x, y: to.y },
          thickness: Math.max(0.5, block.fontSize * 0.05),
          color: textColor,
        });
      }
    }
  }

  return doc.save({ useObjectStreams: false });
}

/**
 * Apply only image edits (convenience function for standalone use).
 */
export async function applyImageEdits(
  pdfBytes: Uint8Array,
  pageEdits: PageEditState[],
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const pages = doc.getPages();
  const embedCache: EmbedCache = new Map();

  for (const pageEdit of pageEdits) {
    const pageIndex = pageEdit.pageIndex;
    if (pageIndex < 0 || pageIndex >= pages.length) continue;
    const page = pages[pageIndex];
    await applyImageEditsToPage(doc, page, pageEdit, embedCache);
  }

  return doc.save({ useObjectStreams: false });
}
