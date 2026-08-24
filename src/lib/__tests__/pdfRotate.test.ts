// Rotation must be RELATIVE to the page's existing /Rotate value.
//
// Bug: rotatePdf called page.setRotation(degrees(rotation)), i.e. it SET an
// absolute angle. Both callers treat their value as a delta on top of what the
// page already looks like — the editor's RotatePanel previews with a CSS
// `transform: rotate(Ndeg)` over the rendered page, and the standalone
// RotateStep starts every page at 0 and cycles with cycleRotation(). So for any
// page that already carried a /Rotate, the applied result did not match the
// Before/After preview: rotating an already-90° page by 90° left it at 90°
// instead of 180°.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PDFDocument, degrees } from 'pdf-lib';
import { rotatePdf, cycleRotation } from '../pdfRotate';

const FIXTURE = resolve(__dirname, '../../../test-fixtures/sample.pdf');

/** Real fixture (P007) with a preset /Rotate on the given page. */
async function fixtureWithRotation(pageIndex: number, angle: number): Promise<Uint8Array> {
  const doc = await PDFDocument.load(new Uint8Array(readFileSync(FIXTURE)), {
    ignoreEncryption: true,
  });
  if (angle !== 0) doc.getPage(pageIndex).setRotation(degrees(angle));
  return new Uint8Array(await doc.save());
}

async function rotationOf(bytes: Uint8Array, pageIndex: number): Promise<number> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  return ((doc.getPage(pageIndex).getRotation().angle % 360) + 360) % 360;
}

describe('rotatePdf — relative rotation (RT-01..RT-05)', () => {
  it('RT-01: rotates an unrotated page by 90', async () => {
    const src = await fixtureWithRotation(0, 0);
    const { bytes } = await rotatePdf(src, [{ pageIndex: 0, rotation: 90 }]);
    expect(await rotationOf(bytes, 0)).toBe(90);
  });

  it('RT-02: adds to a page that is already rotated 90 -> 180', async () => {
    const src = await fixtureWithRotation(0, 90);
    const { bytes } = await rotatePdf(src, [{ pageIndex: 0, rotation: 90 }]);
    expect(await rotationOf(bytes, 0)).toBe(180);
  });

  it('RT-03: wraps past 360 — 270 + 180 -> 90', async () => {
    const src = await fixtureWithRotation(0, 270);
    const { bytes } = await rotatePdf(src, [{ pageIndex: 0, rotation: 180 }]);
    expect(await rotationOf(bytes, 0)).toBe(90);
  });

  it('RT-04: leaves other pages untouched', async () => {
    const src = await fixtureWithRotation(1, 90);
    const { bytes } = await rotatePdf(src, [{ pageIndex: 0, rotation: 90 }]);
    expect(await rotationOf(bytes, 0)).toBe(90);
    expect(await rotationOf(bytes, 1)).toBe(90); // untouched, keeps its own
  });

  it('RT-05: applies independently to several pages in one call', async () => {
    const src = await fixtureWithRotation(0, 0);
    const { bytes } = await rotatePdf(src, [
      { pageIndex: 0, rotation: 90 },
      { pageIndex: 1, rotation: 180 },
      { pageIndex: 2, rotation: 270 },
    ]);
    expect(await rotationOf(bytes, 0)).toBe(90);
    expect(await rotationOf(bytes, 1)).toBe(180);
    expect(await rotationOf(bytes, 2)).toBe(270);
  });

  it('cycleRotation still cycles 0 -> 90 -> 180 -> 270 -> 0', () => {
    expect(cycleRotation(0)).toBe(90);
    expect(cycleRotation(90)).toBe(180);
    expect(cycleRotation(180)).toBe(270);
    expect(cycleRotation(270)).toBe(0);
  });
});
