import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { stripPdfMetadata } from '@/lib/pdfMetadata';

/** Reads a PDF without letting pdf-lib stamp its own Producer during the read --
 * otherwise the check re-adds the very metadata it is verifying is gone. */
const inspect = (bytes: Uint8Array) => PDFDocument.load(bytes, { updateMetadata: false });

let fixture: Uint8Array;

beforeAll(() => {
  // Real binary fixture per P007.
  fixture = new Uint8Array(readFileSync(resolve(process.cwd(), 'test-fixtures/sample.pdf')));
});

/** A copy of the fixture carrying identifying metadata. */
async function withMetadata(): Promise<Uint8Array> {
  const doc = await PDFDocument.load(fixture);
  doc.setTitle('Quarterly Results');
  doc.setAuthor('Jane Doe');
  doc.setSubject('Internal only');
  doc.setKeywords(['confidential', 'draft']);
  doc.setCreator('Papercut Test');
  doc.setProducer('Papercut Test');
  return new Uint8Array(await doc.save());
}

describe('stripPdfMetadata', () => {
  it('PM-01: removes the identifying Info fields', async () => {
    const stripped = await stripPdfMetadata(await withMetadata());
    const doc = await inspect(stripped);

    expect(doc.getTitle() || '').toBe('');
    expect(doc.getAuthor() || '').toBe('');
    expect(doc.getSubject() || '').toBe('');
    expect(doc.getKeywords() || '').toBe('');
    expect(doc.getCreator() || '').toBe('');
    expect(doc.getProducer() || '').toBe('');
  });

  it('PM-02: leaves the document itself intact', async () => {
    const before = await PDFDocument.load(fixture);
    const stripped = await stripPdfMetadata(await withMetadata());
    const after = await inspect(stripped);

    // Stripping metadata must not cost the user any pages.
    expect(after.getPageCount()).toBe(before.getPageCount());
    expect(stripped.byteLength).toBeGreaterThan(0);
  });

  it('PM-03: is safe on a document that has no metadata to begin with', async () => {
    const stripped = await stripPdfMetadata(fixture);
    const doc = await inspect(stripped);

    expect(doc.getPageCount()).toBeGreaterThan(0);
    expect(doc.getTitle() || '').toBe('');
  });
});
