export type SupportedFormat = 'pdf' | 'image';

export interface FileEntry {
  path: string;
  format: SupportedFormat;
  name: string;
}

export type AppStep = 0 | 1 | 2 | 3; // Pick=0, Configure=1, Compare=2, Save=3

export type DragState = 'idle' | 'over-valid' | 'over-invalid';

// PDF Processing types

export type PdfQualityLevel = 'web' | 'screen' | 'print' | 'archive' | 'custom';
// Intent-based labels matching Ghostscript presets:
// web     → gs preset: screen   (72 dpi  — smallest, web-optimised)
// screen  → gs preset: ebook    (150 dpi — balanced, screen reading)
// print   → gs preset: printer  (300 dpi — high quality for print)
// archive → gs preset: prepress (lossless — archival quality)

export type PdfPagePreset = 'A4' | 'A3' | 'Letter' | 'custom';

export interface PdfProcessingOptions {
  // Compression
  compressionEnabled: boolean;
  qualityLevel: PdfQualityLevel;
  targetSizeBytes: number | null;  // null = no target, just re-save

  // Page resize
  resizeEnabled: boolean;
  pagePreset: PdfPagePreset;
  customWidthMm: number | null;   // only used when pagePreset === 'custom'
  customHeightMm: number | null;  // only used when pagePreset === 'custom'
  selectedPageIndices: number[];  // empty = apply to all pages

  // Metadata stripping — removes title, author, subject, keywords, creator, producer
  stripMetadata?: boolean;

  // Progress callback (called per page during resize)
  onProgress?: (current: number, total: number) => void;
}

export interface PdfProcessingResult {
  bytes: Uint8Array;        // processed PDF bytes
  sourceBytes: Uint8Array;  // original unmodified PDF bytes (for Before preview)
  outputSizeBytes: number;
  inputSizeBytes: number;
  pageCount: number;
  outputPageDimensions: { widthPt: number; heightPt: number } | null; // first page dimensions in PDF points
  targetMet: boolean;           // false when compressionEnabled + target not achieved
  bestAchievableSizeBytes: number | null; // set when targetMet=false
  wasAlreadyOptimal: boolean;   // true when GS output was larger than input; bytes reverted to source
  // Pre-scan results (always populated, even for text-only PDFs)
  imageCount: number;           // number of image XObjects found in the PDF
  compressibilityScore: number; // 0.0–1.0: 0 = text-only (not very compressible), 1.0 = mostly images (highly compressible)
}

// Image Processing types

export type ImageOutputFormat = 'jpeg' | 'png' | 'webp';

export interface ImageProcessingOptions {
  quality: number;                  // 1–100 for JPEG/WebP; 1–100 mapped to PNG compression 0–9 in Rust
  outputFormat: ImageOutputFormat;  // target format (defaults to source format in UI)

  // Resize — off by default (resizeEnabled = false)
  resizeEnabled: boolean;
  resizeExact: boolean;             // false = preserve aspect ratio, true = exact (aspect ratio unlocked)
  targetWidth: number | null;       // px; null when resize disabled
  targetHeight: number | null;      // px; null when resize disabled
}

export interface ImageProcessingResult {
  bytes: Uint8Array;            // processed image bytes
  sourceBytes: Uint8Array;      // original unmodified bytes (for Before panel)
  inputSizeBytes: number;
  outputSizeBytes: number;
  outputFormat: ImageOutputFormat;
  quality: number;              // quality value used (for stats display in CompareStep)
  sourceWidth: number;          // original image width in px (from createImageBitmap)
  sourceHeight: number;         // original image height in px
  outputWidth: number;          // processed image width in px
  outputHeight: number;         // processed image height in px
}
