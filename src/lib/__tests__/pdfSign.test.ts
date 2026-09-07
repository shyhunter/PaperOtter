import { describe, it, expect } from 'vitest';
import { PDFDocument, PDFRawStream, decodePDFRawStream, degrees } from 'pdf-lib';
import { addSignature } from '@/lib/pdfSign';

/**
 * [SIGPLACE] One position, meant on every page, whatever shape that page is.
 *
 * Reported on a 438-page report: "I tried to apply signature but it applied
 * only first 3-4 pages but not at all of them."
 *
 * It was applied to all of them. Placement was a single absolute point taken
 * from the page the user had on screen, and drawn at that point on every page
 * chosen -- so on a page of another size the signature landed off the visible
 * area, and on a page with a /Rotate it landed turned on its side, in the same
 * way page numbers did before [ROT]. The pages that worked were the run of
 * same-sized pages at the front, which is what "the first 3-4" was.
 *
 * These build documents whose pages disagree, which is what an annual report
 * or anything with a landscape spread in it looks like.
 */

const PNG_1X1 = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='),
  (c) => c.charCodeAt(0),
);

const A4 = [595, 842] as const;
const LANDSCAPE = [842, 595] as const;
const A5 = [420, 595] as const;

/** Builds a document from page sizes, optionally turning some of them. */
async function makeDoc(specs: { size: readonly [number, number]; rotate?: number }[]) {
  const doc = await PDFDocument.create();
  for (const spec of specs) {
    const page = doc.addPage([spec.size[0], spec.size[1]]);
    if (spec.rotate) page.setRotation(degrees(spec.rotate));
  }
  return new Uint8Array(await doc.save());
}

/** A PDF transform [a b c d e f]: (x,y) -> (ax + cy + e, bx + dy + f). */
type Matrix = [number, number, number, number, number, number];

/** The matrix for A(B(p)) -- B applied first, which is the order `cm` composes in. */
function compose(A: Matrix, B: Matrix): Matrix {
  const [aA, bA, cA, dA, eA, fA] = A;
  const [aB, bB, cB, dB, eB, fB] = B;
  return [
    aA * aB + cA * bB,
    bA * aB + dA * bB,
    aA * cB + cA * dB,
    bA * cB + dA * dB,
    aA * eB + cA * fB + eA,
    bA * eB + dA * fB + fA,
  ];
}

/** The page's drawing operators, with any compressed stream inflated. */
function contentText(doc: PDFDocument, pageIndex: number): string {
  const page = doc.getPages()[pageIndex];
  // A page nothing was ever drawn on has no /Contents at all, which is itself
  // the answer for the untouched-page case.
  const contents = page.node.normalizedEntries().Contents;
  if (!contents) return '';
  return contents.asArray().map((ref) => {
    const stream = doc.context.lookup(ref);
    // pdf-lib's own appended stream survives a save uncompressed; the page's
    // content comes back as a Flate raw stream, and that is where the drawing
    // ops end up after a round trip.
    const bytes = stream instanceof PDFRawStream
      ? decodePDFRawStream(stream).decode()
      : (stream as { getUnencodedContents?: () => Uint8Array }).getUnencodedContents?.();
    return bytes ? new TextDecoder('latin1').decode(bytes) : '';
  }).join('\n');
}

/**
 * The rectangle the signature occupies on one page, read back out of the saved
 * file, in that page's own coordinates.
 *
 * Read back rather than taken from the call arguments, because the arguments
 * are what this is testing. pdf-lib writes the placement as a chain of `cm`
 * matrices -- translate, rotate, scale, skew -- before the image is drawn, so
 * all of them have to be composed; the last one alone is only the scale, and
 * would put every signature at the origin.
 */
async function drawnRect(bytes: Uint8Array, pageIndex: number) {
  const doc = await PDFDocument.load(bytes);
  const { width: rawW, height: rawH } = doc.getPages()[pageIndex].getSize();

  const text = contentText(doc, pageIndex);
  const drawIndex = text.indexOf(' Do');
  if (drawIndex < 0) return null;

  const matrices = [...text.slice(0, drawIndex).matchAll(
    /(-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) cm/g,
  )].map((m) => m.slice(1).map(Number) as Matrix);
  if (matrices.length === 0) return null;

  const total = matrices.reduce(compose);

  // The image is drawn into the unit square, so its corners through the
  // transform give the rectangle that actually landed on the page.
  const pts = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([u, v]) => ({
    x: total[0] * u + total[2] * v + total[4],
    y: total[1] * u + total[3] * v + total[5],
  }));
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  return {
    rawW, rawH,
    x0: Math.min(...xs), x1: Math.max(...xs),
    y0: Math.min(...ys), y1: Math.max(...ys),
  };
}

/** Whether the drawn rectangle lies wholly inside the page box. */
function onPage(r: NonNullable<Awaited<ReturnType<typeof drawnRect>>>): boolean {
  return r.x0 >= -0.5 && r.y0 >= -0.5 && r.x1 <= r.rawW + 0.5 && r.y1 <= r.rawH + 0.5;
}

/** Near the top-right of the page the user was looking at. */
const PLACEMENT = { xRatio: 200 / 595, yRatio: 700 / 842, width: 150, height: 40 };

describe('addSignature', () => {
  it('[SIGPLACE-01] lands on the page when the pages are not all the same size', async () => {
    // The report itself: same-sized pages at the front, then a landscape
    // spread and a smaller page. Before the fix, only indices 0-2 were on-page.
    const bytes = await makeDoc([
      { size: A4 }, { size: A4 }, { size: A4 }, { size: LANDSCAPE }, { size: A5 },
    ]);
    const out = await addSignature(bytes, { imageBytes: PNG_1X1, ...PLACEMENT, pageIndices: [0, 1, 2, 3, 4] });

    for (let i = 0; i < 5; i++) {
      const r = await drawnRect(out, i);
      expect(r, `page ${i} was drawn on`).not.toBeNull();
      expect(onPage(r!), `page ${i} has the signature inside it`).toBe(true);
    }
  });

  it('[SIGPLACE-02] keeps the same relative position, not the same absolute point', async () => {
    // The point of a ratio: the signature should be in the same part of the
    // page, so the reader finds it where they expect on every sheet.
    const bytes = await makeDoc([{ size: A4 }, { size: LANDSCAPE }]);
    const out = await addSignature(bytes, { imageBytes: PNG_1X1, ...PLACEMENT, pageIndices: [0, 1] });

    const a = (await drawnRect(out, 0))!;
    const b = (await drawnRect(out, 1))!;
    expect(a.x0 / a.rawW, 'same fraction across').toBeCloseTo(b.x0 / b.rawW, 2);
    expect(a.y0 / a.rawH, 'same fraction up').toBeCloseTo(b.y0 / b.rawH, 2);
  });

  it('[SIGPLACE-03] keeps its size rather than shrinking with the page', async () => {
    // A signature is a thing of a size, not a proportion of whatever it is on.
    const bytes = await makeDoc([{ size: A4 }, { size: A5 }]);
    const out = await addSignature(bytes, { imageBytes: PNG_1X1, ...PLACEMENT, pageIndices: [0, 1] });

    const a = (await drawnRect(out, 0))!;
    const b = (await drawnRect(out, 1))!;
    expect(b.x1 - b.x0, 'same width in points').toBeCloseTo(a.x1 - a.x0, 1);
    expect(b.y1 - b.y0, 'same height in points').toBeCloseTo(a.y1 - a.y0, 1);
  });

  it('[SIGPLACE-04] stays on a page turned by a /Rotate', async () => {
    // The same defect page numbers had, see [ROT]: pdf-lib draws in the
    // unturned space beneath the rotation, so an untreated placement puts the
    // signature on a side edge, lying down.
    for (const rotate of [90, 180, 270]) {
      const bytes = await makeDoc([{ size: A4, rotate }]);
      const out = await addSignature(bytes, { imageBytes: PNG_1X1, ...PLACEMENT, pageIndices: [0] });
      const r = (await drawnRect(out, 0))!;
      expect(onPage(r), `rotation ${rotate}`).toBe(true);
    }
  });

  it('[SIGPLACE-05] a rotated page gets the signature the right way up', async () => {
    // Upright means turned by the page's own angle, which the viewer's
    // rotation then cancels. A quarter turn shows as a swapped bounding box.
    const bytes = await makeDoc([{ size: A4, rotate: 90 }]);
    const out = await addSignature(bytes, { imageBytes: PNG_1X1, ...PLACEMENT, pageIndices: [0] });
    const r = (await drawnRect(out, 0))!;
    expect(r.x1 - r.x0, 'width lies along the raw y axis now').toBeCloseTo(PLACEMENT.height, 1);
    expect(r.y1 - r.y0).toBeCloseTo(PLACEMENT.width, 1);
  });

  it('[SIGPLACE-06] a signature bigger than the page is brought inside it', async () => {
    // Rather than hanging over the edge, which is not a signature anyone can
    // read and not something the preview ever showed.
    const bytes = await makeDoc([{ size: [200, 200] as const }]);
    const out = await addSignature(bytes, {
      imageBytes: PNG_1X1, xRatio: 0.9, yRatio: 0.9, width: 400, height: 300, pageIndices: [0],
    });
    expect(onPage((await drawnRect(out, 0))!)).toBe(true);
  });

  it('[SIGPLACE-07] leaves the pages that were not chosen alone', async () => {
    const bytes = await makeDoc([{ size: A4 }, { size: A4 }, { size: A4 }]);
    const out = await addSignature(bytes, { imageBytes: PNG_1X1, ...PLACEMENT, pageIndices: [1] });
    expect(await drawnRect(out, 0), 'page 0 untouched').toBeNull();
    expect(await drawnRect(out, 1), 'page 1 signed').not.toBeNull();
    expect(await drawnRect(out, 2), 'page 2 untouched').toBeNull();
  });

  it('[SIGPLACE-08] an out-of-range index is skipped, not a failure', async () => {
    const bytes = await makeDoc([{ size: A4 }]);
    await expect(
      addSignature(bytes, { imageBytes: PNG_1X1, ...PLACEMENT, pageIndices: [-1, 0, 99] }),
    ).resolves.toBeInstanceOf(Uint8Array);
  });
});
