// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { rasteriseSignature, signatureBlockSize, SIGNATURE_RASTER_SCALE } from '@/lib/signatureRaster';

/**
 * A script signature cannot be drawn as PDF text: pdf-lib embeds only the 14
 * standard fonts, none of which is a script face. It is rasterised instead, so
 * the block it lands in has to match the image's own proportions or the
 * signature arrives stretched.
 */
describe('signatureBlockSize', () => {
  it('[SGR-01] keeps the rasterised aspect ratio', () => {
    const { width, height } = signatureBlockSize(600, 200, 24);

    expect(width / height).toBeCloseTo(3, 6);
  });

  it('[SGR-02] sizes the block from the chosen point size, not the pixel size', () => {
    // The canvas is rendered oversampled for a crisp stamp; the block must be
    // the size the user asked for, not the size the sampling produced.
    const { height } = signatureBlockSize(600 * SIGNATURE_RASTER_SCALE, 200 * SIGNATURE_RASTER_SCALE, 24);

    expect(height).toBeCloseTo(24, 6);
  });

  it('[SGR-03] a taller image gets a taller block, never a squashed one', () => {
    const wide = signatureBlockSize(800, 100, 30);
    const tall = signatureBlockSize(100, 800, 30);

    expect(wide.width).toBeGreaterThan(wide.height);
    expect(tall.height).toBeGreaterThan(tall.width);
  });

  it('[SGR-04] a degenerate image cannot produce a zero-sized block', () => {
    // An empty canvas would otherwise yield a block with no area, which is
    // impossible to find on the page and impossible to grab.
    const { width, height } = signatureBlockSize(0, 0, 24);

    expect(width).toBeGreaterThan(0);
    expect(height).toBeGreaterThan(0);
  });
});

describe('rasteriseSignature', () => {
  it('[SGR-05] gives nothing back for empty text rather than a blank stamp', async () => {
    expect(await rasteriseSignature('   ', 'cursive', 24, '#000000')).toBeNull();
  });

  it('[SGR-06] degrades rather than throwing where the browser cannot draw', async () => {
    // jsdom has no FontFaceSet and no canvas backend. Both absences have to
    // resolve to "no stamp" rather than reject -- an unhandled rejection here
    // would take out the click that placed the signature.
    await expect(rasteriseSignature('Ada', 'cursive', 24, '#000000')).resolves.toBeNull();
  });
});
