import { describe, it, expect } from 'vitest';
import type { DocModel } from '@/types/docModel';
import { renderMarkdown } from '@/lib/renderers/markdown';
import { renderHtml } from '@/lib/renderers/html';
import { renderText } from '@/lib/renderers/text';
import { renderJson } from '@/lib/renderers/json';

const doc: DocModel = {
  blocks: [
    { type: 'heading', level: 1, text: 'Title', page: 1 },
    { type: 'paragraph', text: 'Hello world.', page: 1 },
    { type: 'listItem', text: 'first', page: 1 },
    { type: 'listItem', text: 'second', page: 1 },
  ],
};

describe('renderers over one DocModel', () => {
  it('markdown', () => {
    expect(renderMarkdown(doc)).toBe('# Title\n\nHello world.\n\n- first\n\n- second\n');
  });

  it('html groups list items and escapes untrusted text', () => {
    const evil: DocModel = { blocks: [{ type: 'paragraph', text: '<script>alert(1)</script>', page: 1 }] };
    const html = renderHtml(doc);
    expect(html).toContain('<h1>Title</h1>');
    expect(html).toContain('<ul>');
    expect(html).toContain('<li>first</li>');
    // XSS guard: markup from the source document must be escaped, never emitted live.
    expect(renderHtml(evil)).toContain('&lt;script&gt;');
    expect(renderHtml(evil)).not.toContain('<script>');
  });

  it('plain text strips structure markers', () => {
    expect(renderText(doc)).toBe('Title\n\nHello world.\n\n- first\n\n- second\n');
  });

  it('json emits the document tree', () => {
    expect(JSON.parse(renderJson(doc))).toEqual(doc);
  });
});
