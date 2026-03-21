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
