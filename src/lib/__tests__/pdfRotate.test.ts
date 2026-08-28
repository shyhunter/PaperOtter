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
import { rotatePdf, cycleRotation, turnBy } from '../pdfRotate';

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

// ─── RT-06..RT-09 — turning is relative, and it accumulates ──────────────────
//
// The editor's rotate panel offered a 2x2 compass — Original / Turn Right /
// Upside Down / Turn Left — whose values were fed straight to rotatePdf, which
// treats them as deltas on the page's existing /Rotate. So the labels described
// absolute positions while the engine applied relative ones:
//
//   * "Original" did not restore anything; a delta of 0 simply changes nothing.
//   * "Upside Down" on a page already at 90 produced 270, not upside down.
//   * Clicking "Turn Right" twice still sent 90, because the compass *set* the
//     value instead of adding to it — a half turn was unreachable.
//
// Two buttons that accumulate match the engine exactly, which is how the
// standalone Rotate PDF step already worked.

describe('turnBy — relative quarter turns (RT-06..RT-09)', () => {
  it('RT-06: turning right accumulates a quarter at a time', () => {
    expect(turnBy(0, 'right')).toBe(90);
    expect(turnBy(90, 'right')).toBe(180);
    expect(turnBy(180, 'right')).toBe(270);
    expect(turnBy(270, 'right')).toBe(0);
  });

  it('RT-07: turning left accumulates the other way', () => {
    expect(turnBy(0, 'left')).toBe(270);
    expect(turnBy(270, 'left')).toBe(180);
    expect(turnBy(180, 'left')).toBe(90);
    expect(turnBy(90, 'left')).toBe(0);
  });

  it('RT-08: two turns right make a half turn', () => {
    // Unreachable with the compass, which set 90 however many times it was hit.
    expect(turnBy(turnBy(0, 'right'), 'right')).toBe(180);
  });

  it('RT-09: a turn each way returns to where it started', () => {
    for (const start of [0, 90, 180, 270] as const) {
      expect(turnBy(turnBy(start, 'right'), 'left')).toBe(start);
    }
  });
});
