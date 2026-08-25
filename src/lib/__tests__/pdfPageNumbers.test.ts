import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  addPageNumbers,
  addPageNumbersSinglePage,
  type PageNumberOptions,
} from '@/lib/pdfPageNumbers';

let fixture: Uint8Array;

beforeAll(() => {
  // Real binary fixture per P007 — not a synthetic byte stub.
  fixture = new Uint8Array(readFileSync(resolve(process.cwd(), 'test-fixtures/sample.pdf')));
});

const BASE: PageNumberOptions = {
  position: 'bottom-center',
  format: 'numeric',
  fontSize: 12,
  startNumber: 1,
  margin: 30,
  color: '#000000',
};

describe('addPageNumbers — colour', () => {
  it('PN-COL-05: a different colour produces different output', async () => {
    const black = await addPageNumbers(fixture, { ...BASE, color: '#000000' });
    const red = await addPageNumbers(fixture, { ...BASE, color: '#DC2626' });
    expect(Buffer.compare(Buffer.from(black), Buffer.from(red))).not.toBe(0);
  });

  it('PN-COL-06: white is a usable colour, distinct from black', async () => {
    const black = await addPageNumbers(fixture, { ...BASE, color: '#000000' });
    const white = await addPageNumbers(fixture, { ...BASE, color: '#FFFFFF' });
    expect(Buffer.compare(Buffer.from(black), Buffer.from(white))).not.toBe(0);
  });

  it('PN-COL-07: colour reaches the single-page preview path too', async () => {
    // Preview and output must agree, or the user picks a colour they never get.
    const black = await addPageNumbersSinglePage(fixture, { ...BASE, color: '#000000' }, 0);
    const red = await addPageNumbersSinglePage(fixture, { ...BASE, color: '#DC2626' }, 0);
    expect(Buffer.compare(Buffer.from(black), Buffer.from(red))).not.toBe(0);
  });
});
