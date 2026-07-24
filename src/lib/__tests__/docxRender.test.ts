// DocModel → DOCX renderer. Proves the output is a real, structured Word file by
// round-tripping it back through mammoth (the same reader the converter uses).

import { describe, it, expect } from 'vitest';
import mammoth from 'mammoth';
import type { DocModel } from '@/types/docModel';
import { renderDocx } from '@/lib/renderers/docx';
import { htmlToDocModel } from '@/lib/docxToDocModel';

const doc: DocModel = {
  blocks: [
    { type: 'heading', level: 1, text: 'Report & Summary', page: 1 }, // '&' must survive XML-escaping
    { type: 'paragraph', text: 'Body paragraph one.', page: 1 },
    { type: 'heading', level: 2, text: 'Section', page: 1 },
    { type: 'listItem', text: 'a bullet', page: 1 },
  ],
};

describe('renderDocx', () => {
  it('produces a valid .docx (ZIP magic bytes)', () => {
    const bytes = renderDocx(doc);
    expect(bytes[0]).toBe(0x50); // 'P'
    expect(bytes[1]).toBe(0x4b); // 'K'
  });

  it('round-trips structure: headings stay headings when read back by mammoth', async () => {
    const bytes = renderDocx(doc);
    const { value: html } = await mammoth.convertToHtml({ buffer: Buffer.from(bytes) });
    const { blocks } = htmlToDocModel(html);

    expect(blocks).toContainEqual({ type: 'heading', level: 1, text: 'Report & Summary', page: 1 });
    expect(blocks).toContainEqual({ type: 'heading', level: 2, text: 'Section', page: 1 });
    expect(blocks).toContainEqual({ type: 'paragraph', text: 'Body paragraph one.', page: 1 });
  });
});
