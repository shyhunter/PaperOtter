/**
 * Split a DocModel into chapters.
 *
 * Two strategies: by top-level (H1) headings, or by explicit page boundaries
 * (used with a PDF's embedded outline/bookmarks — far more reliable than
 * heading detection on professionally-typeset PDFs). "Whole document" is just
 * the caller not splitting.
 */

import type { Block, DocModel } from '@/types/docModel';

export interface Chapter {
  /** Chapter title, or null for content before the first heading/boundary. */
  title: string | null;
  doc: DocModel;
}

/** A chapter boundary: a title and the 1-based page where it starts. */
export interface PageBoundary {
  title: string;
  startPage: number;
}

/** Slugify a title into a filename-safe stem (e.g. "1. Intro!" → "1-intro"). */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'section';
}

export function splitByChapter(doc: DocModel): Chapter[] {
  const chapters: Chapter[] = [];
  let cur: Chapter | null = null;
  for (const b of doc.blocks) {
    if (b.type === 'heading' && b.level === 1) {
      cur = { title: b.text, doc: { blocks: [b] } };
      chapters.push(cur);
    } else {
      if (!cur) {
        cur = { title: null, doc: { blocks: [] } };
        chapters.push(cur);
      }
      cur.doc.blocks.push(b);
    }
  }
  return chapters;
}

/**
 * Split by page boundaries (from a PDF outline). Each block is assigned to the
 * last boundary whose startPage ≤ the block's page; content before the first
 * boundary becomes a leading (front-matter) chapter.
 */
export function splitByPages(doc: DocModel, boundaries: PageBoundary[]): Chapter[] {
  const buckets = [...boundaries]
    .sort((a, b) => a.startPage - b.startPage)
    .map((b) => ({ title: b.title as string | null, startPage: b.startPage, blocks: [] as Block[] }));

  let frontMatter: Block[] | null = null;
  for (const block of doc.blocks) {
    let target: (typeof buckets)[number] | null = null;
    for (let i = buckets.length - 1; i >= 0; i--) {
      if (block.page >= buckets[i].startPage) { target = buckets[i]; break; }
    }
    if (target) target.blocks.push(block);
    else (frontMatter ??= []).push(block);
  }

  const chapters: Chapter[] = [];
  if (frontMatter) chapters.push({ title: null, doc: { blocks: frontMatter } });
  for (const b of buckets) chapters.push({ title: b.title, doc: { blocks: b.blocks } });
  return chapters;
}
