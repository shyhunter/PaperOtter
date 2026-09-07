import { describe, it, expect } from 'vitest';
import { PDFDocument, degrees } from 'pdf-lib';
import { applyAllEdits } from '@/lib/pdfEditor';
import { pageContent, imageMatrix, textMatrix, rawToVisual, visualSize } from '@/test/pdfContent';
import type { PageEditState } from '@/types/editor';

/**
 * [EDITROT] The editor writes out what the user pointed at.
 *
 * Every overlay in the editor positions itself against pdf.js `getViewport`,
 * which applies the page's /Rotate, and drags move blocks in those same
 * coordinates. So the whole interface works in the frame the reader sees, and
 * is self-consistent. pdf-lib draws in the unturned space underneath, and
 * applyAllEdits was handing it those numbers unchanged: on a turned page a
 * signature or stamp came out somewhere else entirely and lying on its side.
 *
 * The safety property these tests exist for is the second one. On an unrotated
 * page the two spaces are identical, so the mapping must be exactly the
 * identity -- nearly every page in every document is unrotated, and a fix that
 * moved those by even a point would be far worse than the bug.
 */

const PNG_1X1 = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='),
  (c) => c.charCodeAt(0),
);

const RAW_W = 595, RAW_H = 842;
const ROTATIONS = [0, 90, 180, 270] as const;

async function pageWithRotation(rotation: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([RAW_W, RAW_H]);
  if (rotation) page.setRotation(degrees(rotation));
  return new Uint8Array(await doc.save());
}

function edits(partial: Partial<PageEditState>): PageEditState[] {
  return [{
    pageIndex: 0, textBlocks: [], imageBlocks: [], deletedTextBlocks: [], redactions: [],
    ...partial,
  } as unknown as PageEditState];
}

function imageBlock(x: number, y: number, width = 120, height = 40) {
  return {
    id: 'i1', pageIndex: 0, x, y, width, height,
    imageBytes: PNG_1X1, rotation: 0 as const, flipH: false, flipV: false, isNew: true,
  };
}

function textBlock(x: number, y: number, extra: Record<string, unknown> = {}) {
  return {
    id: 't1', pageIndex: 0, x, y, width: 200, height: 18,
    text: 'Hello', fontSize: 12, fontName: 'Helvetica', color: '#000000',
    alignment: 'left' as const, bold: false, italic: false, underline: false,
    lineHeight: 1.2, isNew: true, ...extra,
  };
}

/** The rectangle a drawn image occupies, in the frame the reader sees. */
async function drawnVisualRect(bytes: Uint8Array, rotation: number) {
  const doc = await PDFDocument.load(bytes);
  const m = imageMatrix(pageContent(doc, 0));
  if (!m) return null;

  const corners = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([u, v]) => ({
    x: m[0] * u + m[2] * v + m[4],
    y: m[1] * u + m[3] * v + m[5],
  }));
  const visual = corners.map((c) => rawToVisual(c.x, c.y, RAW_W, RAW_H, rotation));
  const xs = visual.map((v) => v.vx), ys = visual.map((v) => v.vy);
  return {
    left: Math.min(...xs), bottom: Math.min(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };
}

describe('the editor on a turned page', () => {
  it('[EDITROT-01] an unrotated page gets exactly the coordinates it was given', async () => {
    // The safety property. Identity, to the point, or almost every document in
    // the world is quietly moved.
    const out = await applyAllEdits(await pageWithRotation(0), edits({ imageBlocks: [imageBlock(100, 700)] }));
    const m = imageMatrix(pageContent(await PDFDocument.load(out), 0))!;
    expect(m[4]).toBeCloseTo(100, 6);
    expect(m[5]).toBeCloseTo(700, 6);
    expect(m[0], 'width unchanged').toBeCloseTo(120, 6);
    expect(m[3], 'height unchanged').toBeCloseTo(40, 6);
  });

  it('[EDITROT-02] a stamp lands where it was dropped, at every rotation', async () => {
    for (const rotation of ROTATIONS) {
      const { visW, visH } = visualSize(RAW_W, RAW_H, rotation);
      // A quarter across and three quarters up, as the reader sees the page.
      const vx = visW * 0.25, vy = visH * 0.75;

      const out = await applyAllEdits(
        await pageWithRotation(rotation),
        edits({ imageBlocks: [imageBlock(vx, vy)] }),
      );
      const rect = (await drawnVisualRect(out, rotation))!;

      expect(rect.left, `rotation ${rotation} across`).toBeCloseTo(vx, 1);
      expect(rect.bottom, `rotation ${rotation} up`).toBeCloseTo(vy, 1);
    }
  });

  it('[EDITROT-03] and stays the right way up and the right way round', async () => {
    // A stamp drawn without undoing the rotation has its width and height
    // swapped as the reader sees it, which is the visible half of the bug.
    for (const rotation of ROTATIONS) {
      const out = await applyAllEdits(
        await pageWithRotation(rotation),
        edits({ imageBlocks: [imageBlock(50, 50)] }),
      );
      const rect = (await drawnVisualRect(out, rotation))!;
      expect(rect.width, `rotation ${rotation}`).toBeCloseTo(120, 1);
      expect(rect.height, `rotation ${rotation}`).toBeCloseTo(40, 1);
    }
  });

  it('[EDITROT-04] a stamp stays inside the page it was dropped on', async () => {
    // Near the far corner, not the middle: a centred stamp lands inside the
    // page even unmapped, so the middle proves nothing. This is the position a
    // signature actually goes.
    for (const rotation of ROTATIONS) {
      const { visW, visH } = visualSize(RAW_W, RAW_H, rotation);
      const out = await applyAllEdits(
        await pageWithRotation(rotation),
        edits({ imageBlocks: [imageBlock(visW - 130, 20)] }),
      );
      const rect = (await drawnVisualRect(out, rotation))!;
      expect(rect.left >= 0 && rect.bottom >= 0, `rotation ${rotation}`).toBe(true);
      expect(rect.left + rect.width <= visW + 0.5, `rotation ${rotation} width`).toBe(true);
      expect(rect.bottom + rect.height <= visH + 0.5, `rotation ${rotation} height`).toBe(true);
    }
  });

  it('[EDITROT-08] the cover over a removed stamp goes where the stamp was', async () => {
    // Nothing extracts an image block from a document, so every one of them was
    // placed in the editor and is in the reader's frame, its cover included. An
    // unmapped cover whites out a different part of the page and leaves the
    // thing it was meant to hide on show.
    const { visW, visH } = visualSize(RAW_W, RAW_H, 90);
    const vx = visW * 0.3, vy = visH * 0.6;
    const out = await applyAllEdits(
      await pageWithRotation(90),
      edits({ deletedImageBlocks: [{ id: 'd1', x: vx, y: vy, width: 120, height: 40 }] }),
    );

    const content = pageContent(await PDFDocument.load(out), 0);
    // pdf-lib writes a rectangle as a path, not an `re`, and puts the placement
    // in the transform before it -- the corners in the stream are all relative
    // to that. The first cm is the translate.
    expect(content.replace(/\s+/g, ' '), 'a cover was drawn').toContain('0 0 m');
    const m = content.match(/([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+) cm/);
    expect(m, 'and placed through a transform').not.toBeNull();
    const { vx: gotX, vy: gotY } = rawToVisual(Number(m![5]), Number(m![6]), RAW_W, RAW_H, 90);
    expect(gotX).toBeCloseTo(vx - 1, 1);
    expect(gotY).toBeCloseTo(vy - 1, 1);
  });

  it('[EDITROT-05] a text box the user created is mapped too', async () => {
    // Created by clicking the rendered page, so it is in the same frame as a
    // stamp and gets the same treatment.
    for (const rotation of ROTATIONS) {
      const out = await applyAllEdits(
        await pageWithRotation(rotation),
        edits({ textBlocks: [textBlock(120, 400)] }),
      );
      const m = textMatrix(pageContent(await PDFDocument.load(out), 0))!;
      const { vx, vy } = rawToVisual(m[4], m[5], RAW_W, RAW_H, rotation);
      expect(vx, `rotation ${rotation} across`).toBeCloseTo(120, 1);
      expect(vy, `rotation ${rotation} up`).toBeCloseTo(400, 1);
    }
  });

  it("[EDITROT-06] extracted text is left in the page own coordinates", async () => {
    // Extraction reads transforms from getTextContent, which are already the
    // page's own coordinates. Mapping those as well would move them twice.
    // They display in the wrong place on a turned page, which is a defect in
    // the overlay layer and not something this file can reach: see the note at
    // the top of pdfEditor.ts.
    const out = await applyAllEdits(
      await pageWithRotation(90),
      edits({ textBlocks: [textBlock(120, 400, { isNew: false, isModified: true })] }),
    );
    const m = textMatrix(pageContent(await PDFDocument.load(out), 0))!;
    expect(m[4], 'written as given').toBeCloseTo(120, 6);
    expect(m[5]).toBeCloseTo(400, 6);
  });

  it('[EDITROT-07] an underline follows its text round the page', async () => {
    // Both ends are mapped rather than one end plus a width: on a quarter-turned
    // page the line runs along the other axis, and a width added in the wrong
    // space sends it across the page.
    const out = await applyAllEdits(
      await pageWithRotation(90),
      edits({ textBlocks: [textBlock(120, 400, { underline: true })] }),
    );
    const content = pageContent(await PDFDocument.load(out), 0);
    const line = content.match(/([-\d.]+) ([-\d.]+) m\s+([-\d.]+) ([-\d.]+) l/);
    expect(line, 'an underline was drawn').not.toBeNull();

    const [x1, y1, x2, y2] = line!.slice(1).map(Number);
    const a = rawToVisual(x1, y1, RAW_W, RAW_H, 90);
    const b = rawToVisual(x2, y2, RAW_W, RAW_H, 90);
    expect(a.vy, 'both ends at the same height as the reader sees it').toBeCloseTo(b.vy, 1);
    expect(b.vx, 'and it runs left to right').toBeGreaterThan(a.vx);
  });
});
