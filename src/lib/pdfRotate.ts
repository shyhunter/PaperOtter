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
 *
 * Rotations are RELATIVE: each value is added to whatever /Rotate the page
 * already carries. Both callers treat their value as a delta on the page as it
 * currently looks — the editor's RotatePanel previews with a CSS
 * `transform: rotate(Ndeg)` over the rendered page, and RotateStep starts every
 * page at 0 and cycles with cycleRotation(). Setting an absolute angle here
 * made an already-rotated page disagree with its own Before/After preview.
 *
 * Only pages with a non-zero delta are modified.
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
      const current = page.getRotation().angle;
      // Normalise into [0, 360) — existing /Rotate may be negative or ≥ 360.
      const next = (((current + rotation) % 360) + 360) % 360;
      page.setRotation(degrees(next));
    }
  }

  const bytes = await doc.save({ useObjectStreams: true });

  return {
    bytes: new Uint8Array(bytes),
    totalPages,
    rotations,
  };
}
