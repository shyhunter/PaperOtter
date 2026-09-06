// signatureBackground.ts: what sits behind a signature on the page.
//
// A typed or drawn signature is rasterised onto a transparent canvas, so it has
// never had a background. A photographed or scanned one has whatever the paper
// was, baked in and opaque, so dropping it on a document paints a pale rectangle
// over the page. On a white page that is invisible; on anything else it is a
// sticker.
//
// Two answers, because they fail in different places. Keying the paper out suits
// any page, including textured and gradient ones, but cannot tell a grey shadow
// from grey ink. Matching a colour is exact, but only while the page really is
// that one flat colour behind the signature.
//
// The pixel work is kept pure and the canvas work thin on purpose: the maths is
// what can be wrong, and it is the part a test can reach without a DOM.

/** Perceived brightness, 0 (black) to 255 (white). Rec. 601 luma. */
export function luminance(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/**
 * How white a pixel has to be before it counts as paper, 0 to 255.
 *
 * 210 keeps a soft pencil stroke and drops cream and newsprint. Exposed so the
 * interface can offer it, because no single number survives every scanner.
 */
export const DEFAULT_KEY_THRESHOLD = 210;

/**
 * Turns paper into transparency, in place.
 *
 * Alpha is graded by how dark the pixel is rather than switched at the
 * threshold. A hard cut leaves a stair-stepped edge on every stroke, which is
 * exactly the tell that gives away a cut-out signature; grading keeps the
 * anti-aliased rim the pen actually had.
 *
 * Ink colour is left alone. Recolouring here would fight the colour control the
 * signature already has, and a scan of blue ink should stay blue.
 *
 * Pixels that are already transparent are skipped, so running this over a typed
 * signature is a no-op rather than a way to lose one.
 */
export function keyOutBackground(
  pixels: Uint8ClampedArray,
  threshold: number = DEFAULT_KEY_THRESHOLD,
): void {
  const cut = Math.max(1, Math.min(255, threshold));
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] === 0) continue;
    const l = luminance(pixels[i], pixels[i + 1], pixels[i + 2]);
    if (l >= cut) {
      pixels[i + 3] = 0;
      continue;
    }
    // Fully opaque at black, fading to nothing as the pixel approaches the cut.
    const graded = Math.round(255 * (1 - l / cut));
    pixels[i + 3] = Math.min(pixels[i + 3], graded);
  }
}

/** "#rrggbb" for a channel triple. */
export function toHex(r: number, g: number, b: number): string {
  const h = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

/**
 * The average colour of a small square of pixels, as "#rrggbb".
 *
 * Averaged rather than read from the single pixel under the cursor: page
 * rasters carry JPEG noise and anti-aliased text, and one unlucky pixel picks
 * the edge of a letter instead of the paper. Fully transparent pixels are
 * ignored so sampling near a page edge does not drag the average toward black.
 *
 * Returns null when the patch has nothing opaque in it, which the caller should
 * treat as "no sample taken" rather than as a colour.
 */
export function sampleAverageColour(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
  radius = 2,
): string | null {
  let r = 0, g = 0, b = 0, n = 0;
  const x0 = Math.max(0, x - radius), x1 = Math.min(width - 1, x + radius);
  const y0 = Math.max(0, y - radius), y1 = Math.min(height - 1, y + radius);

  for (let py = y0; py <= y1; py++) {
    for (let px = x0; px <= x1; px++) {
      const i = (py * width + px) * 4;
      if (pixels[i + 3] === 0) continue;
      r += pixels[i]; g += pixels[i + 1]; b += pixels[i + 2]; n++;
    }
  }
  if (n === 0) return null;
  return toHex(r / n, g / n, b / n);
}

/** Loads a data URL into a canvas and hands back its 2D context and pixels. */
async function rasterise(
  dataUrl: string,
): Promise<{ canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; image: ImageData } | null> {
  if (typeof document === 'undefined') return null;
  const blob = await (await fetch(dataUrl)).blob();
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close?.();
  return { canvas, ctx, image: ctx.getImageData(0, 0, canvas.width, canvas.height) };
}

/**
 * A copy of `dataUrl` with its paper keyed out, or the original if a canvas is
 * not available.
 *
 * Always PNG on the way out, whatever went in: JPEG has no alpha, so returning
 * one would silently discard the transparency this exists to add.
 */
export async function removeSignatureBackground(
  dataUrl: string,
  threshold: number = DEFAULT_KEY_THRESHOLD,
): Promise<string> {
  const r = await rasterise(dataUrl);
  if (!r) return dataUrl;
  keyOutBackground(r.image.data, threshold);
  r.ctx.putImageData(r.image, 0, 0);
  return r.canvas.toDataURL('image/png');
}

/**
 * A copy of `dataUrl` sitting on a solid `colour`.
 *
 * Composited under the signature rather than over it, so transparency that has
 * already been keyed out fills with the page colour instead of being painted
 * back into a rectangle.
 */
export async function applySignatureBackground(dataUrl: string, colour: string): Promise<string> {
  const r = await rasterise(dataUrl);
  if (!r) return dataUrl;
  const { canvas, ctx } = r;
  ctx.globalCompositeOperation = 'destination-over';
  ctx.fillStyle = colour;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.globalCompositeOperation = 'source-over';
  return canvas.toDataURL('image/png');
}
