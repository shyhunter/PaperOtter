import { describe, it, expect } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import type { DocModel } from '@/types/docModel';
import { renderChapterZip, renderSingle } from '@/lib/chapterArchive';

const book: DocModel = {
  blocks: [
    { type: 'paragraph', text: 'Copyright 2026.', page: 1 }, // front matter (before any H1)
    { type: 'heading', level: 1, text: 'Introduction', page: 1 },
    { type: 'paragraph', text: 'Intro body.', page: 1 },
    { type: 'heading', level: 1, text: 'Chapter Two', page: 2 },
    { type: 'heading', level: 2, text: 'A Section', page: 2 }, // stays inside Chapter Two
    { type: 'paragraph', text: 'Two body.', page: 2 },
  ],
};

describe('renderChapterZip (split a book into per-chapter files)', () => {
  it('produces one Markdown file per chapter, named and numbered', () => {
    const zip = unzipSync(renderChapterZip(book, 'md'));
    expect(Object.keys(zip).sort()).toEqual([
      '01-front-matter.md',
      '02-introduction.md',
      '03-chapter-two.md',
    ]);
    // Chapter Two keeps its own H2 subsection, split only at H1.
    const two = strFromU8(zip['03-chapter-two.md']);
    expect(two).toContain('# Chapter Two');
    expect(two).toContain('## A Section');
    expect(two).toContain('Two body.');
    // Front matter carries the pre-heading paragraph only.
    expect(strFromU8(zip['01-front-matter.md'])).toContain('Copyright 2026.');
  });

  it('honours the chosen format for chapter files (docx → real .docx bytes)', () => {
    const zip = unzipSync(renderChapterZip(book, 'docx'));
    expect(Object.keys(zip)).toContain('02-introduction.docx');
    const bytes = zip['02-introduction.docx'];
    expect(bytes[0]).toBe(0x50); // ZIP 'P'
    expect(bytes[1]).toBe(0x4b); // ZIP 'K'
  });

  it('renderSingle keeps the whole document as one file', () => {
    expect(strFromU8(renderSingle(book, 'md'))).toContain('# Introduction');
  });
});
