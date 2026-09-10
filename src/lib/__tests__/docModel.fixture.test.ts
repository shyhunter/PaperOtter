// Real-fixture test for the PDF → DocModel → Markdown pipeline (P007/P010).
//
// The structure-inference logic is pure (consumes ExtractedTextItem[][]), so we
// extract items from the committed binary fixture with the pdfjs *legacy* build
// (runs in-thread under Node/vitest — no worker) and drive the pure functions.

import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, it, expect } from 'vitest';
// Legacy build: main-thread, no worker — the only pdfjs entry that runs under vitest's node env.
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { TextItem } from 'pdfjs-dist/types/src/display/api';
import type { ExtractedTextItem } from '@/lib/pdfTextExtract';
import { inferDocModel } from '@/lib/docModel';
import { renderMarkdown } from '@/lib/renderers/markdown';
import { NoTextLayerError } from '@/types/docModel';

const fixtureDir = join(process.cwd(), 'test-fixtures');

/** Extract one ExtractedTextItem[] per page from a real PDF fixture. */
async function extractFixture(name: string): Promise<ExtractedTextItem[][]> {
  const data = new Uint8Array(readFileSync(join(fixtureDir, name)));
  const doc = await getDocument({ data, useSystemFonts: true, isEvalSupported: false }).promise;
  const pages: ExtractedTextItem[][] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const { items } = await page.getTextContent();
    const rows: ExtractedTextItem[] = [];
    for (const it of items as TextItem[]) {
      if (typeof it.str !== 'string' || !it.str.trim()) continue;
      const t = it.transform as number[];
      rows.push({
        id: `${p}-${rows.length}`,
        text: it.str,
        x: t[4],
        y: t[5],
        width: it.width,
        height: it.height,
        fontSize: Math.abs(t[3]),
        fontName: it.fontName ?? '',
        transform: t,
      });
    }
    pages.push(rows);
  }
  await doc.cleanup();
  return pages;
}

describe('PDF → DocModel → Markdown (sample.pdf)', () => {
  it('detects headings, strips the running header, and reflows paragraphs', async () => {
    const pages = await extractFixture('sample.pdf');
    const doc = inferDocModel(pages);
    const md = renderMarkdown(doc);

    // Heading detected from the larger font size.
    expect(md).toContain('# Papercut Test Document');
    // Per-page headings survive.
    expect(md).toContain('# Page Two — Lorem Ipsum');
    // The repeated running header must be stripped, not emitted as body text.
    expect(md).not.toContain('PaperOtter — Test Fixture Document');
    // Body prose is present and reflowed onto one paragraph line (no mid-paragraph breaks).
    expect(md).toContain('This is a sample PDF used for automated integration testing');
  });
});

describe('no-text-layer guard', () => {
  it('throws NoTextLayerError when every page is empty (scanned/image PDF)', () => {
    expect(() => inferDocModel([[], []])).toThrow(NoTextLayerError);
  });
});
