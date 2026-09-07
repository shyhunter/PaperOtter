/**
 * Rasterises a typed signature to a PNG.
 *
 * A script signature cannot be drawn as PDF text. pdf-lib embeds only the 14
 * standard fonts -- Helvetica, Times, Courier and two symbol faces -- and none
 * of them is a script face, so the Sign panel used to quietly substitute italic
 * Helvetica and show a script preview over it. Drawing the signature to a
 * canvas in the real bundled font and embedding the result as an image gives
 * the user the signature they picked, and needs no font embedding (and so no
 * fontkit dependency) at all.
 */
import { normaliseHex } from '@/lib/colorPresets';

/** Oversampling factor, so the stamp stays crisp when the page is zoomed or printed. */
export const SIGNATURE_RASTER_SCALE = 4;

/** Smallest block a rasterised signature may occupy, in PDF points. */
const MIN_BLOCK_SIZE = 8;

export interface SignatureRaster {
  bytes: Uint8Array;
  /** Block size in PDF points, matching the image's proportions. */
  width: number;
  height: number;
}

/**
 * The PDF-point size a rasterised signature should occupy.
 *
 * Height comes from the point size the user chose, width follows the image's
 * own aspect ratio -- sizing both from the canvas would make the signature grow
 * with the oversampling factor rather than with the setting.
 */
export function signatureBlockSize(
  pixelWidth: number,
  pixelHeight: number,
  fontSizePt: number,
): { width: number; height: number } {
  if (pixelWidth <= 0 || pixelHeight <= 0) {
    return { width: MIN_BLOCK_SIZE, height: MIN_BLOCK_SIZE };
  }

  const height = Math.max(MIN_BLOCK_SIZE, fontSizePt);
  return { width: Math.max(MIN_BLOCK_SIZE, height * (pixelWidth / pixelHeight)), height };
}

/**
 * Draws `text` in `fontCss` and returns it as a cropped PNG, or null if the
 * canvas is unavailable or the text left no marks.
 *
 * Cropped to the drawn pixels so the block hugs the signature: an uncropped
 * canvas would surround it with transparent margin that is still draggable and
 * still covers the page underneath.
 */
export async function rasteriseSignature(
  text: string,
  fontCss: string,
  fontSizePt: number,
  color: string,
): Promise<SignatureRaster | null> {
  const drawn = await drawSignature(text, fontCss, fontSizePt, color);
  if (!drawn) return null;

  const dataUrl = drawn.canvas.toDataURL('image/png');
  const base64 = dataUrl.split(',')[1];
  if (!base64) return null;

  return {
    bytes: Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)),
    ...signatureBlockSize(drawn.canvas.width, drawn.canvas.height, fontSizePt),
  };
}

/**
 * The same drawing, as a PNG data URL.
 *
 * Saved signatures are stored as data URLs and the editor places raw bytes, so
 * both forms are needed and only one of them may do the drawing.
 */
export async function rasteriseSignatureDataUrl(
  text: string,
  fontCss: string,
  fontSizePt: number,
  color: string,
): Promise<string | null> {
  const drawn = await drawSignature(text, fontCss, fontSizePt, color);
  return drawn ? drawn.canvas.toDataURL('image/png') : null;
}

/**
 * The CSS stack for a font value the editor's old localStorage list stored.
 *
 * Those entries kept the recipe rather than the image, so hydrating one means
 * turning its font value back into something canvas can draw with.
 */
export const LEGACY_SIGNATURE_FONT_CSS: Record<string, string> = {
  cursive: "'Dancing Script', 'Brush Script MT', cursive",
  serif: "'Georgia', 'Times New Roman', serif",
  sans: "'Helvetica Neue', Arial, sans-serif",
};

/** Draws the text and hands back the canvas, or null if there is nothing on it. */
async function drawSignature(
  text: string,
  fontCss: string,
  fontSizePt: number,
  color: string,
): Promise<{ canvas: HTMLCanvasElement } | null> {
  if (!text.trim()) return null;
  if (typeof document === 'undefined') return null;

  const pixelSize = fontSizePt * SIGNATURE_RASTER_SCALE;
  const font = `${pixelSize}px ${fontCss}`;

  // Canvas silently falls back to a default face for a font it has not loaded,
  // which would put a plain signature on the page while the panel showed a
  // script one -- the exact bug this rasteriser exists to fix. Await the load,
  // but never let its absence cost the user their signature.
  try {
    await document.fonts?.load(font);
  } catch {
    // A missing or failing FontFaceSet just means the fallback face is used.
  }

  const measure = document.createElement('canvas').getContext('2d');
  if (!measure) return null;

  measure.font = font;
  const metrics = measure.measureText(text);

  // Ascent and descent rather than the point size: script faces have long
  // ascenders and descenders that a font-size-tall canvas would clip.
  const ascent = metrics.actualBoundingBoxAscent || pixelSize;
  const descent = metrics.actualBoundingBoxDescent || pixelSize * 0.3;
  const pad = Math.ceil(pixelSize * 0.15);
  const width = Math.ceil(metrics.width) + pad * 2;
  const height = Math.ceil(ascent + descent) + pad * 2;
  if (width <= 0 || height <= 0) return null;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.font = font;
  ctx.fillStyle = normaliseHex(color);
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(text, pad, pad + ascent);

  return { canvas };
}
