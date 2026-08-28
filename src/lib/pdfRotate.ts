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

/** Which way a quarter turn goes. */
export type TurnDirection = 'left' | 'right';

/**
 * One quarter turn from where the page currently sits.
 *
 * The rotation values this module produces are *deltas*, not positions — see
 * rotatePdf below. A control that offers absolute-sounding choices over that
 * engine misleads: the editor's rotate panel had a compass reading "Original /
 * Turn Right / Upside Down / Turn Left" whose value was passed straight through
 * as a delta, so "Original" restored nothing, "Upside Down" on a page already
 * at 90° produced 270°, and clicking "Turn Right" twice still sent 90° because
 * the compass set the value instead of adding to it — a half turn could not be
 * expressed at all.
 *
 * Turning accumulates, so two rights are a half turn and a left undoes a right.
 */
export function turnBy(current: RotationDegrees, direction: TurnDirection): RotationDegrees {
  const delta = direction === 'right' ? 90 : 270;
  return (((current + delta) % 360) + 360) % 360 as RotationDegrees;
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
