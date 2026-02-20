import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFile } from '@tauri-apps/plugin-fs';
import { PageSizes } from 'pdf-lib';
import { processPdf } from '@/lib/pdfProcessor';
import { createMinimalPdf, getPageDimensions } from '@/test/fixtures';
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
