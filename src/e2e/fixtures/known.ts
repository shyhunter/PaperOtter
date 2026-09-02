/**
 * Test material whose properties are known because we built them.
 *
 * The committed fixtures are real documents, which is what makes them worth
 * having — but nobody knows what is on page 7 of any of them, so a test can
 * only ever assert shapes: "still a PDF", "still has pages", "got smaller".
 * Those pass just as happily when a tool takes the wrong pages, turns the wrong
 * way, or quietly hands back its input.
 *
 * These carry their answers. Page N says PAGE N and nothing else, so Split can
 * be asked which pages it actually took, Organise which order it left them in,
 * and Rotate whether it turned the page it was told to. The spec of each
 * fixture is exported alongside it: a test states the expectation from the
 * declaration, never from a number somebody typed in once and nobody rechecked.
 *
 * Deterministic — same bytes on every machine, every run. Nothing here is
 * committed; it is rebuilt at the start of a run.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PDFDocument, StandardFonts, degrees } from 'pdf-lib';

/** Page sizes in PDF points, at the precision anyone actually means. */
export const PAGE_SIZES = {
  A4: { width: 595, height: 842 },
  A3: { width: 842, height: 1191 },
  Letter: { width: 612, height: 792 },
} as const;

export type KnownPageSize = keyof typeof PAGE_SIZES;

export interface KnownPdfSpec {
  /** File name inside the known-fixtures directory. */
  name: string;
  pageCount: number;
  size: KnownPageSize;
  /** true = width and height swapped. */
  landscape?: boolean;
  /** Rotation baked into every page, so "already rotated" input is testable. */
  rotation?: 0 | 90 | 180 | 270;
}

/**
 * The marker on page `index` (0-based).
 *
 * One token, no punctuation, nothing else on the page — so an extracted string
 * can be compared exactly rather than searched hopefully. `PAGE 1` is not a
 * substring of `PAGE 11`, hence the padding.
 */
export function pageMarker(index: number): string {
  return `PAGE ${String(index + 1).padStart(3, '0')}`;
}

/** What each spec's pages should measure once built, accounting for landscape. */
export function expectedPageBox(spec: KnownPdfSpec): { width: number; height: number } {
  const { width, height } = PAGE_SIZES[spec.size];
  return spec.landscape ? { width: height, height: width } : { width, height };
}

export const KNOWN_PDFS: KnownPdfSpec[] = [
  // The workhorse: enough pages that an off-by-one is visible, and page numbers
  // that survive being reordered, split or removed.
  { name: 'known-12-a4.pdf', pageCount: 12, size: 'A4' },
  // A single page — the edge every page-range control gets wrong first.
  { name: 'known-1-a4.pdf', pageCount: 1, size: 'A4' },
  // A different size, so "the page size is unchanged" is a real assertion
  // rather than one that would pass on A4 by luck.
  { name: 'known-3-a3.pdf', pageCount: 3, size: 'A3' },
  // Landscape, for anything that reasons about aspect.
  { name: 'known-2-a4-landscape.pdf', pageCount: 2, size: 'A4', landscape: true },
  // Already rotated on the way in: rotating by 90 should reach 180, not 90.
  { name: 'known-4-a4-rot90.pdf', pageCount: 4, size: 'A4', rotation: 90 },
];

/** Build one document. Returns its bytes rather than writing, so tests can too. */
export async function buildKnownPdf(spec: KnownPdfSpec): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  // Fixed metadata, or the bytes differ run to run and nothing is comparable.
  doc.setTitle(spec.name);
  doc.setProducer('papercut-e2e');
  doc.setCreator('papercut-e2e');
  doc.setCreationDate(new Date(0));
  doc.setModificationDate(new Date(0));

  const font = await doc.embedFont(StandardFonts.Helvetica);
  const box = expectedPageBox(spec);

  for (let i = 0; i < spec.pageCount; i++) {
    const page = doc.addPage([box.width, box.height]);
    const marker = pageMarker(i);
    page.drawText(marker, {
      x: 48,
      y: box.height - 96,
      size: 24,
      font,
    });
    if (spec.rotation) page.setRotation(degrees(spec.rotation));
  }

  return doc.save({ useObjectStreams: false });
}

/** Write every known fixture into `dir`, which is created if absent. */
export async function buildKnownFixtures(dir: string): Promise<void> {
  mkdirSync(dir, { recursive: true });
  for (const spec of KNOWN_PDFS) {
    writeFileSync(join(dir, spec.name), await buildKnownPdf(spec));
  }
}

/** Look a spec up by file name, so a test names the fixture once. */
export function knownPdf(name: string): KnownPdfSpec {
  const spec = KNOWN_PDFS.find((s) => s.name === name);
  if (!spec) throw new Error(`No known fixture named "${name}"`);
  return spec;
}
