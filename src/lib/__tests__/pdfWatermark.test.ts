import { describe, it, expect } from 'vitest';
import { PDFDocument, degrees } from 'pdf-lib';
import { addWatermark, addWatermarkSinglePage, DEFAULT_WATERMARK_OPTIONS } from '@/lib/pdfWatermark';
import { createMinimalPdf, createContentPdf } from '@/test/fixtures';
import { pageContent, textMatrix, matrixAngle, rawToVisual, visualSize } from '@/test/pdfContent';

// ─── addWatermark ─────────────────────────────────────────────────────────────

describe('addWatermark', () => {
  it('returns valid PDF bytes', async () => {
    const src = await createMinimalPdf(1);
    const result = await addWatermark(src, DEFAULT_WATERMARK_OPTIONS);
    expect(result).toBeInstanceOf(Uint8Array);
    // Check PDF magic bytes (%PDF-)
    expect(result[0]).toBe(0x25); // %
    expect(result[1]).toBe(0x50); // P
    expect(result[2]).toBe(0x44); // D
    expect(result[3]).toBe(0x46); // F
  });

  it('preserves the original page count', async () => {
    const src = await createMinimalPdf(5);
    const result = await addWatermark(src, DEFAULT_WATERMARK_OPTIONS);
    const doc = await PDFDocument.load(result);
    expect(doc.getPageCount()).toBe(5);
  });

  it('applies watermark to all pages in a multi-page PDF', async () => {
    const src = await createContentPdf(3);
    const result = await addWatermark(src, { ...DEFAULT_WATERMARK_OPTIONS, text: 'SECRET' });
    const doc = await PDFDocument.load(result);
    expect(doc.getPageCount()).toBe(3);
    expect(result.byteLength).toBeGreaterThan(src.byteLength);
  });
});

// ─── addWatermarkSinglePage ───────────────────────────────────────────────────

describe('addWatermarkSinglePage', () => {
  it('returns a single-page PDF regardless of source page count', async () => {
    const src = await createMinimalPdf(10);
    const result = await addWatermarkSinglePage(src, DEFAULT_WATERMARK_OPTIONS, 0);
    const doc = await PDFDocument.load(result);
    expect(doc.getPageCount()).toBe(1);
  });

  it('preserves the source page dimensions', async () => {
    const src = await createMinimalPdf(3);
    const srcDoc = await PDFDocument.load(src);
    const srcPage = srcDoc.getPage(2); // third page
    const { width: srcW, height: srcH } = srcPage.getSize();

    const result = await addWatermarkSinglePage(src, DEFAULT_WATERMARK_OPTIONS, 2);
    const resultDoc = await PDFDocument.load(result);
    const { width: resW, height: resH } = resultDoc.getPage(0).getSize();

    expect(resW).toBeCloseTo(srcW, 1);
    expect(resH).toBeCloseTo(srcH, 1);
  });

  it('clamps out-of-range pageIndex to the last page', async () => {
    const src = await createMinimalPdf(3);
    const result = await addWatermarkSinglePage(src, DEFAULT_WATERMARK_OPTIONS, 999);
    const doc = await PDFDocument.load(result);
    expect(doc.getPageCount()).toBe(1);
  });

  it('clamps negative pageIndex to page 0', async () => {
    const src = await createMinimalPdf(3);
    const result = await addWatermarkSinglePage(src, DEFAULT_WATERMARK_OPTIONS, -5);
    const doc = await PDFDocument.load(result);
    expect(doc.getPageCount()).toBe(1);
  });

  it('defaults to pageIndex 0 when not specified', async () => {
    const src = await createMinimalPdf(5);
    const result = await addWatermarkSinglePage(src, DEFAULT_WATERMARK_OPTIONS);
    const doc = await PDFDocument.load(result);
    expect(doc.getPageCount()).toBe(1);
  });

  it('produces a smaller output than full addWatermark for multi-page PDFs', async () => {
    const src = await createContentPdf(20);
    const full = await addWatermark(src, DEFAULT_WATERMARK_OPTIONS);
    const single = await addWatermarkSinglePage(src, DEFAULT_WATERMARK_OPTIONS, 0);
    expect(single.byteLength).toBeLessThan(full.byteLength);
  });

  it('returns valid PDF magic bytes', async () => {
    const src = await createMinimalPdf(1);
    const result = await addWatermarkSinglePage(src, DEFAULT_WATERMARK_OPTIONS, 0);
    expect(result[0]).toBe(0x25); // %
    expect(result[1]).toBe(0x50); // P
    expect(result[2]).toBe(0x44); // D
    expect(result[3]).toBe(0x46); // F
  });
});

// ─── Colour and placement ─────────────────────────────────────────────────────
//
// The watermark used to take a 'gray' | 'red' | 'blue' enum — its own private
// vocabulary, three colours, no way to reach any other. It now takes the same
// #RRGGBB string every other colour-bearing feature takes.

describe('addWatermark — colour', () => {
  it('WM-COL-01: accepts any hex colour, not a fixed set of three', async () => {
    const src = await createContentPdf(1);
    const teal = await addWatermark(src, { ...DEFAULT_WATERMARK_OPTIONS, color: '#0D9488' });
    const red = await addWatermark(src, { ...DEFAULT_WATERMARK_OPTIONS, color: '#DC2626' });

    expect(Buffer.from(teal).equals(Buffer.from(red))).toBe(false);
  });

  it('WM-COL-02: defaults to the same grey the old gray preset drew', async () => {
    // rgb(0.5, 0.5, 0.5) rounded to 8 bits is #808080; the default must not
    // silently change what existing users see.
    expect(DEFAULT_WATERMARK_OPTIONS.color).toBe('#808080');
  });

  it('WM-COL-03: a malformed colour still produces a valid PDF', async () => {
    const src = await createContentPdf(1);
    const result = await addWatermark(src, { ...DEFAULT_WATERMARK_OPTIONS, color: 'chartreuse' });

    const doc = await PDFDocument.load(result);
    expect(doc.getPageCount()).toBe(1);
  });
});

describe('addWatermark — placement', () => {
  it('WM-POS-01: defaults to the centre of the page', async () => {
    expect(DEFAULT_WATERMARK_OPTIONS.centerX).toBe(0.5);
    expect(DEFAULT_WATERMARK_OPTIONS.centerY).toBe(0.5);
  });

  it('WM-POS-02: a moved watermark produces different output', async () => {
    const src = await createContentPdf(1);
    const centred = await addWatermark(src, DEFAULT_WATERMARK_OPTIONS);
    const moved = await addWatermark(src, { ...DEFAULT_WATERMARK_OPTIONS, centerX: 0.2, centerY: 0.8 });

    expect(Buffer.from(centred).equals(Buffer.from(moved))).toBe(false);
  });

  it('WM-POS-03: position is a fraction of the page, so mixed page sizes agree', async () => {
    // Stored as 0..1 rather than points: a document whose pages differ in size
    // would otherwise put the watermark in a different place on each one, which
    // is what happened to signatures, see [SIGPLACE].
    //
    // Measured rather than merely surviving: this test used to assert only the
    // page count, which every possible placement satisfies.
    const doc = await PDFDocument.create();
    doc.addPage([595, 842]);
    doc.addPage([842, 595]);
    const result = await addWatermark(
      new Uint8Array(await doc.save()),
      { ...DEFAULT_WATERMARK_OPTIONS, centerX: 0.25, centerY: 0.25 },
    );

    // The requested centre is what should agree. pdf-lib draws from the text's
    // baseline-left origin, which sits a fixed number of points away from that
    // centre, so it is the offset that is constant -- comparing origins as
    // fractions would fail on correct output.
    const out = await PDFDocument.load(result);
    const offsets = out.getPages().map((page, i) => {
      const { width, height } = page.getSize();
      const m = textMatrix(pageContent(out, i))!;
      return { dx: m[4] - 0.25 * width, dy: m[5] - 0.25 * height };
    });
    expect(offsets[0].dx, 'same point on both pages, across').toBeCloseTo(offsets[1].dx, 1);
    expect(offsets[0].dy, 'same point on both pages, up').toBeCloseTo(offsets[1].dy, 1);
  });

  it('WM-POS-04: the preview places the watermark exactly where the output does', async () => {
    // Both paths go through the same placement function, so a preview cannot
    // drift from the document the user actually gets.
    const src = await createContentPdf(1);
    const options = { ...DEFAULT_WATERMARK_OPTIONS, centerX: 0.3, centerY: 0.7, fontSize: 60 };

    const full = await addWatermark(src, options);
    const preview = await addWatermarkSinglePage(src, options, 0);

    const fullDoc = await PDFDocument.load(full);
    const previewDoc = await PDFDocument.load(preview);
    expect(previewDoc.getPageCount()).toBe(1);
    expect(fullDoc.getPage(0).getSize()).toEqual(previewDoc.getPage(0).getSize());
  });

  it('WM-POS-05: an out-of-range position is clamped onto the page', async () => {
    const src = await createContentPdf(1);
    const result = await addWatermark(src, { ...DEFAULT_WATERMARK_OPTIONS, centerX: 5, centerY: -3 });

    const doc = await PDFDocument.load(result);
    expect(doc.getPageCount()).toBe(1);
  });
});

// ─── addWatermark on a turned page ───────────────────────────────────────────
//
// [WM-ROT] /Rotate turns a page at display time and pdf-lib draws in the
// unturned space underneath, so a placement that ignores it lands somewhere
// else and at the wrong angle. Page numbers had this defect and signatures had
// it; this is the third stamper, checked after the signature one was fixed.
//
// The specific failure: centerX and centerY come from a drag on the rendered
// page, where pdf.js has already applied the rotation, so on a quarter-turned
// page they were multiplied by the wrong edge -- and a -45 degree watermark was
// drawn at -45 in a space the viewer then turned again, putting it on the
// other diagonal from the one the preview showed.

const ROTATIONS = [0, 90, 180, 270] as const;

/** Where the watermark's text origin ended up, as a fraction of the visible page. */
async function visualOriginFraction(bytes: Uint8Array, rotation: number) {
  const doc = await PDFDocument.load(bytes);
  const { width: rawW, height: rawH } = doc.getPages()[0].getSize();
  const m = textMatrix(pageContent(doc, 0));
  if (!m) return null;

  const { vx, vy } = rawToVisual(m[4], m[5], rawW, rawH, rotation);
  const { visW, visH } = visualSize(rawW, rawH, rotation);
  return { fx: vx / visW, fy: vy / visH, rawAngle: matrixAngle(m) };
}

/** One A4 page, optionally turned, with something on it. */
async function turnedPage(rotation: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  if (rotation) page.setRotation(degrees(rotation));
  return new Uint8Array(await doc.save());
}

describe('addWatermark — turned pages', () => {
  const OPTIONS = { ...DEFAULT_WATERMARK_OPTIONS, centerX: 0.25, centerY: 0.75 };

  it('[WM-ROT-01] the reader sees the angle that was chosen, on every rotation', async () => {
    // Drawn at the chosen angle plus the page's own, so the viewer's turn
    // cancels the page's share. Before this, a -45 diagonal came out as +45 on
    // a quarter-turned page.
    for (const rotation of ROTATIONS) {
      const out = await addWatermark(await turnedPage(rotation), OPTIONS);
      const got = (await visualOriginFraction(out, rotation))!;
      const visualAngle = ((got.rawAngle - rotation) % 360 + 360) % 360;
      expect(visualAngle, `rotation ${rotation}`).toBe(((OPTIONS.rotation % 360) + 360) % 360);
    }
  });

  it('[WM-ROT-02] lands in the same place on the page whichever way it is turned', async () => {
    // The offset from the requested centre to the text's baseline-left origin
    // depends only on the text and the angle, so it is the same vector on every
    // rotation once the whole placement is worked out in the visible frame.
    // Comparing the offset rather than the origin keeps the assertion free of
    // font metrics, which would just restate the implementation.
    const offsets = [];
    for (const rotation of ROTATIONS) {
      const out = await addWatermark(await turnedPage(rotation), OPTIONS);
      const got = (await visualOriginFraction(out, rotation))!;
      const { visW, visH } = visualSize(595, 842, rotation);
      offsets.push({
        rotation,
        dx: got.fx * visW - OPTIONS.centerX * visW,
        dy: got.fy * visH - OPTIONS.centerY * visH,
      });
    }

    for (const o of offsets.slice(1)) {
      expect(o.dx, `rotation ${o.rotation} across`).toBeCloseTo(offsets[0].dx, 1);
      expect(o.dy, `rotation ${o.rotation} up`).toBeCloseTo(offsets[0].dy, 1);
    }
  });

  it('[WM-ROT-03] the preview on a turned page matches the document', async () => {
    // addWatermarkSinglePage copies the page, and copyPages carries /Rotate, so
    // the preview only agrees if both go through the same placement.
    const src = await turnedPage(90);
    const full = await visualOriginFraction(await addWatermark(src, OPTIONS), 90);
    const preview = await visualOriginFraction(await addWatermarkSinglePage(src, OPTIONS, 0), 90);

    expect(preview!.fx).toBeCloseTo(full!.fx, 4);
    expect(preview!.fy).toBeCloseTo(full!.fy, 4);
    expect(preview!.rawAngle).toBe(full!.rawAngle);
  });

  it('[WM-ROT-04] an unturned page is drawn exactly as it always was', async () => {
    // The fix must not move the watermark on the ordinary page, which is every
    // page in almost every document.
    const out = (await visualOriginFraction(await addWatermark(await turnedPage(0), OPTIONS), 0))!;
    expect(out.rawAngle).toBe(OPTIONS.rotation);
  });
});
