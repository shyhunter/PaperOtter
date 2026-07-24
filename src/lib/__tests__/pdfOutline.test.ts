import { describe, it, expect } from 'vitest';
import type { DocModel } from '@/types/docModel';
import { splitByPages, type PageBoundary } from '@/lib/splitDoc';
import { outlineToBoundaries, type OutlineNode } from '@/lib/pdfOutline';

describe('outlineToBoundaries (map PDF bookmarks → page boundaries)', () => {
  it('resolves titles+pages, sorts by page, drops empties/unresolved, dedupes same page', async () => {
    const nodes: OutlineNode[] = [
      { title: 'Chapter Two', dest: ['ref2'] },
      { title: '   ', dest: ['ref0'] },        // no title → dropped
      { title: 'Introduction', dest: ['ref1'] },
      { title: 'Broken', dest: null },          // unresolved → dropped
      { title: 'Also page 5', dest: ['ref2b'] }, // same page as Chapter Two → deduped
    ];
    const pages: Record<string, number> = { ref1: 2, ref2: 5, ref2b: 5 };
    const resolve = async (dest: string | unknown[] | null) =>
      Array.isArray(dest) ? (pages[dest[0] as string] ?? null) : null;

    const boundaries = await outlineToBoundaries(nodes, resolve);
    expect(boundaries).toEqual([
      { title: 'Introduction', startPage: 2 },
      { title: 'Chapter Two', startPage: 5 },
    ]);
  });
});

describe('splitByPages (split DocModel by outline page boundaries)', () => {
  const doc: DocModel = {
    blocks: [
      { type: 'paragraph', text: 'title page', page: 1 },
      { type: 'paragraph', text: 'intro a', page: 2 },
      { type: 'paragraph', text: 'intro b', page: 3 },
      { type: 'paragraph', text: 'ch2 a', page: 5 },
      { type: 'paragraph', text: 'ch2 b', page: 6 },
    ],
  };
  const boundaries: PageBoundary[] = [
    { title: 'Introduction', startPage: 2 },
    { title: 'Chapter Two', startPage: 5 },
  ];

  it('assigns blocks to the chapter whose page range contains them; page-1 content is front matter', () => {
    const chapters = splitByPages(doc, boundaries);
    expect(chapters.map((c) => c.title)).toEqual([null, 'Introduction', 'Chapter Two']);
    expect(chapters[0].doc.blocks.map((b) => b.text)).toEqual(['title page']);
    expect(chapters[1].doc.blocks.map((b) => b.text)).toEqual(['intro a', 'intro b']);
    expect(chapters[2].doc.blocks.map((b) => b.text)).toEqual(['ch2 a', 'ch2 b']);
  });

  it('no front-matter chapter when the first boundary starts on page 1', () => {
    const chapters = splitByPages(doc, [{ title: 'All', startPage: 1 }]);
    expect(chapters.map((c) => c.title)).toEqual(['All']);
    expect(chapters[0].doc.blocks).toHaveLength(5);
  });
});
