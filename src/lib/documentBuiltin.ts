/**
 * Built-in, always-available conversion engine.
 *
 * Unlike the system-tool engines (textutil/Word/LibreOffice/Calibre) this runs
 * entirely in-process — no external binaries — and is the only engine that
 * produces structure-preserving Markdown/HTML/JSON from a PDF. It reuses the
 * pdfjs text extraction (pdfTextExtract), infers a DocModel (docModel), and
 * serialises it (renderers/*).
 */

import type { ExtractedTextItem } from '@/lib/pdfTextExtract';
import { extractAllPagesText } from '@/lib/pdfTextExtract';
import { docxBytesToDocModel } from '@/lib/docxToDocModel';
import { inferDocModel } from '@/lib/docModel';
import { renderSingle, zipChapters, type ArchiveFormat } from '@/lib/chapterArchive';
import { splitByChapter, splitByPages, type Chapter } from '@/lib/splitDoc';
import { extractPdfOutline } from '@/lib/pdfOutline';
import type { DocModel } from '@/types/docModel';

/** All output formats the built-in engine can produce. */
export type BuiltinFormat = ArchiveFormat;

/** Input formats the built-in engine can parse in-process. */
export const BUILTIN_INPUT_FORMATS = ['pdf', 'docx'] as const;

/** Result of an in-process conversion. `archive` = a .zip of per-chapter files. */
export interface BuiltinOutput {
  bytes: Uint8Array;
  archive: boolean;
}

/** Parse a PDF's bytes into a DocModel. @throws NoTextLayerError for scanned PDFs. */
export async function pdfBytesToDocModel(pdfBytes: Uint8Array): Promise<DocModel> {
  const byPage = await extractAllPagesText(pdfBytes);
  const pages: ExtractedTextItem[][] = [];
  for (let i = 0; i < byPage.size; i++) pages.push(byPage.get(i) ?? []);
  return inferDocModel(pages);
}

/**
 * Convert source bytes of a supported input format to a built-in output format.
 * When `splitByChapter` is set, returns a .zip with one file per top-level heading.
 */
export async function convertWithBuiltin(
  sourceBytes: Uint8Array,
  sourceFormat: string,
  format: BuiltinFormat,
  split = false,
): Promise<BuiltinOutput> {
  let doc: DocModel;
  let chapters: Chapter[] | null = null;

  if (sourceFormat === 'pdf') {
    doc = await pdfBytesToDocModel(sourceBytes);
    if (split) {
      // Prefer the PDF's own outline/bookmarks (author-defined); fall back to
      // detected headings when the PDF has no outline.
      const boundaries = await extractPdfOutline(sourceBytes);
      chapters = boundaries.length > 0 ? splitByPages(doc, boundaries) : splitByChapter(doc);
    }
  } else if (sourceFormat === 'docx') {
    doc = await docxBytesToDocModel(sourceBytes);
    if (split) chapters = splitByChapter(doc); // Word heading styles are reliable
  } else {
    throw new Error(`Built-in engine cannot read ${sourceFormat.toUpperCase()}.`);
  }

  return chapters
    ? { bytes: zipChapters(chapters, format), archive: true }
    : { bytes: renderSingle(doc, format), archive: false };
}
