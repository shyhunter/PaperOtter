import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { resizePagesInDocument } from '@/lib/pdfProcessor';

/**
 * [RESIZE] Page resize, now that two tools do it.
 *
 * The maths lived inside processPdf, which needs a file path, so the editor's
 * compress panel had no way to reach it and simply offered no resize at all --
 * the gap found when comparing each editor panel against the tool it stands in
 * for. Extracting it rather than writing a second scale-to-fit is the point:
 * two implementations are how a preview and an output come to disagree about
 * what a page looks like.
 */

const A4_W = 595.28, A4_H = 841.89;

async function docWith(sizes: [number, number][]): Promise<PDFDocument> {
  const doc = await PDFDocument.create();
  for (const [w, h] of sizes) doc.addPage([w, h]);
  return doc;
}

/** Round-trips through a save so the assertions read the persisted geometry. */
async function reload(doc: PDFDocument): Promise<PDFDocument> {
  return PDFDocument.load(await doc.save());
}

const A4 = {
  pagePreset: 'A4' as const,
  customWidthMm: null,
  customHeightMm: null,
};

describe('resizePagesInDocument', () => {
  it('[RESIZE-01] gives the named pages the preset size', async () => {
    const doc = await docWith([[300, 300], [300, 300]]);
    resizePagesInDocument(doc, { ...A4, selectedPageIndices: [0, 1] });

    for (const page of (await reload(doc)).getPages()) {
      expect(page.getWidth()).toBeCloseTo(A4_W, 1);
      expect(page.getHeight()).toBeCloseTo(A4_H, 1);
    }
  });

  it('[RESIZE-02] leaves the pages it was not given alone', async () => {
    const doc = await docWith([[300, 300], [300, 300], [300, 300]]);
    resizePagesInDocument(doc, { ...A4, selectedPageIndices: [1] });

    const pages = (await reload(doc)).getPages();
    expect(pages[0].getWidth()).toBe(300);
    expect(pages[1].getWidth()).toBeCloseTo(A4_W, 1);
    expect(pages[2].getWidth()).toBe(300);
  });

  it('[RESIZE-03] an empty selection changes nothing', async () => {
    const doc = await docWith([[300, 300]]);
    resizePagesInDocument(doc, { ...A4, selectedPageIndices: [] });
    expect((await reload(doc)).getPages()[0].getWidth()).toBe(300);
  });

  it('[RESIZE-04] an out-of-range index is skipped rather than throwing', async () => {
    // The editor derives indices from a page selection that can outlive a
    // document being replaced by another tool.
    const doc = await docWith([[300, 300]]);
    expect(() => resizePagesInDocument(doc, { ...A4, selectedPageIndices: [-1, 0, 99] })).not.toThrow();
    expect((await reload(doc)).getPages()[0].getWidth()).toBeCloseTo(A4_W, 1);
  });

  it('[RESIZE-05] a custom size is taken in millimetres', async () => {
    // 100mm is 283.46pt. Getting the unit wrong here would silently produce a
    // page a third of the intended size.
    const doc = await docWith([[300, 300]]);
    resizePagesInDocument(doc, {
      pagePreset: 'custom', customWidthMm: 100, customHeightMm: 200, selectedPageIndices: [0],
    });
    const page = (await reload(doc)).getPages()[0];
    expect(page.getWidth()).toBeCloseTo(283.46, 1);
    expect(page.getHeight()).toBeCloseTo(566.93, 1);
  });

  it('[RESIZE-06] a custom size with a missing side is refused, not guessed', async () => {
    const doc = await docWith([[300, 300]]);
    expect(() => resizePagesInDocument(doc, {
      pagePreset: 'custom', customWidthMm: 100, customHeightMm: null, selectedPageIndices: [0],
    })).toThrow();
  });

  it('[RESIZE-07] reports progress once per page, so a long run can be shown', async () => {
    const seen: number[] = [];
    const doc = await docWith([[300, 300], [300, 300], [300, 300]]);
    resizePagesInDocument(doc, {
      ...A4,
      selectedPageIndices: [0, 1, 2],
      onProgress: (current, total) => { expect(total).toBe(3); seen.push(current); },
    });
    expect(seen).toEqual([1, 2, 3]);
  });

  it('[RESIZE-08] scales to fit rather than stretching, whichever way the page is', async () => {
    // A wide page onto a tall sheet has to keep its proportions; stretching is
    // what makes a resized scan unreadable.
    const doc = await docWith([[1000, 200]]);
    resizePagesInDocument(doc, { ...A4, selectedPageIndices: [0] });
    const page = (await reload(doc)).getPages()[0];
    // The sheet is A4; what matters is that the content was scaled by the
    // limiting dimension, which for a 5:1 page is the width.
    expect(page.getWidth()).toBeCloseTo(A4_W, 1);
    expect(page.getHeight()).toBeCloseTo(A4_H, 1);
  });
});
