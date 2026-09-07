/**
 * [SIG] What sits behind a signature on the page.
 *
 * Requested after signing a document whose page is not white: an uploaded
 * signature brings its paper with it, so it lands as a pale rectangle over the
 * page. The ask was a background colour, and a way to sample the page's own
 * colour and match it.
 *
 * The pixel maths is tested here rather than through a canvas: this is the part
 * that can be wrong, and it is the part a node test can reach.
 */
import { describe, it, expect } from 'vitest';
import {
  luminance,
  keyOutBackground,
  DEFAULT_KEY_THRESHOLD,
} from '@/lib/signatureBackground';

/** A w x h RGBA buffer filled with one colour. */
function fill(w: number, h: number, r: number, g: number, b: number, a = 255): Uint8ClampedArray {
  const px = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < px.length; i += 4) {
    px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = a;
  }
  return px;
}

describe('luminance', () => {
  it('[SIG-01] ranks black, mid grey and white in order', () => {
    expect(luminance(0, 0, 0)).toBe(0);
    expect(luminance(255, 255, 255)).toBeCloseTo(255, 5);
    expect(luminance(128, 128, 128)).toBeCloseTo(128, 5);
  });

  it('[SIG-02] weights green above red above blue, as the eye does', () => {
    expect(luminance(0, 255, 0)).toBeGreaterThan(luminance(255, 0, 0));
    expect(luminance(255, 0, 0)).toBeGreaterThan(luminance(0, 0, 255));
  });
});

describe('keyOutBackground', () => {
  it('[SIG-03] makes white paper fully transparent', () => {
    const px = fill(2, 2, 255, 255, 255);
    keyOutBackground(px);
    for (let i = 3; i < px.length; i += 4) expect(px[i]).toBe(0);
  });

  it('[SIG-04] leaves black ink fully opaque', () => {
    const px = fill(2, 2, 0, 0, 0);
    keyOutBackground(px);
    for (let i = 3; i < px.length; i += 4) expect(px[i]).toBe(255);
  });

  it('[SIG-05] drops cream paper, which a white-only test would miss', () => {
    // the reported case: the page is not white, and neither is the scan
    const px = fill(1, 1, 245, 240, 225);
    keyOutBackground(px);
    expect(px[3]).toBe(0);
  });

  it('[SIG-06] grades the edge rather than cutting it, so strokes keep their rim', () => {
    const mid = fill(1, 1, 150, 150, 150);
    keyOutBackground(mid);
    expect(mid[3]).toBeGreaterThan(0);
    expect(mid[3]).toBeLessThan(255);
  });

  it('[SIG-07] keeps ink colour, so blue ink stays blue', () => {
    const px = fill(1, 1, 20, 40, 200);
    keyOutBackground(px);
    expect([px[0], px[1], px[2]]).toEqual([20, 40, 200]);
    expect(px[3]).toBeGreaterThan(0);
  });

  it('[SIG-08] is a no-op on an already transparent signature', () => {
    const px = fill(2, 2, 0, 0, 0, 0);
    const before = Uint8ClampedArray.from(px);
    keyOutBackground(px);
    expect(px).toEqual(before);
  });

  it('[SIG-09] a lower threshold keeps more of the page', () => {
    const grey = () => fill(1, 1, 200, 200, 200);
    const loose = grey(); keyOutBackground(loose, DEFAULT_KEY_THRESHOLD);
    const strict = grey(); keyOutBackground(strict, 120);
    // at 120 this pixel is above the cut and disappears; at 210 it survives
    expect(loose[3]).toBeGreaterThan(0);
    expect(strict[3]).toBe(0);
  });

  it('[SIG-10] never raises an existing alpha', () => {
    const px = fill(1, 1, 0, 0, 0, 40);
    keyOutBackground(px);
    expect(px[3]).toBeLessThanOrEqual(40);
  });
});
