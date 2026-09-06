/**
 * [ROT] A page number must be upright and in the corner the reader sees.
 *
 * Reported from a real build: rotate a PDF, then number it, and the numbers come
 * out lying on their side, on an edge that is not the one that was asked for, so
 * there is no way to orient yourself in the document.
 *
 * /Rotate turns the page clockwise at display time while pdf-lib draws in the
 * unturned space underneath. Nothing undid that, so both the position and the
 * angle were computed in a frame the reader never sees.
 */
import { describe, it, expect } from 'vitest';
import { PDFDocument, degrees } from 'pdf-lib';
import { addPageNumbers, visualToRaw, normalisedRotation } from '@/lib/pdfPageNumbers';

const W = 600, H = 800; // portrait: a quarter turn makes the reader see 800 x 600

describe('visualToRaw', () => {
  /* Anchored on the corners, because that is what "bottom left" has to mean.
     Under a clockwise display turn the raw bottom-left corner is the one the
     reader sees at top-left, and these are the inverses of that. */
  it('[ROT-01] is the identity on an unrotated page', () => {
    expect(visualToRaw(10, 20, W, H, 0)).toEqual({ x: 10, y: 20 });
  });

  it('[ROT-02] maps the reader\'s bottom-left to the raw bottom-right at 90 degrees', () => {
    // reader sees an 800x600 page; its bottom-left is the raw page's bottom-right
    expect(visualToRaw(0, 0, W, H, 90)).toEqual({ x: W, y: 0 });
  });

  it('[ROT-03] maps the reader\'s bottom-left to the raw top-right at 180 degrees', () => {
    expect(visualToRaw(0, 0, W, H, 180)).toEqual({ x: W, y: H });
  });

  it('[ROT-04] maps the reader\'s bottom-left to the raw top-left at 270 degrees', () => {
    expect(visualToRaw(0, 0, W, H, 270)).toEqual({ x: 0, y: H });
  });

  it('[ROT-05] every mapped point stays inside the page', () => {
    for (const rot of [0, 90, 180, 270] as const) {
      const vw = rot === 90 || rot === 270 ? H : W;
      const vh = rot === 90 || rot === 270 ? W : H;
      for (const [vx, vy] of [[0, 0], [vw, 0], [0, vh], [vw, vh], [vw / 2, vh / 2]]) {
        const { x, y } = visualToRaw(vx, vy, W, H, rot);
        expect(x, `rot ${rot} x`).toBeGreaterThanOrEqual(0);
        expect(x, `rot ${rot} x`).toBeLessThanOrEqual(W);
        expect(y, `rot ${rot} y`).toBeGreaterThanOrEqual(0);
        expect(y, `rot ${rot} y`).toBeLessThanOrEqual(H);
      }
    }
  });
});

describe('normalisedRotation', () => {
  it.each([[0, 0], [90, 90], [180, 180], [270, 270], [360, 0], [-90, 270], [450, 90]])(
    '[ROT-06] snaps /Rotate %i to %i',
    async (given, expected) => {
      const doc = await PDFDocument.create();
      const page = doc.addPage([W, H]);
      page.setRotation(degrees(given));
      expect(normalisedRotation(page)).toBe(expected);
    },
  );
});

describe('addPageNumbers on rotated pages', () => {
  async function numbered(angle: number) {
    const doc = await PDFDocument.create();
    const page = doc.addPage([W, H]);
    page.setRotation(degrees(angle));
    const bytes = await addPageNumbers(new Uint8Array(await doc.save()), {
      position: 'bottom-center', format: 'numeric', fontSize: 12, startNumber: 1, margin: 30,
    });
    return PDFDocument.load(bytes);
  }

  it.each([0, 90, 180, 270])('[ROT-07] numbers a page rotated %i degrees without throwing', async (angle) => {
    const out = await numbered(angle);
    expect(out.getPageCount()).toBe(1);
    // the page keeps the rotation it came with: numbering must not silently
    // reorient the document
    expect(out.getPages()[0].getRotation().angle).toBe(angle);
  });
});
