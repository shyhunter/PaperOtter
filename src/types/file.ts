export type SupportedFormat = 'pdf' | 'image';

export interface FileEntry {
  path: string;
  format: SupportedFormat;
  name: string;
}

export type AppStep = 0 | 1 | 2 | 3; // Pick=0, Configure=1, Compare=2, Save=3

export type DragState = 'idle' | 'over-valid' | 'over-invalid';

// PDF Processing types

export type PdfQualityLevel = 'low' | 'medium' | 'high' | 'maximum';
// Discretion decision: named levels (not %) because pdf-lib has no quality param.
// Low = compress attempt only. Medium = compress + note limit (default). High = resize only if set.
// Maximum = no compression attempt, resize only.

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

  // Progress callback (called per page during resize)
  onProgress?: (current: number, total: number) => void;
}

export interface PdfProcessingResult {
  bytes: Uint8Array;
  outputSizeBytes: number;
  inputSizeBytes: number;
  pageCount: number;
  outputPageDimensions: { widthPt: number; heightPt: number } | null; // first page dimensions in PDF points
  targetMet: boolean;           // false when compressionEnabled + target not achieved
  bestAchievableSizeBytes: number | null; // set when targetMet=false
}
