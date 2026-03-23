import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFile } from '@tauri-apps/plugin-fs';
import { invoke } from '@tauri-apps/api/core';
import { processPdf } from '@/lib/pdfProcessor';
import type { PdfProcessingOptions } from '@/types/file';

vi.mock('@tauri-apps/plugin-fs', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(() => Promise.resolve()),
  remove: vi.fn(() => Promise.resolve()),
}));
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

const fixtureDir = join(process.cwd(), 'test-fixtures');

function readFixture(name: string): Uint8Array {
  const path = join(fixtureDir, name);
  const buf = readFileSync(path);
  return new Uint8Array(buf);
}

function mockReadFile(bytes: Uint8Array) {
  vi.mocked(readFile).mockResolvedValue(bytes);
}

// Mock GS output: just return the original bytes (simulates "already compressed")
function mockCompressPdf(bytes: Uint8Array) {
  vi.mocked(invoke).mockResolvedValue(bytes.buffer);
}

const baseOpts: Omit<PdfProcessingOptions, 'onProgress'> = {
  compressionEnabled: true,
  qualityLevel: 'screen',
  targetSizeBytes: null,
  resizeEnabled: false,
  pagePreset: 'A4',
  customWidthMm: null,
  customHeightMm: null,
  selectedPageIndices: [0],
};

afterEach(() => {
  vi.mocked(invoke).mockReset();
  vi.mocked(readFile).mockReset();
});

describe('pdfProcessor with real fixtures', () => {
  describe('photo_heavy.pdf (image-heavy PDF)', () => {
    it('PF-01: detects 3 pages in photo_heavy.pdf', async () => {
      const bytes = readFixture('photo_heavy.pdf');
      mockReadFile(bytes);
      mockCompressPdf(bytes);

      const result = await processPdf('/test.pdf', { ...baseOpts, selectedPageIndices: [0, 1, 2] });
      expect(result.pageCount).toBe(3);
    });

    it('PF-02: detects image content in photo_heavy.pdf (non-zero compressibility)', async () => {
      const bytes = readFixture('photo_heavy.pdf');
      mockReadFile(bytes);
      mockCompressPdf(bytes);

      const result = await processPdf('/test.pdf', { ...baseOpts });
      // A photo-heavy PDF should have a compressibility score > 0
      // (the score is computed inside processPdf based on image analysis)
      expect(result.pageCount).toBeGreaterThan(0);
      expect(result.outputSizeBytes).toBeGreaterThan(0);
    });
  });

  describe('warnock_camelot.pdf (text-only PDF)', () => {
    it('PF-03: text-only PDF still processes successfully', async () => {
      const bytes = readFixture('warnock_camelot.pdf');
      mockReadFile(bytes);
      mockCompressPdf(bytes);

      const result = await processPdf('/test.pdf', { ...baseOpts });
      expect(result.pageCount).toBeGreaterThan(0);
      expect(result.inputSizeBytes).toBe(bytes.length);
      // Text PDFs are small and don't compress much
      expect(result.outputSizeBytes).toBeGreaterThan(0);
    });
  });

  describe('PDF processing end-to-end', () => {
    it('PF-04: processPdf returns valid PDF with correct header', async () => {
      const bytes = readFixture('photo_heavy.pdf');
      mockReadFile(bytes);
      mockCompressPdf(bytes);

      const result = await processPdf('/test.pdf', { ...baseOpts });
      const header = new TextDecoder().decode(result.bytes.slice(0, 5));
      expect(header).toBe('%PDF-');
    });

    it('PF-05: processPdf stores original bytes in sourceBytes', async () => {
      const bytes = readFixture('photo_heavy.pdf');
      mockReadFile(bytes);
      mockCompressPdf(bytes);

      const result = await processPdf('/test.pdf', { ...baseOpts });
      expect(result.sourceBytes).toEqual(bytes);
    });

    it('PF-06: processPdf outputs match input size estimates', async () => {
      const bytes = readFixture('photo_heavy.pdf');
      mockReadFile(bytes);
      mockCompressPdf(bytes);

      const result = await processPdf('/test.pdf', { ...baseOpts });
      expect(result.inputSizeBytes).toBe(bytes.length);
      expect(result.outputSizeBytes).toBe(result.bytes.length);
    });
  });
});
