import { describe, it, expect } from 'vitest';
import type { DocModel } from '@/types/docModel';
import { splitByChapter, slugify } from '@/lib/splitDoc';

const doc: DocModel = {
  blocks: [
    { type: 'paragraph', text: 'preface', page: 1 },
    { type: 'heading', level: 1, text: 'Chapter One', page: 1 },
    { type: 'paragraph', text: 'a', page: 1 },
    { type: 'heading', level: 2, text: 'sub', page: 1 },
    { type: 'heading', level: 1, text: 'Chapter Two', page: 2 },
    { type: 'paragraph', text: 'b', page: 2 },
  ],
};

describe('splitByChapter', () => {
  it('starts a new chapter at each H1 and keeps pre-heading content as a leading part', () => {
    const chapters = splitByChapter(doc);
    expect(chapters.map((c) => c.title)).toEqual([null, 'Chapter One', 'Chapter Two']);
    // Sub-headings (H2) stay inside their chapter, not split.
    expect(chapters[1].doc.blocks).toHaveLength(3);
    expect(chapters[2].doc.blocks.map((b) => b.type)).toEqual(['heading', 'paragraph']);
  });

  it('slugify makes filename-safe stems', () => {
    expect(slugify('1. Introduction!')).toBe('1-introduction');
    expect(slugify('   ')).toBe('section');
  });
});
