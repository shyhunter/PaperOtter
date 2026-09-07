import { describe, it, expect } from 'vitest';
import { PDFDocument, degrees } from 'pdf-lib';
import { cropPdf, cropPdfSinglePage, marginsInPageSpace, type CropMargins } from '@/lib/pdfCrop';

// ─── Turned pages ────────────────────────────────────────────────────────────
//
// [CROPROT] A crop box is measured in the page's own coordinates, but whoever
// sets it is looking through the page's /Rotate and means the edges they can
// see. Cropping "the top" of a quarter-turned page took a strip off a side.
// The same defect page numbers, watermarks, signatures and the editor's stamps
// all had; this is the last place in the app that had it.

describe('cropping a turned page', () => {
  const A4: [number, number] = [595, 842];

  async function pageWithRotation(rotation: number): Promise<Uint8Array> {
    const doc = await PDFDocument.create();
    const page = doc.addPage(A4);
    if (rotation) page.setRotation(degrees(rotation));
    return new Uint8Array(await doc.save());
  }

  async function cropBoxAfter(rotation: number, margins: CropMargins) {
    const out = await cropPdf(await pageWithRotation(rotation), margins);
    return (await PDFDocument.load(out)).getPages()[0].getCropBox();
  }

  const NONE = { top: 0, bottom: 0, left: 0, right: 0 };

  it('[CROPROT-01] an unrotated page crops exactly as it always did', async () => {
    // The safety property: nearly every page is unrotated, and this must be
    // the identity for them.
    const box = await cropBoxAfter(0, { ...NONE, top: 100 });
    expect(box.x).toBe(0);
    expect(box.y).toBe(0);
    expect(box.width).toBe(595);
    expect(box.height).toBe(742);
  });

  it('[CROPROT-02] a quarter turn takes the strip off the edge the reader means', async () => {
    // On a page turned 90 degrees the reader's top edge is the page's own left,
    // so a top margin has to become a left one.
    const box = await cropBoxAfter(90, { ...NONE, top: 100 });
    expect(box.x, 'taken off the left of the unturned box').toBe(100);
    expect(box.width).toBe(495);
    expect(box.height, 'and nothing off the height').toBe(842);
  });

  it('[CROPROT-03] every edge lands on the right one, at every rotation', async () => {
    // One distinct value per edge, so a pair swapped the wrong way cannot pass.
    const margins: CropMargins = { top: 10, right: 20, bottom: 30, left: 40 };
    const expected: Record<number, { x: number; y: number }> = {
      0:   { x: 40, y: 30 },
      90:  { x: 10, y: 40 },
      180: { x: 20, y: 10 },
      270: { x: 30, y: 20 },
    };
    for (const rotation of [0, 90, 180, 270]) {
      const box = await cropBoxAfter(rotation, margins);
      expect(box.x, `rotation ${rotation} x`).toBe(expected[rotation].x);
      expect(box.y, `rotation ${rotation} y`).toBe(expected[rotation].y);
    }
  });

  it('[CROPROT-04] four quarter turns of the margins return to where they started', async () => {
    // The mapping is one rotation of a four-item ring; if it were not, applying
    // it four times would drift.
    let m: CropMargins = { top: 10, right: 20, bottom: 30, left: 40 };
    for (let i = 0; i < 4; i++) m = marginsInPageSpace(m, 90);
    expect(m).toEqual({ top: 10, right: 20, bottom: 30, left: 40 });
  });

  it('[CROPROT-05] the preview crops the same box as the document', async () => {
    // copyPages carries the /Rotate, so both sides have to make the same turn
    // or the preview shows a crop the saved file will not have.
    const margins: CropMargins = { top: 10, right: 20, bottom: 30, left: 40 };
    const src = await pageWithRotation(90);

    const full = (await PDFDocument.load(await cropPdf(src, margins))).getPages()[0].getCropBox();
    const preview = (await PDFDocument.load(await cropPdfSinglePage(src, margins, 0))).getPages()[0].getCropBox();

    expect(preview).toEqual(full);
  });
});
