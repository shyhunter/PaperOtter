// PDF page rotation engine — rotates individual pages using pdf-lib.
// CRITICAL: Never use useCompression: true (pdf-lib issue #1445 — corrupts output).
import { PDFDocument, degrees } from 'pdf-lib';

export type RotationDegrees = 0 | 90 | 180 | 270;

export interface PageRotation {
  pageIndex: number; // 0-based
  rotation: RotationDegrees;
}

export interface RotateResult {
  bytes: Uint8Array;
  totalPages: number;
  rotations: PageRotation[];
}

/**
 * Cycle rotation: 0 → 90 → 180 → 270 → 0
 */
export function cycleRotation(current: RotationDegrees): RotationDegrees {
  const cycle: Record<RotationDegrees, RotationDegrees> = { 0: 90, 90: 180, 180: 270, 270: 0 };
  return cycle[current];
}

/**
 * Apply per-page rotations to a PDF.
 * Only pages with non-zero rotation are modified.
 */
export async function rotatePdf(
  pdfBytes: Uint8Array,
  rotations: PageRotation[],
): Promise<RotateResult> {
  const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const totalPages = doc.getPageCount();

  for (const { pageIndex, rotation } of rotations) {
    if (pageIndex < 0 || pageIndex >= totalPages) {
      throw new Error(`Page index ${pageIndex} out of bounds (0–${totalPages - 1}).`);
    }
    if (rotation !== 0) {
      const page = doc.getPage(pageIndex);
      page.setRotation(degrees(rotation));
    }
  }

  const bytes = await doc.save({ useObjectStreams: true });

  return {
    bytes: new Uint8Array(bytes),
    totalPages,
    rotations,
  };
}
