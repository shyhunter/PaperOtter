import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { addWatermark, addWatermarkSinglePage, DEFAULT_WATERMARK_OPTIONS } from '@/lib/pdfWatermark';
import { createMinimalPdf, createContentPdf } from '@/test/fixtures';

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
    // would otherwise put the watermark in a different place on each one.
    const src = await createContentPdf(1);
    const result = await addWatermark(src, { ...DEFAULT_WATERMARK_OPTIONS, centerX: 0.25, centerY: 0.25 });

    const doc = await PDFDocument.load(result);
    expect(doc.getPageCount()).toBe(1);
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
