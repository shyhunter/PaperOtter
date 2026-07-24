/**
 * Render a DocModel to output bytes — either a single file (whole document) or
 * a .zip with one file per chapter (split at top-level H1 headings).
 *
 * Kept separate from documentBuiltin so it depends only on the renderers +
 * splitter (no pdfjs/mammoth), making it cheap to unit-test.
 */

import { zipSync, strToU8 } from 'fflate';
import type { DocModel } from '@/types/docModel';
import { splitByChapter, slugify, type Chapter } from '@/lib/splitDoc';
import { renderMarkdown } from '@/lib/renderers/markdown';
import { renderHtml } from '@/lib/renderers/html';
import { renderText } from '@/lib/renderers/text';
import { renderJson } from '@/lib/renderers/json';
import { renderDocx } from '@/lib/renderers/docx';

/** Output formats the in-process engine can render (extension == format string). */
export type ArchiveFormat = 'md' | 'html' | 'txt' | 'json' | 'docx';

/** Render one DocModel to a single file's bytes. */
export function renderSingle(doc: DocModel, format: ArchiveFormat): Uint8Array {
  switch (format) {
    case 'docx': return renderDocx(doc);
    case 'md': return strToU8(renderMarkdown(doc));
    case 'html': return strToU8(renderHtml(doc));
    case 'txt': return strToU8(renderText(doc));
    case 'json': return strToU8(renderJson(doc));
  }
}

/**
 * Package pre-split chapters as a .zip — one numbered file per chapter
 * (`01-introduction.md`, `02-…`); a null-titled leading chapter becomes
 * `NN-front-matter.<ext>`. The numeric prefix keeps names unique and ordered.
 */
export function zipChapters(chapters: Chapter[], format: ArchiveFormat): Uint8Array {
  const files: Record<string, Uint8Array> = {};
  chapters.forEach((ch, i) => {
    const stem = ch.title ? slugify(ch.title) : 'front-matter';
    const name = `${String(i + 1).padStart(2, '0')}-${stem}.${format}`;
    files[name] = renderSingle(ch.doc, format);
  });
  return zipSync(files);
}

/** Convenience: split a DocModel at H1 headings and zip the chapters. */
export function renderChapterZip(doc: DocModel, format: ArchiveFormat): Uint8Array {
  return zipChapters(splitByChapter(doc), format);
}
