/**
 * [RASTER] The pixel budget a redacted page is rasterised within.
 *
 * Redaction replaces a page with an image of itself, so the raster is the
 * output — its size decides how long the window freezes, how big the saved file
 * is, and how much memory the tool needs. Left uncapped it followed the page:
 * one poster-sized page rendered to 68 megapixels and 28 MB of PNG, and a
 * ten-page document of them would have saved as a quarter-gigabyte PDF.
 *
 * The point of the chosen budget is that ordinary documents are untouched, so
 * these cases are written in real page sizes rather than in numbers.
 */
import { describe, it, expect } from 'vitest';
import { rasterScale, MAX_RASTER_MEGAPIXELS } from '@/lib/pdfRedact';

/** Page sizes in PDF points (1/72 inch), as pdf.js reports them. */
const A4 = [595, 842] as const;
const A3 = [842, 1191] as const;
const A2 = [1191, 1684] as const;
const A1 = [1684, 2384] as const;
/** The real page from `photo_heavy.pdf` that started this. */
const POSTER = [6000, 2848] as const;

const megapixels = (w: number, h: number, scale: number) => (w * scale * h * scale) / 1e6;

describe('[RASTER-01] ordinary pages are rasterised exactly as asked', () => {
  for (const [name, size] of [['A4', A4], ['A3', A3], ['A2', A2]] as const) {
    it(`${name} still renders at the full 2x`, () => {
      expect(rasterScale(size[0], size[1])).toBe(2.0);
      expect(megapixels(size[0], size[1], 2.0)).toBeLessThanOrEqual(MAX_RASTER_MEGAPIXELS);
    });
  }
});

describe('[RASTER-02] only oversized pages are scaled down, and only to the budget', () => {
  for (const [name, size] of [['A1', A1], ['the photo_heavy poster', POSTER]] as const) {
    it(`${name} is brought within the budget`, () => {
      const scale = rasterScale(size[0], size[1]);
      expect(scale, 'it was reduced').toBeLessThan(2.0);
      // Within the budget, and not needlessly far under it — a cap that
      // overshot would throw away quality it did not have to.
      expect(megapixels(size[0], size[1], scale)).toBeCloseTo(MAX_RASTER_MEGAPIXELS, 1);
    });
  }
});

describe('[RASTER-03] the budget never makes a page worse than asked', () => {
  it('does not scale a small page up', () => {
    // A postcard has pixels to spare. Spending them would cost time and bytes
    // for detail the caller never asked for.
    expect(rasterScale(288, 432)).toBe(2.0);
    expect(rasterScale(288, 432, 1.0)).toBe(1.0);
  });

  it('respects a lower requested scale', () => {
    expect(rasterScale(...POSTER, 1.0)).toBeLessThan(1.0);
    expect(rasterScale(...A4, 0.5)).toBe(0.5);
  });

  it('is orientation-blind, because area is what costs', () => {
    expect(rasterScale(A1[0], A1[1])).toBeCloseTo(rasterScale(A1[1], A1[0]), 10);
  });
});
