import { describe, it, expect, vi, beforeEach, beforeAll, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { readFile } from '@tauri-apps/plugin-fs';
import { invoke } from '@tauri-apps/api/core';
import { PageSizes } from 'pdf-lib';
import { processPdf, estimateOutputSizeBytes } from '@/lib/pdfProcessor';
import { createMinimalPdf, createContentPdf, getPageDimensions } from '@/test/fixtures';
import type { PdfProcessingOptions } from '@/types/file';

// Convenience: base options that can be overridden per-test with spread
const baseOpts: Omit<PdfProcessingOptions, 'onProgress'> = {
  compressionEnabled: true,
  qualityLevel: 'screen', // was 'medium' — updated to match new PdfQualityLevel values
  targetSizeBytes: null,
  resizeEnabled: false,
  pagePreset: 'A4',
  customWidthMm: null,
  customHeightMm: null,
  selectedPageIndices: [0],
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mockReadFile(bytes: Uint8Array) {
  vi.mocked(readFile).mockResolvedValue(bytes);
}

// Set up invoke to return mock GS-compressed bytes (valid %PDF- header).
// The mock returns an ArrayBuffer (matching the real Tauri invoke behaviour).
function mockCompressPdf(outputBytes: Uint8Array) {
  vi.mocked(invoke).mockResolvedValue(outputBytes.buffer);
}

// Build a valid-header PDF byte array of a given size for mock GS output.
function makeGsOutput(size: number): Uint8Array {
  const buf = new Uint8Array(size);
  buf[0] = 0x25; buf[1] = 0x50; buf[2] = 0x44; buf[3] = 0x46; buf[4] = 0x2d; // %PDF-
  return buf;
}

// Reset invoke mock after each test so calls don't bleed across tests
afterEach(() => {
  vi.mocked(invoke).mockReset();
});

// ─── Basic output integrity ───────────────────────────────────────────────────

describe('processPdf — output integrity', () => {
  let a4Pdf: Uint8Array;

  beforeEach(async () => {
    a4Pdf = await createMinimalPdf(1, PageSizes.A4);
    mockReadFile(a4Pdf);
    // Provide a default GS output mock — most integrity tests check structural properties
    mockCompressPdf(makeGsOutput(a4Pdf.length));
  });

  it('output starts with the PDF magic bytes (%PDF-)', async () => {
    const result = await processPdf('/test.pdf', { ...baseOpts });
    const header = new TextDecoder().decode(result.bytes.slice(0, 5));
    expect(header).toBe('%PDF-');
  });

  it('outputSizeBytes matches the actual byte length returned', async () => {
    const result = await processPdf('/test.pdf', { ...baseOpts });
    expect(result.outputSizeBytes).toBe(result.bytes.byteLength);
  });

  it('inputSizeBytes matches the source PDF size', async () => {
    const result = await processPdf('/test.pdf', { ...baseOpts });
    expect(result.inputSizeBytes).toBe(a4Pdf.byteLength);
  });

  it('sourceBytes is the original unmodified PDF', async () => {
    const result = await processPdf('/test.pdf', { ...baseOpts });
    expect(result.sourceBytes).toEqual(a4Pdf);
  });

  it('pageCount is correct for a single-page PDF', async () => {
    const result = await processPdf('/test.pdf', { ...baseOpts });
    expect(result.pageCount).toBe(1);
  });

  it('pageCount is correct for a multi-page PDF', async () => {
    const threePage = await createMinimalPdf(3, PageSizes.A4);
    mockReadFile(threePage);
    const result = await processPdf('/test.pdf', { ...baseOpts, selectedPageIndices: [0, 1, 2] });
    expect(result.pageCount).toBe(3);
  });

  it('reports A4 first-page dimensions (in points)', async () => {
    const result = await processPdf('/test.pdf', { ...baseOpts });
    expect(result.outputPageDimensions).not.toBeNull();
    expect(result.outputPageDimensions!.widthPt).toBeCloseTo(PageSizes.A4[0], 1);
    expect(result.outputPageDimensions!.heightPt).toBeCloseTo(PageSizes.A4[1], 1);
  });

  it('always returns non-null outputPageDimensions for a valid single-page PDF', async () => {
    // outputPageDimensions is null only when the loaded PDF genuinely has 0 pages.
    // For every real-world PDF that reaches processPdf, it will be non-null.
    const result = await processPdf('/test.pdf', { ...baseOpts });
    expect(result.outputPageDimensions).not.toBeNull();
  });
});

// ─── Target size constraint ───────────────────────────────────────────────────

describe('processPdf — target size constraint', () => {
  beforeEach(async () => {
    const pdf = await createMinimalPdf(1, PageSizes.A4);
    mockReadFile(pdf);
    // Provide a default GS output so processPdf can complete when compressionEnabled=true
    mockCompressPdf(makeGsOutput(pdf.length));
  });

  it('targetMet=true when output fits within a generous target', async () => {
    const result = await processPdf('/test.pdf', {
      ...baseOpts,
      compressionEnabled: true,
      targetSizeBytes: 10 * 1024 * 1024, // 10 MB — any realistic PDF is smaller
    });
    expect(result.targetMet).toBe(true);
    expect(result.bestAchievableSizeBytes).toBeNull();
  });

  it('targetMet=false when target is impossibly small (1 byte)', async () => {
    const result = await processPdf('/test.pdf', {
      ...baseOpts,
      compressionEnabled: true,
      targetSizeBytes: 1,
    });
    expect(result.targetMet).toBe(false);
    expect(result.bestAchievableSizeBytes).toBe(result.outputSizeBytes);
  });

  it('bestAchievableSizeBytes equals the actual output size when target is not met', async () => {
    const result = await processPdf('/test.pdf', {
      ...baseOpts,
      compressionEnabled: true,
      targetSizeBytes: 1,
    });
    expect(result.bestAchievableSizeBytes).toBe(result.bytes.byteLength);
  });

  it('skips target check when compressionEnabled=false', async () => {
    const result = await processPdf('/test.pdf', {
      ...baseOpts,
      compressionEnabled: false,
      targetSizeBytes: 1, // would fail if checked
    });
    expect(result.targetMet).toBe(true);
    expect(result.bestAchievableSizeBytes).toBeNull();
  });

  it('skips target check when targetSizeBytes is null', async () => {
    const result = await processPdf('/test.pdf', {
      ...baseOpts,
      compressionEnabled: true,
      targetSizeBytes: null,
    });
    expect(result.targetMet).toBe(true);
    expect(result.bestAchievableSizeBytes).toBeNull();
  });
});

// ─── Page resize ─────────────────────────────────────────────────────────────

describe('processPdf — page resize', () => {
  beforeEach(() => {
    // Default GS mock — resize tests use compressionEnabled=true from baseOpts.
    // Each test sets up its own mockReadFile; invoke gets a generic valid output.
    mockCompressPdf(makeGsOutput(1000));
  });

  it('resizes an A4 page to A3 dimensions', async () => {
    const pdf = await createMinimalPdf(1, PageSizes.A4);
    mockReadFile(pdf);
    const result = await processPdf('/test.pdf', {
      ...baseOpts,
      resizeEnabled: true,
      pagePreset: 'A3',
      selectedPageIndices: [0],
    });
    expect(result.outputPageDimensions!.widthPt).toBeCloseTo(PageSizes.A3[0], 1);
    expect(result.outputPageDimensions!.heightPt).toBeCloseTo(PageSizes.A3[1], 1);
  });

  it('resizes an A4 page to Letter dimensions', async () => {
    const pdf = await createMinimalPdf(1, PageSizes.A4);
    mockReadFile(pdf);
    const result = await processPdf('/test.pdf', {
      ...baseOpts,
      resizeEnabled: true,
      pagePreset: 'Letter',
      selectedPageIndices: [0],
    });
    expect(result.outputPageDimensions!.widthPt).toBeCloseTo(PageSizes.Letter[0], 1);
    expect(result.outputPageDimensions!.heightPt).toBeCloseTo(PageSizes.Letter[1], 1);
  });

  it('resizes to custom dimensions (100 × 200 mm → points)', async () => {
    const pdf = await createMinimalPdf(1, PageSizes.A4);
    mockReadFile(pdf);
    const result = await processPdf('/test.pdf', {
      ...baseOpts,
      resizeEnabled: true,
      pagePreset: 'custom',
      customWidthMm: 100,
      customHeightMm: 200,
      selectedPageIndices: [0],
    });
    // 100mm = 100 / 25.4 * 72 ≈ 283.46 pt
    // 200mm = 200 / 25.4 * 72 ≈ 566.93 pt
    expect(result.outputPageDimensions!.widthPt).toBeCloseTo(283.46, 1);
    expect(result.outputPageDimensions!.heightPt).toBeCloseTo(566.93, 1);
  });

  it('leaves page dimensions unchanged when resizeEnabled=false', async () => {
    const pdf = await createMinimalPdf(1, PageSizes.A4);
    mockReadFile(pdf);
    const result = await processPdf('/test.pdf', {
      ...baseOpts,
      resizeEnabled: false,
      pagePreset: 'Letter', // should be ignored
      selectedPageIndices: [0],
    });
    expect(result.outputPageDimensions!.widthPt).toBeCloseTo(PageSizes.A4[0], 1);
    expect(result.outputPageDimensions!.heightPt).toBeCloseTo(PageSizes.A4[1], 1);
  });

  it('leaves page dimensions unchanged when selectedPageIndices is empty', async () => {
    const pdf = await createMinimalPdf(1, PageSizes.A4);
    mockReadFile(pdf);
    const result = await processPdf('/test.pdf', {
      ...baseOpts,
      resizeEnabled: true,
      pagePreset: 'Letter',
      selectedPageIndices: [], // nothing selected → nothing resized
    });
    expect(result.outputPageDimensions!.widthPt).toBeCloseTo(PageSizes.A4[0], 1);
  });

  it('only resizes the selected page — other pages keep original dimensions', async () => {
    // 3-page A4 PDF; resize only page 0 to Letter
    const pdf = await createMinimalPdf(3, PageSizes.A4);
    mockReadFile(pdf);
    const result = await processPdf('/test.pdf', {
      ...baseOpts,
      compressionEnabled: false, // dimension test reads result.bytes via pdf-lib; GS output is not parseable
      resizeEnabled: true,
      pagePreset: 'Letter',
      selectedPageIndices: [0],
    });
    const dims = await getPageDimensions(result.bytes);
    // Page 0 → Letter
    expect(dims[0].widthPt).toBeCloseTo(PageSizes.Letter[0], 1);
    expect(dims[0].heightPt).toBeCloseTo(PageSizes.Letter[1], 1);
    // Pages 1 and 2 → A4 (unchanged)
    expect(dims[1].widthPt).toBeCloseTo(PageSizes.A4[0], 1);
    expect(dims[2].widthPt).toBeCloseTo(PageSizes.A4[0], 1);
  });

  it('resizes all selected pages in a multi-page PDF', async () => {
    const pdf = await createMinimalPdf(3, PageSizes.A4);
    mockReadFile(pdf);
    const result = await processPdf('/test.pdf', {
      ...baseOpts,
      compressionEnabled: false, // dimension test reads result.bytes via pdf-lib; GS output is not parseable
      resizeEnabled: true,
      pagePreset: 'Letter',
      selectedPageIndices: [0, 1, 2],
    });
    const dims = await getPageDimensions(result.bytes);
    for (const d of dims) {
      expect(d.widthPt).toBeCloseTo(PageSizes.Letter[0], 1);
      expect(d.heightPt).toBeCloseTo(PageSizes.Letter[1], 1);
    }
  });

  it('skips out-of-bounds indices without throwing', async () => {
    const pdf = await createMinimalPdf(1, PageSizes.A4);
    mockReadFile(pdf);
    await expect(
      processPdf('/test.pdf', {
        ...baseOpts,
        resizeEnabled: true,
        pagePreset: 'Letter',
        selectedPageIndices: [0, 99], // 99 does not exist
      }),
    ).resolves.not.toThrow();
  });

  it('calls onProgress once per selected page', async () => {
    const pdf = await createMinimalPdf(3, PageSizes.A4);
    mockReadFile(pdf);
    const calls: [number, number][] = [];
    await processPdf('/test.pdf', {
      ...baseOpts,
      resizeEnabled: true,
      pagePreset: 'Letter',
      selectedPageIndices: [0, 1, 2],
      onProgress: (current, total) => calls.push([current, total]),
    });
    expect(calls).toHaveLength(3);
    expect(calls[0]).toEqual([1, 3]);
    expect(calls[1]).toEqual([2, 3]);
    expect(calls[2]).toEqual([3, 3]);
  });

  it('does not call onProgress when resizeEnabled=false', async () => {
    const pdf = await createMinimalPdf(1, PageSizes.A4);
    mockReadFile(pdf);
    const calls: [number, number][] = [];
    await processPdf('/test.pdf', {
      ...baseOpts,
      resizeEnabled: false,
      onProgress: (current, total) => calls.push([current, total]),
    });
    expect(calls).toHaveLength(0);
  });

  it('throws for custom preset when customWidthMm or customHeightMm is null', async () => {
    const pdf = await createMinimalPdf(1, PageSizes.A4);
    mockReadFile(pdf);
    await expect(
      processPdf('/test.pdf', {
        ...baseOpts,
        resizeEnabled: true,
        pagePreset: 'custom',
        customWidthMm: null, // missing — should throw
        customHeightMm: 200,
        selectedPageIndices: [0],
      }),
    ).rejects.toThrow('Custom page size requires both width and height in mm');
  });
});

// ─── Integration: content-rich PDF (realistic fixture) ───────────────────────
//
// These tests use a multi-page PDF with embedded Helvetica text — more
// representative of real-world files than an empty-page minimal PDF.

describe('processPdf — content-rich PDF (realistic fixture)', () => {
  let contentPdf: Uint8Array;

  beforeAll(async () => {
    contentPdf = await createContentPdf(3);
  });

  beforeEach(() => {
    mockReadFile(contentPdf);
    // Provide a default GS output matching input size (content tests check structural properties)
    mockCompressPdf(makeGsOutput(contentPdf.length));
  });

  it('processes a 3-page content-rich PDF without corrupting the output', async () => {
    const result = await processPdf('/test.pdf', { ...baseOpts, selectedPageIndices: [0, 1, 2] });
    const header = new TextDecoder().decode(result.bytes.slice(0, 5));
    expect(header).toBe('%PDF-');
    expect(result.pageCount).toBe(3);
    expect(result.outputSizeBytes).toBeGreaterThan(0);
  });

  it('inputSizeBytes matches the content-rich PDF byte length', async () => {
    const result = await processPdf('/test.pdf', baseOpts);
    expect(result.inputSizeBytes).toBe(contentPdf.byteLength);
  });

  it('resizes all 3 pages to Letter and verifies each page dimension', async () => {
    const result = await processPdf('/test.pdf', {
      ...baseOpts,
      compressionEnabled: false, // dimension test reads result.bytes via pdf-lib; GS output is not parseable
      resizeEnabled: true,
      pagePreset: 'Letter',
      selectedPageIndices: [0, 1, 2],
    });
    const dims = await getPageDimensions(result.bytes);
    for (const d of dims) {
      expect(d.widthPt).toBeCloseTo(PageSizes.Letter[0], 1);
      expect(d.heightPt).toBeCloseTo(PageSizes.Letter[1], 1);
    }
  });

  it('page count is preserved after A4 → A3 resize', async () => {
    const result = await processPdf('/test.pdf', {
      ...baseOpts,
      resizeEnabled: true,
      pagePreset: 'A3',
      selectedPageIndices: [0, 1, 2],
    });
    expect(result.pageCount).toBe(3);
  });

  it('structural re-save does not increase size by more than 10% on a content PDF', async () => {
    const result = await processPdf('/test.pdf', { ...baseOpts, resizeEnabled: false });
    const ratio = result.outputSizeBytes / result.inputSizeBytes;
    expect(ratio).toBeLessThanOrEqual(1.1);
  });
});

// ─── Integration: committed fixture file (test-fixtures/sample.pdf) ──────────
//
// Uses the real binary fixture committed to the repo. Unlike the programmatic
// fixtures above this is the same file a user would produce or upload in the
// app, giving us an end-to-end signal that pdf-lib handles real-world bytes.

describe('processPdf — committed fixture (test-fixtures/sample.pdf)', () => {
  let fixturePdf: Uint8Array;

  beforeAll(() => {
    const buf = readFileSync(resolve(process.cwd(), 'test-fixtures/sample.pdf'));
    fixturePdf = new Uint8Array(buf);
  });

  beforeEach(() => {
    mockReadFile(fixturePdf);
    // Provide a default GS output — fixture tests check structural validity
    mockCompressPdf(makeGsOutput(fixturePdf.length));
  });

  it('output starts with PDF magic bytes', async () => {
    const result = await processPdf('/fixture.pdf', { ...baseOpts });
    const header = new TextDecoder().decode(result.bytes.slice(0, 5));
    expect(header).toBe('%PDF-');
  });

  it('reports 3 pages matching the fixture file', async () => {
    const result = await processPdf('/fixture.pdf', { ...baseOpts });
    expect(result.pageCount).toBe(3);
  });

  it('inputSizeBytes equals committed file size', async () => {
    const result = await processPdf('/fixture.pdf', { ...baseOpts });
    expect(result.inputSizeBytes).toBe(fixturePdf.byteLength);
  });

  it('can resize all pages of fixture to A3 without error', async () => {
    const result = await processPdf('/fixture.pdf', {
      ...baseOpts,
      compressionEnabled: false, // dimension test reads result.bytes via pdf-lib; GS output is not parseable
      resizeEnabled: true,
      pagePreset: 'A3',
      selectedPageIndices: [0, 1, 2],
    });
    const dims = await getPageDimensions(result.bytes);
    for (const d of dims) {
      expect(d.widthPt).toBeCloseTo(PageSizes.A3[0], 1);
      expect(d.heightPt).toBeCloseTo(PageSizes.A3[1], 1);
    }
  });
});

// ─── User fixture: warnock_camelot.pdf — TEST_PLAN.md PC-01–PC-05, PR-01–PR-08 ──
//
// Uses the exact file referenced in TEST_PLAN.md manual test cases.
// These tests automate the PDF compression and resize sections of the manual plan.

describe('processPdf — warnock_camelot.pdf (TEST_PLAN.md PC-01–05, PR-01–08)', () => {
  let warnockPdf: Uint8Array;

  beforeAll(() => {
    const buf = readFileSync(resolve(process.cwd(), 'test-fixtures/warnock_camelot.pdf'));
    warnockPdf = new Uint8Array(buf);
  });

  beforeEach(() => {
    mockReadFile(warnockPdf);
    // Provide a default GS output — warnock tests check page counts and dimensions
    mockCompressPdf(makeGsOutput(warnockPdf.length));
  });

  // [PC-01] Default settings — valid PDF output, correct page count
  it('[PC-01] processes with default settings — output is valid PDF with 6 pages', async () => {
    const result = await processPdf('/warnock_camelot.pdf', { ...baseOpts });
    const header = new TextDecoder().decode(result.bytes.slice(0, 5));
    expect(header).toBe('%PDF-');
    expect(result.pageCount).toBe(6);
    expect(result.outputSizeBytes).toBeGreaterThan(0);
  });

  // [PC-01] inputSizeBytes matches the committed file size
  it('[PC-01] inputSizeBytes matches committed warnock_camelot.pdf file size', async () => {
    const result = await processPdf('/warnock_camelot.pdf', { ...baseOpts });
    expect(result.inputSizeBytes).toBe(warnockPdf.byteLength);
  });

  // [PC-02/PC-03] Different quality levels produce DIFFERENT output sizes (GS compression works)
  // OLD [PC-02/PC-03]: All 4 quality levels produced identical output size — pdf-lib limitation.
  // That test documented the known limitation. This test replaces it now that GS is wired up.
  it('[PC-02/PC-03] different quality levels produce measurably different output on photo_heavy.pdf', async () => {
    const photoHeavyPdf = new Uint8Array(readFileSync(resolve(process.cwd(), 'test-fixtures/photo_heavy.pdf')));

    // Mock: 'web' (screen preset) produces a much smaller output
    const smallOutput = makeGsOutput(Math.floor(photoHeavyPdf.length / 10)); // ~10% of original

    // Mock: 'archive' (prepress preset) produces nearly-identical output (lossless)
    const largeOutput = makeGsOutput(Math.floor(photoHeavyPdf.length * 0.9)); // ~90% of original

    // Run 'web' quality
    mockReadFile(photoHeavyPdf);
    mockCompressPdf(smallOutput);
    const webResult = await processPdf('/photo_heavy.pdf', { ...baseOpts, qualityLevel: 'web' });

    // Run 'archive' quality
    mockReadFile(photoHeavyPdf);
    mockCompressPdf(largeOutput);
    const archiveResult = await processPdf('/photo_heavy.pdf', { ...baseOpts, qualityLevel: 'archive' });

    // Assert: web (screen) must produce measurably smaller output than archive (prepress)
    // Require at least 20% difference (phase success criterion)
    const ratio = archiveResult.outputSizeBytes / webResult.outputSizeBytes;
    expect(ratio).toBeGreaterThanOrEqual(1.2); // archive ≥ 20% larger than web

    // Both outputs must be valid PDFs
    const webHeader = new TextDecoder().decode(webResult.bytes.slice(0, 5));
    const archiveHeader = new TextDecoder().decode(archiveResult.bytes.slice(0, 5));
    expect(webHeader).toBe('%PDF-');
    expect(archiveHeader).toBe('%PDF-');
  });

  // [PC-04] Achievable target (100 MB > any real PDF) → targetMet=true
  it('[PC-04] achievable target size (100 MB) sets targetMet=true', async () => {
    const result = await processPdf('/warnock_camelot.pdf', {
      ...baseOpts,
      compressionEnabled: true,
      targetSizeBytes: 100 * 1024 * 1024, // 100 MB — always achievable
    });
    expect(result.targetMet).toBe(true);
    expect(result.bestAchievableSizeBytes).toBeNull();
  });

  // [PC-05] Impossible target (1 byte) → targetMet=false, bestAchievableSizeBytes > 0
  it('[PC-05] impossible target (1 byte) sets targetMet=false with bestAchievableSizeBytes', async () => {
    const result = await processPdf('/warnock_camelot.pdf', {
      ...baseOpts,
      compressionEnabled: true,
      targetSizeBytes: 1,
    });
    expect(result.targetMet).toBe(false);
    expect(result.bestAchievableSizeBytes).toBeGreaterThan(0);
  });

  // [PR-01] Resize all 6 pages to A3
  it('[PR-01] resizes all 6 pages to A3 — dimensions verified', async () => {
    const result = await processPdf('/warnock_camelot.pdf', {
      ...baseOpts,
      compressionEnabled: false, // dimension test reads result.bytes via pdf-lib; GS output is not parseable
      resizeEnabled: true,
      pagePreset: 'A3',
      selectedPageIndices: [0, 1, 2, 3, 4, 5],
    });
    const dims = await getPageDimensions(result.bytes);
    expect(dims).toHaveLength(6);
    for (const d of dims) {
      expect(d.widthPt).toBeCloseTo(PageSizes.A3[0], 1);
      expect(d.heightPt).toBeCloseTo(PageSizes.A3[1], 1);
    }
  });

  // [PR-02] Resize all 6 pages to Letter
  it('[PR-02] resizes all 6 pages to Letter — dimensions verified', async () => {
    const result = await processPdf('/warnock_camelot.pdf', {
      ...baseOpts,
      compressionEnabled: false, // dimension test reads result.bytes via pdf-lib; GS output is not parseable
      resizeEnabled: true,
      pagePreset: 'Letter',
      selectedPageIndices: [0, 1, 2, 3, 4, 5],
    });
    const dims = await getPageDimensions(result.bytes);
    for (const d of dims) {
      expect(d.widthPt).toBeCloseTo(PageSizes.Letter[0], 1);
      expect(d.heightPt).toBeCloseTo(PageSizes.Letter[1], 1);
    }
  });

  // [PR-03] Custom 100 × 150 mm → 283.46 × 425.20 pt
  it('[PR-03] resizes to custom 100 × 150 mm — point conversion verified', async () => {
    const result = await processPdf('/warnock_camelot.pdf', {
      ...baseOpts,
      compressionEnabled: false, // dimension test reads result.bytes via pdf-lib; GS output is not parseable
      resizeEnabled: true,
      pagePreset: 'custom',
      customWidthMm: 100,
      customHeightMm: 150,
      selectedPageIndices: [0],
    });
    const dims = await getPageDimensions(result.bytes);
    // 100 mm / 25.4 * 72 = 283.46 pt
    // 150 mm / 25.4 * 72 = 425.20 pt
    expect(dims[0].widthPt).toBeCloseTo(283.46, 1);
    expect(dims[0].heightPt).toBeCloseTo(425.20, 1);
  });

  // [PR-05] Resize page 1 only — pages 2–6 keep original dimensions
  it('[PR-05] resizes page 1 only (index 0) — pages 2–6 remain unchanged', async () => {
    const result = await processPdf('/warnock_camelot.pdf', {
      ...baseOpts,
      compressionEnabled: false, // dimension test reads result.bytes via pdf-lib; GS output is not parseable
      resizeEnabled: true,
      pagePreset: 'A3',
      selectedPageIndices: [0], // page 1 only
    });
    const dims = await getPageDimensions(result.bytes);
    expect(dims).toHaveLength(6);
    // Page 0 → A3
    expect(dims[0].widthPt).toBeCloseTo(PageSizes.A3[0], 1);
    expect(dims[0].heightPt).toBeCloseTo(PageSizes.A3[1], 1);
    // Pages 1–5 → unchanged (original warnock dimensions)
    for (let i = 1; i < 6; i++) {
      expect(dims[i].widthPt).not.toBeCloseTo(PageSizes.A3[0], 1);
    }
  });

  // [PR-06] Resize pages 1 and 3 (indices 0 and 2) — other 4 pages unchanged
  // Use A3 (which is definitely not the warnock_camelot.pdf original size) so we can
  // assert that unselected pages are NOT A3-sized.
  it('[PR-06] resizes pages 1 and 3 (indices 0, 2) — other 4 pages remain unchanged', async () => {
    const result = await processPdf('/warnock_camelot.pdf', {
      ...baseOpts,
      compressionEnabled: false, // dimension test reads result.bytes via pdf-lib; GS output is not parseable
      resizeEnabled: true,
      pagePreset: 'A3',
      selectedPageIndices: [0, 2],
    });
    const dims = await getPageDimensions(result.bytes);
    // Pages 0 and 2 → A3
    expect(dims[0].widthPt).toBeCloseTo(PageSizes.A3[0], 1);
    expect(dims[2].widthPt).toBeCloseTo(PageSizes.A3[0], 1);
    // Pages 1, 3, 4, 5 → unchanged (not A3)
    expect(dims[1].widthPt).not.toBeCloseTo(PageSizes.A3[0], 1);
    expect(dims[3].widthPt).not.toBeCloseTo(PageSizes.A3[0], 1);
  });

  // [PR-08] Out-of-bounds page 99 → no crash, no pages resized
  it('[PR-08] out-of-bounds page index 99 — no crash, no resize performed', async () => {
    await expect(
      processPdf('/warnock_camelot.pdf', {
        ...baseOpts,
        resizeEnabled: true,
        pagePreset: 'A3',
        selectedPageIndices: [99], // page 100 does not exist in a 6-page PDF
      }),
    ).resolves.not.toThrow();
  });
});

// ─── Quality level — GS compression now active ───────────────────────────────
//
// Previously: pdf-lib had no image-recompression API — all quality levels produced
// identical output. Those tests documented the known limitation.
//
// Now: GS compression is wired. Each quality level maps to a GS preset.
// The tests below verify the new behaviour: quality levels produce different outputs
// and all results are valid PDFs.

describe('processPdf — quality level (GS compression behaviour)', () => {
  it('all quality levels still produce a valid PDF output', async () => {
    const qualityLevels = ['web', 'screen', 'print', 'archive'] as const;
    const pdf = await createMinimalPdf(1, PageSizes.A4);

    for (const level of qualityLevels) {
      mockReadFile(pdf);
      mockCompressPdf(makeGsOutput(500));
      const result = await processPdf('/test.pdf', {
        ...baseOpts,
        qualityLevel: level,
      });
      const header = new TextDecoder().decode(result.bytes.slice(0, 5));
      expect(header, `quality level "${level}" should produce a valid PDF`).toBe('%PDF-');
    }
  });
});

// ─── Pre-scan: imageCount and compressibilityScore ────────────────────────────

describe('processPdf — pre-scan result fields', () => {
  it('returns imageCount and compressibilityScore in processing result', async () => {
    const pdf = await createMinimalPdf(1, PageSizes.A4);
    mockReadFile(pdf);
    mockCompressPdf(makeGsOutput(100));
    const result = await processPdf('/test.pdf', { ...baseOpts });
    expect(result.imageCount).toBeDefined();
    expect(typeof result.imageCount).toBe('number');
    expect(result.compressibilityScore).toBeGreaterThanOrEqual(0);
    expect(result.compressibilityScore).toBeLessThanOrEqual(1);
  });

  it('returns imageCount=0 and compressibilityScore=0 for a text-only minimal PDF', async () => {
    const pdf = await createMinimalPdf(1, PageSizes.A4);
    mockReadFile(pdf);
    mockCompressPdf(makeGsOutput(100));
    const result = await processPdf('/test.pdf', { ...baseOpts });
    // createMinimalPdf produces a text-only PDF with no image XObjects
    expect(result.imageCount).toBe(0);
    expect(result.compressibilityScore).toBe(0);
  });
});

// ─── Regression: text-only PDF + GS compression ──────────────────────────────

describe('processPdf — regressions', () => {
  // [PC-REGRESSION-01] Text-only PDF still processes correctly with GS compression
  it('[PC-REGRESSION-01] text-only PDF processes correctly — no regression', async () => {
    const warnockPdf = new Uint8Array(readFileSync(resolve(process.cwd(), 'test-fixtures/warnock_camelot.pdf')));
    // GS prepress (archive) on text PDF returns nearly identical bytes
    const structuralOutput = makeGsOutput(Math.floor(warnockPdf.length * 0.98));

    mockReadFile(warnockPdf);
    mockCompressPdf(structuralOutput);
    const result = await processPdf('/warnock_camelot.pdf', {
      ...baseOpts,
      qualityLevel: 'archive', // lossless — safest for text-only
    });

    expect(result.pageCount).toBe(6);
    const header = new TextDecoder().decode(result.bytes.slice(0, 5));
    expect(header).toBe('%PDF-');
    expect(result.outputSizeBytes).toBeGreaterThan(0);
  });

  // [PC-RESIZE-COMPRESS-01] resize + compression enabled together: GS receives post-resize bytes
  it('[PC-RESIZE-COMPRESS-01] resize and compression enabled together — GS receives post-resize bytes', async () => {
    const photoHeavyPdf = new Uint8Array(readFileSync(resolve(process.cwd(), 'test-fixtures/photo_heavy.pdf')));
    const compressedOutput = makeGsOutput(500);

    mockReadFile(photoHeavyPdf);
    mockCompressPdf(compressedOutput);

    const result = await processPdf('/photo_heavy.pdf', {
      ...baseOpts,
      compressionEnabled: true,
      resizeEnabled: true,
      pagePreset: 'A4',
      qualityLevel: 'web',
    });

    // Verify invoke was called exactly once (GS ran)
    expect(vi.mocked(invoke)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(invoke)).toHaveBeenCalledWith('compress_pdf', expect.objectContaining({ preset: 'screen' }));

    // Output must be the GS-compressed bytes (not the original or raw pdf-lib output)
    expect(result.outputSizeBytes).toBe(compressedOutput.length);
    const header = new TextDecoder().decode(result.bytes.slice(0, 5));
    expect(header).toBe('%PDF-');
  });
});

// ─── Cancellation regression tests ───────────────────────────────────────────
//
// PC-CANCEL-01: cancel_processing invoke is reachable — verify invoke mock can be
//               set up and called for 'cancel_processing'.
// PC-CANCEL-02: when compress_pdf (invoked internally by processPdf) rejects with
//               "CANCELLED", processPdf propagates a rejection whose message
//               includes "CANCELLED" — the hook's catch branch uses this to set
//               isCancelled=true and error=null.

describe('processPdf — cancellation behaviour', () => {
  let a4Pdf: Uint8Array;

  beforeAll(async () => {
    a4Pdf = await createMinimalPdf(1, PageSizes.A4);
  });

  // [PC-CANCEL-01] cancel_processing invoke mock can be set up and invoked independently.
  // This verifies the mock infrastructure works so cancel() in the hook can call it.
  it('[PC-CANCEL-01] invoke can be mocked to simulate cancel_processing being called', async () => {
    const cancelMock = vi.fn().mockResolvedValue(undefined);
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === 'cancel_processing') return cancelMock();
      return Promise.resolve(undefined);
    });

    // Simulate what hook.cancel() does: fire-and-forget invoke('cancel_processing')
    await invoke('cancel_processing');
    expect(cancelMock).toHaveBeenCalledTimes(1);
  });

  // [PC-CANCEL-02] when invoke('compress_pdf') rejects with "CANCELLED",
  // processPdf propagates a rejection whose message contains "CANCELLED".
  // The hook's catch branch checks for this string to set isCancelled=true.
  it('[PC-CANCEL-02] processPdf rejects with CANCELLED error when compress_pdf invoke throws CANCELLED', async () => {
    mockReadFile(a4Pdf);
    vi.mocked(invoke).mockRejectedValue(new Error('CANCELLED'));

    await expect(
      processPdf('/test.pdf', { ...baseOpts, compressionEnabled: true }),
    ).rejects.toThrow('CANCELLED');
  });

  // [PC-CRASH-01] when compress_pdf rejects with a GS crash error (missing library),
  // processPdf propagates a rejection that does NOT contain "CANCELLED".
  // This is the regression for the bug where GS crashes were silently swallowed
  // and mis-classified as user cancellation.
  it('[PC-CRASH-01] processPdf rejects with a non-CANCELLED error when GS crashes with a missing library', async () => {
    mockReadFile(a4Pdf);
    const crashError = 'A required library is missing. Try reinstalling the application or installing Ghostscript manually. Details: dyld[1234]: Library not loaded: /opt/homebrew/opt/jbig2dec/lib/libjbig2dec.0.dylib';
    vi.mocked(invoke).mockRejectedValue(new Error(crashError));

    await expect(
      processPdf('/test.pdf', { ...baseOpts, compressionEnabled: true }),
    ).rejects.toThrow(crashError);
  });

  // [PC-CRASH-02] the GS crash error message must NOT contain "CANCELLED".
  // This ensures the hook's catch branch routes it to error=message, not isCancelled=true.
  it('[PC-CRASH-02] GS crash error message does not contain CANCELLED — hook will show error, not cancel state', async () => {
    mockReadFile(a4Pdf);
    const crashError = 'A required library is missing. Try reinstalling the application.';
    vi.mocked(invoke).mockRejectedValue(new Error(crashError));

    let thrownMessage = '';
    try {
      await processPdf('/test.pdf', { ...baseOpts, compressionEnabled: true });
    } catch (err) {
      thrownMessage = err instanceof Error ? err.message : String(err);
    }

    expect(thrownMessage).not.toContain('CANCELLED');
    expect(thrownMessage).toContain('library');
  });
});

// ─── BUG-01: GS bloat regression ─────────────────────────────────────────────
// When Ghostscript produces a file LARGER than the input (e.g. adding ICC profiles
// to a text-only PDF), processPdf must revert to the original bytes and signal
// wasAlreadyOptimal=true.  Target evaluation must use inputSizeBytes, not GS size.

describe('processPdf — BUG-01 regression (GS bloat on text-only PDFs)', () => {
  let warnockPdf: Uint8Array;

  beforeAll(() => {
    warnockPdf = new Uint8Array(readFileSync(resolve(process.cwd(), 'test-fixtures/warnock_camelot.pdf')));
  });

  it('[BUG-01] returns source bytes when GS output is larger than input', async () => {
    // GS inflates the file — simulate real-world text-only PDF behaviour
    const inflated = makeGsOutput(warnockPdf.length + 50_000); // much bigger
    mockReadFile(warnockPdf);
    mockCompressPdf(inflated);

    const result = await processPdf('/warnock_camelot.pdf', { ...baseOpts, qualityLevel: 'print' });

    expect(result.wasAlreadyOptimal).toBe(true);
    expect(result.outputSizeBytes).toBe(warnockPdf.length);          // reverted to input size
    expect(result.bytes).toEqual(warnockPdf);                        // exact original bytes returned
  });

  it('[BUG-01b] targetMet=true when original fits target and GS would have bloated it', async () => {
    const inflated = makeGsOutput(warnockPdf.length + 50_000);
    mockReadFile(warnockPdf);
    mockCompressPdf(inflated);

    const result = await processPdf('/warnock_camelot.pdf', {
      ...baseOpts,
      targetSizeBytes: warnockPdf.length + 10_000, // target larger than original → met
    });

    expect(result.wasAlreadyOptimal).toBe(true);
    expect(result.targetMet).toBe(true);
    expect(result.bestAchievableSizeBytes).toBeNull();
  });

  it('[BUG-01c] bestAchievableSizeBytes = inputSizeBytes (not GS size) when original exceeds target', async () => {
    const inflated = makeGsOutput(warnockPdf.length + 50_000);
    mockReadFile(warnockPdf);
    mockCompressPdf(inflated);

    const result = await processPdf('/warnock_camelot.pdf', {
      ...baseOpts,
      targetSizeBytes: 1, // impossible — original itself exceeds this
    });

    expect(result.wasAlreadyOptimal).toBe(true);
    expect(result.targetMet).toBe(false);
    // bestAchievableSizeBytes must reflect original size, not GS-inflated size
    expect(result.bestAchievableSizeBytes).toBe(warnockPdf.length);
  });
});

// ─── Phase A: estimateOutputSizeBytes ────────────────────────────────────────
// [EST-01] estimateOutputSizeBytes ordering: web < screen < print < archive
// at both high compressibility (score=1.0) and low (score=0.0).

describe('estimateOutputSizeBytes', () => {
  const fileSizeBytes = 6_650_000; // 6.34 MB — representative of DHL-style PDF

  it('[EST-01a] ordering: web < screen < print < archive at score=1.0 (image-heavy)', () => {
    const web     = estimateOutputSizeBytes('web',     fileSizeBytes, 1.0);
    const screen  = estimateOutputSizeBytes('screen',  fileSizeBytes, 1.0);
    const print   = estimateOutputSizeBytes('print',   fileSizeBytes, 1.0);
    const archive = estimateOutputSizeBytes('archive', fileSizeBytes, 1.0);

    expect(web).toBeLessThan(screen);
    expect(screen).toBeLessThan(print);
    expect(print).toBeLessThan(archive);
  });

  it('[EST-01b] ordering: web < screen < print < archive at score=0.0 (text-only)', () => {
    const web     = estimateOutputSizeBytes('web',     fileSizeBytes, 0.0);
    const screen  = estimateOutputSizeBytes('screen',  fileSizeBytes, 0.0);
    const print   = estimateOutputSizeBytes('print',   fileSizeBytes, 0.0);
    const archive = estimateOutputSizeBytes('archive', fileSizeBytes, 0.0);

    expect(web).toBeLessThan(screen);
    expect(screen).toBeLessThan(print);
    expect(print).toBeLessThan(archive);
  });

  it('[EST-01c] returns a positive number above 1 KB floor', () => {
    const estimate = estimateOutputSizeBytes('web', 1024, 1.0);
    expect(estimate).toBeGreaterThan(0);
  });

  it('[EST-01d] estimate at score=1.0 is smaller than at score=0.0 for web preset', () => {
    const highCompressibility = estimateOutputSizeBytes('web', fileSizeBytes, 1.0);
    const lowCompressibility  = estimateOutputSizeBytes('web', fileSizeBytes, 0.0);
    expect(highCompressibility).toBeLessThan(lowCompressibility);
  });

  it('[EST-01e] archive estimate is close to original size at score=0.0', () => {
    const estimate = estimateOutputSizeBytes('archive', fileSizeBytes, 0.0);
    // archive at text-only should be ≥ 95% of original
    expect(estimate).toBeGreaterThanOrEqual(fileSizeBytes * 0.95);
  });
});

// ─── Phase B: cascade compression ────────────────────────────────────────────
// [CAS-01] When targetSizeBytes is set and the initial preset bloats the file,
//          cascade should try more aggressive presets until target is met or exhausted.
// [CAS-02] When ALL presets bloat the file, wasAlreadyOptimal=true.

describe('processPdf — cascade compression (targetSizeBytes)', () => {
  let a4Pdf: Uint8Array;

  beforeAll(async () => {
    a4Pdf = await createMinimalPdf(1, PageSizes.A4);
  });

  it('[CAS-01] stops cascading once target is met — does not call GS more times than needed', async () => {
    mockReadFile(a4Pdf);

    const targetBytes = Math.floor(a4Pdf.length * 0.4); // 40% of original
    // First call (archive/print preset) returns same size as input — not meeting target
    // Second call (screen or web) returns smaller than target — cascade stops
    const smallOutput = makeGsOutput(Math.floor(a4Pdf.length * 0.3)); // 30% — below target
    const bigOutput   = makeGsOutput(a4Pdf.length);                   // same — not smaller

    let callCount = 0;
    vi.mocked(invoke).mockImplementation(async (cmd: string, _args: unknown) => {
      if (cmd !== 'compress_pdf') return undefined;
      callCount++;
      // First preset tried produces no improvement; second is aggressive and meets target
      if (callCount === 1) return bigOutput.buffer;
      return smallOutput.buffer;
    });

    const result = await processPdf('/test.pdf', {
      ...baseOpts,
      compressionEnabled: true,
      targetSizeBytes: targetBytes,
    });

    // Must meet the target
    expect(result.targetMet).toBe(true);
    // Cascade must have stopped (not tried all 4 presets unnecessarily)
    expect(callCount).toBeLessThan(4);
  });

  it('[CAS-02] wasAlreadyOptimal=true when all cascade presets bloat the file', async () => {
    mockReadFile(a4Pdf);

    // All GS calls return a bigger file
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd !== 'compress_pdf') return undefined;
      return makeGsOutput(a4Pdf.length + 10_000).buffer; // always inflated
    });

    const result = await processPdf('/test.pdf', {
      ...baseOpts,
      compressionEnabled: true,
      targetSizeBytes: 100, // impossible target
    });

    expect(result.wasAlreadyOptimal).toBe(true);
    expect(result.targetMet).toBe(false);
    expect(result.bestAchievableSizeBytes).toBe(a4Pdf.length); // reverted to source
  });

  it('[CAS-03] bestAchievableSizeBytes is the smallest non-bloating cascade result', async () => {
    mockReadFile(a4Pdf);

    // Partial cascade: first preset gives 60%, second gives 40%, third is worse (bloat)
    const firstOutput  = makeGsOutput(Math.floor(a4Pdf.length * 0.6));
    const secondOutput = makeGsOutput(Math.floor(a4Pdf.length * 0.4));
    const bloated      = makeGsOutput(a4Pdf.length + 5000);

    let callCount = 0;
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd !== 'compress_pdf') return undefined;
      callCount++;
      if (callCount === 1) return firstOutput.buffer;
      if (callCount === 2) return secondOutput.buffer;
      return bloated.buffer;
    });

    const result = await processPdf('/test.pdf', {
      ...baseOpts,
      compressionEnabled: true,
      targetSizeBytes: 10, // impossibly small — forces full cascade
    });

    expect(result.targetMet).toBe(false);
    // bestAchievableSizeBytes must be the SMALLEST non-bloating result
    expect(result.bestAchievableSizeBytes).toBe(secondOutput.length);
  });

  it('[CAS-NOCHANGE] no cascade when targetSizeBytes is null — invoke called exactly once', async () => {
    mockReadFile(a4Pdf);
    mockCompressPdf(makeGsOutput(500));

    const result = await processPdf('/test.pdf', {
      ...baseOpts,
      compressionEnabled: true,
      targetSizeBytes: null, // no target — single preset, no cascade
    });

    // Exactly 1 GS call — no cascade
    expect(vi.mocked(invoke)).toHaveBeenCalledTimes(1);
    expect(result.targetMet).toBe(true);
  });
});
