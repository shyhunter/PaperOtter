import { describe, it, expect, vi, beforeEach } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { ocrPdf, summarise, LOW_CONFIDENCE_THRESHOLD } from '@/lib/ocrProcessor';
import type { OcrPage } from '@/lib/ocrProcessor';

// ─── OCR processor (OCR-02) ──────────────────────────────────────────────────
//
// Recognition happens in Rust; this is the seam that drives it and decides what
// to tell the user. The judgement worth testing is the honest one: a scan too
// poor to read must say so rather than handing back a confident-looking file
// with nothing useful in it.

const page = (blocks: Array<Partial<OcrPage['blocks'][number]>>): OcrPage => ({
  index: 0, width: 595, height: 842,
  blocks: blocks.map((b) => ({
    text: 'text', x: 0, y: 0, width: 100, height: 12, confidence: 1, ...b,
  })),
});

beforeEach(() => vi.mocked(invoke).mockReset());

describe('ocrPdf', () => {
  it('[OCR-02a] recognises, then writes the searchable copy from that same result', async () => {
    // Recognition is the slow part. Doing it twice would double the wait on a
    // long document for no benefit.
    const pages = [page([{ text: 'MUSTERMANN' }])];
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
    vi.mocked(invoke).mockImplementation(async (cmd: string) =>
      cmd === 'ocr_pdf' ? JSON.stringify(pages) : bytes,
    );

    const result = await ocrPdf('/s/scan.pdf', { languages: ['en-US'] });

    expect(vi.mocked(invoke).mock.calls.map((c) => c[0]))
      .toEqual(['ocr_pdf', 'write_searchable_pdf']);
    expect(result.bytes).toBe(bytes);
    expect(result.pages).toHaveLength(1);
  });

  it('[OCR-02b] passes the chosen languages through to the engine', async () => {
    vi.mocked(invoke).mockImplementation(async (cmd: string) =>
      cmd === 'ocr_pdf' ? JSON.stringify([page([{}])]) : new Uint8Array([1]),
    );

    await ocrPdf('/s/scan.pdf', { languages: ['de-DE', 'tr-TR'] });

    expect(vi.mocked(invoke)).toHaveBeenCalledWith('ocr_pdf', {
      sourcePath: '/s/scan.pdf', languages: ['de-DE', 'tr-TR'],
    });
  });
});

describe('summarise', () => {
  it('[OCR-02c] counts the words found across every page', () => {
    const s = summarise([
      page([{ text: 'Surname: MUSTERMANN' }, { text: 'Given name: ERIKA' }]),
      { ...page([{ text: 'Issued at BERLIN' }]), index: 1 },
    ]);
    // 2 + 3 + 3
    expect(s.wordCount).toBe(8);
    expect(s.pageCount).toBe(2);
  });

  it('[OCR-02d] says plainly when a scan yielded nothing readable', () => {
    // The honest answer for a photo too dark or blurred to read. Handing back a
    // "searchable" PDF containing nothing is worse than saying it failed.
    const s = summarise([page([])]);
    expect(s.foundText).toBe(false);
    expect(s.wordCount).toBe(0);
  });

  it('[OCR-02e] flags a poor scan rather than presenting guesses as fact', () => {
    const s = summarise([page([
      { text: 'M4STERMANN', confidence: 0.31 },
      { text: 'ERlKA', confidence: 0.28 },
    ])]);
    expect(s.foundText).toBe(true);
    expect(s.lowConfidence).toBe(true);
    expect(s.meanConfidence).toBeLessThan(LOW_CONFIDENCE_THRESHOLD);
  });

  it('[OCR-02f] does not cry wolf on a clean scan', () => {
    const s = summarise([page([{ confidence: 0.98 }, { confidence: 0.94 }])]);
    expect(s.lowConfidence).toBe(false);
    expect(s.meanConfidence).toBeGreaterThan(0.9);
  });

  it('[OCR-02g] weights confidence by how much text each block holds', () => {
    // One misread character in a corner should not drag down a page that is
    // otherwise clean — nor should a long confident block hide a whole bad page.
    const s = summarise([page([
      { text: 'a'.repeat(200), confidence: 0.95 },
      { text: 'x', confidence: 0.05 },
    ])]);
    expect(s.meanConfidence).toBeGreaterThan(0.9);
  });

  it('[OCR-02h] an empty document is not a low-confidence document', () => {
    // Nothing found is a different problem from found-badly, and conflating them
    // would tell the user their scan is blurry when it is in fact blank.
    const s = summarise([]);
    expect(s.foundText).toBe(false);
    expect(s.lowConfidence).toBe(false);
  });
});
