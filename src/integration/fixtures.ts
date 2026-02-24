/**
 * Shared fake results for integration tests.
 * These drive the mocked processPdf / processImage return values
 * so every suite uses the same predictable numbers for assertions.
 */
import type { PdfProcessingResult, ImageProcessingResult } from '@/types/file';

// inputSizeBytes=2_400_000 → formatBytes → "2.29 MB"
// outputSizeBytes=1_200_000 → formatBytes → "1.14 MB"
// savings 50%  → "50% smaller"
export const FAKE_PDF_RESULT: PdfProcessingResult = {
  bytes:       new Uint8Array([0x25, 0x50, 0x44, 0x46]),   // %PDF
  sourceBytes: new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x0a, 0x0a]),
  outputSizeBytes: 1_200_000,
  inputSizeBytes:  2_400_000,
  pageCount: 3,
  outputPageDimensions: { widthPt: 595.28, heightPt: 841.89 }, // A4
  targetMet: true,
  bestAchievableSizeBytes: null,
  imageCount: 2,
  compressibilityScore: 0.5,
};

export const FAKE_PDF_RESULT_TARGET_UNMET: PdfProcessingResult = {
  ...FAKE_PDF_RESULT,
  targetMet: false,
  bestAchievableSizeBytes: 1_200_000,
};

// inputSizeBytes=2_400_000 → "2.29 MB"
// outputSizeBytes=1_280_000 → "1.22 MB"
// savings 1_120_000 → ~47%  → "−1.07 MB (47%)"
export const FAKE_IMAGE_RESULT: ImageProcessingResult = {
  bytes:       new Uint8Array([0xff, 0xd8, 0xff]),       // JPEG SOI
  sourceBytes: new Uint8Array([0xff, 0xd8, 0xff, 0x00]), // slightly longer
  inputSizeBytes:  2_400_000,
  outputSizeBytes: 1_280_000,
  outputFormat: 'jpeg',
  quality: 80,
  sourceWidth:  300,
  sourceHeight: 200,
  outputWidth:  300,
  outputHeight: 200,
};

export const FAKE_IMAGE_RESULT_RESIZED: ImageProcessingResult = {
  ...FAKE_IMAGE_RESULT,
  outputWidth:  1920,
  outputHeight: 1080,
};
