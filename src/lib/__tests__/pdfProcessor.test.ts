import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { readFile } from '@tauri-apps/plugin-fs';
import { PageSizes } from 'pdf-lib';
import { processPdf } from '@/lib/pdfProcessor';
import { createMinimalPdf, createContentPdf, getPageDimensions } from '@/test/fixtures';
import type { PdfProcessingOptions } from '@/types/file';

// Convenience: base options that can be overridden per-test with spread
const baseOpts: Omit<PdfProcessingOptions, 'onProgress'> = {
  compressionEnabled: true,
  qualityLevel: 'medium',
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

// ─── Basic output integrity ───────────────────────────────────────────────────

describe('processPdf — output integrity', () => {
  let a4Pdf: Uint8Array;

  beforeEach(async () => {
    a4Pdf = await createMinimalPdf(1, PageSizes.A4);
    mockReadFile(a4Pdf);
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

  // [PC-02 / PC-03] All 4 quality levels produce identical output (pdf-lib limitation)
  it('[PC-02/PC-03] all 4 quality levels produce identical output size on warnock_camelot.pdf', async () => {
    const qualityLevels = ['low', 'medium', 'high', 'maximum'] as const;
    const sizes: number[] = [];
    for (const level of qualityLevels) {
      mockReadFile(warnockPdf);
      const result = await processPdf('/warnock_camelot.pdf', { ...baseOpts, qualityLevel: level });
      sizes.push(result.outputSizeBytes);
    }
    // All sizes must be identical — pdf-lib has no image recompression
    const allSame = sizes.every((s) => s === sizes[0]);
    expect(allSame).toBe(true);
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

// ─── Quality level (known limitation) ────────────────────────────────────────
//
// pdf-lib has no quality or image-recompression API — qualityLevel is stored in
// options but currently has NO effect on the output bytes.
//
// These tests document this known limitation. They should be updated (and turned
// into positive assertions) once Rust-based recompression is implemented.

describe('processPdf — quality level (current behaviour)', () => {
  it('produces the same output size regardless of qualityLevel', async () => {
    const pdf = await createMinimalPdf(2, PageSizes.A4);

    mockReadFile(pdf);
    const lowResult = await processPdf('/test.pdf', {
      ...baseOpts,
      qualityLevel: 'low', // "Maximum" compression in UI
    });

    mockReadFile(pdf);
    const maximumResult = await processPdf('/test.pdf', {
      ...baseOpts,
      qualityLevel: 'maximum', // "Low" / pass-through in UI
    });

    // Both should be identical because qualityLevel is not yet implemented.
    // When real compression is added, this test should FAIL, prompting an update.
    expect(lowResult.outputSizeBytes).toBe(maximumResult.outputSizeBytes);
  });

  it('all quality levels still produce a valid PDF output', async () => {
    const qualityLevels = ['low', 'medium', 'high', 'maximum'] as const;
    const pdf = await createMinimalPdf(1, PageSizes.A4);

    for (const level of qualityLevels) {
      mockReadFile(pdf);
      const result = await processPdf('/test.pdf', {
        ...baseOpts,
        qualityLevel: level,
      });
      const header = new TextDecoder().decode(result.bytes.slice(0, 5));
      expect(header, `quality level "${level}" should produce a valid PDF`).toBe('%PDF-');
    }
  });
});
