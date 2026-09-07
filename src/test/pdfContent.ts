/**
 * Reading back what was actually drawn on a page.
 *
 * Placement bugs in this app have all had the same shape: the call arguments
 * looked right and the page did not get what they described. Asserting on the
 * arguments would have caught none of them, so these tests open the saved file
 * and read the operators the page really carries.
 *
 * Two details make that harder than it sounds. A page's content stream comes
 * back Flate compressed after a save/load round trip, so it has to be inflated;
 * and pdf-lib writes a placement as a chain of `cm` matrices -- translate,
 * rotate, scale, skew -- so they have to be composed. Taking the last one alone
 * yields only the scale, which puts every drawing at the origin and quietly
 * passes.
 */
import { PDFDocument, PDFRawStream, decodePDFRawStream } from 'pdf-lib';

/** A PDF transform [a b c d e f]: (x,y) -> (ax + cy + e, bx + dy + f). */
export type Matrix = [number, number, number, number, number, number];

/** The matrix for A(B(p)) -- B applied first, which is the order `cm` composes in. */
export function compose(A: Matrix, B: Matrix): Matrix {
  const [aA, bA, cA, dA, eA, fA] = A;
  const [aB, bB, cB, dB, eB, fB] = B;
  return [
    aA * aB + cA * bB,
    bA * aB + dA * bB,
    aA * cB + cA * dB,
    bA * cB + dA * dB,
    aA * eB + cA * fB + eA,
    bA * eB + dA * fB + fA,
  ];
}

/** One page's drawing operators, with any compressed stream inflated. */
export function pageContent(doc: PDFDocument, pageIndex: number): string {
  const page = doc.getPages()[pageIndex];
  // A page nothing was ever drawn on has no /Contents at all, which is itself
  // the answer for the untouched-page case.
  const contents = page.node.normalizedEntries().Contents;
  if (!contents) return '';
  return contents.asArray().map((ref) => {
    const stream = doc.context.lookup(ref);
    const bytes = stream instanceof PDFRawStream
      ? decodePDFRawStream(stream).decode()
      : (stream as { getUnencodedContents?: () => Uint8Array }).getUnencodedContents?.();
    return bytes ? new TextDecoder('latin1').decode(bytes) : '';
  }).join('\n');
}

const MATRIX_RE = /(-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (cm|Tm)/g;

/** Every `cm` matrix before the first image-draw operator, composed into one. */
export function imageMatrix(content: string): Matrix | null {
  const drawAt = content.indexOf(' Do');
  if (drawAt < 0) return null;
  const found = [...content.slice(0, drawAt).matchAll(MATRIX_RE)]
    .filter((m) => m[7] === 'cm')
    .map((m) => m.slice(1, 7).map(Number) as Matrix);
  return found.length > 0 ? found.reduce(compose) : null;
}

/** The text matrix of the first drawn text run, which carries its origin and angle. */
export function textMatrix(content: string): Matrix | null {
  const m = [...content.matchAll(MATRIX_RE)].find((x) => x[7] === 'Tm');
  return m ? (m.slice(1, 7).map(Number) as Matrix) : null;
}

/** The angle a matrix rotates by, in degrees, rounded to the nearest degree. */
export function matrixAngle([a, b]: Matrix): number {
  return Math.round((Math.atan2(b, a) * 180) / Math.PI);
}

/**
 * A raw page point in the frame the reader sees.
 *
 * The inverse of visualToRaw in pdfPageNumbers, written out here rather than
 * imported so a fault in that mapping cannot cancel itself out and pass.
 */
export function rawToVisual(
  x: number, y: number, rawW: number, rawH: number, rotation: number,
): { vx: number; vy: number } {
  switch (((rotation % 360) + 360) % 360) {
    case 90:  return { vx: y, vy: rawW - x };
    case 180: return { vx: rawW - x, vy: rawH - y };
    case 270: return { vx: rawH - y, vy: x };
    default:  return { vx: x, vy: y };
  }
}

/** The page box as the reader sees it, with a quarter turn's axes swapped. */
export function visualSize(rawW: number, rawH: number, rotation: number) {
  const quarter = Math.abs(rotation % 180) === 90;
  return { visW: quarter ? rawH : rawW, visH: quarter ? rawW : rawH };
}
