// Engine-routing correctness. Regression guard for the PDF→DOCX bug where
// textutil (which cannot read PDF) was selected and dumped raw PDF bytes into
// the .docx. Engine selection must respect what each engine can *read*, not
// only what it can produce.

import { describe, it, expect } from 'vitest';
import { getBestEngine, getAvailableOutputFormats } from '@/lib/documentConverter';
import type { ConverterAvailability } from '@/types/converter';

function avail(partial: Partial<ConverterAvailability>): ConverterAvailability {
  return {
    builtin: true,
    textutil: false,
    word: false,
    libreoffice: false,
    calibre: false,
    pandoc: false,
    ...partial,
  };
}

describe('input-aware engine selection', () => {
  it('[BUG] PDF → DOCX uses the offline built-in engine, never textutil (which dumped raw bytes)', () => {
    // Only textutil available (typical macOS). Previously returned "textutil" → garbage;
    // it must never be chosen for a PDF, and built-in produces a real .docx offline.
    expect(getBestEngine('docx', avail({ textutil: true }), 'pdf')).toBe('builtin');
    // Even when flaky Word is present, built-in is preferred for PDF → DOCX (reliable, offline).
    expect(getBestEngine('docx', avail({ textutil: true, word: true }), 'pdf')).toBe('builtin');
  });

  it('ODT → DOCX (built-in cannot read ODT) falls back to a document engine', () => {
    expect(getBestEngine('docx', avail({ textutil: true }), 'odt')).toBe('textutil');
  });

  it('uses the built-in engine for PDF → plain text (works offline, no garbage)', () => {
    expect(getBestEngine('txt', avail({}), 'pdf')).toBe('builtin');
  });

  it('routes DOCX → TXT through the built-in engine (offline, structure-aware)', () => {
    expect(getBestEngine('txt', avail({ textutil: true }), 'docx')).toBe('builtin');
  });

  it('routes DOCX → RTF through textutil (built-in does not produce RTF)', () => {
    expect(getBestEngine('rtf', avail({ textutil: true }), 'docx')).toBe('textutil');
  });

  it('DOCX → PDF still works via a document engine', () => {
    expect(getBestEngine('pdf', avail({ libreoffice: true }), 'docx')).toBe('libreoffice');
  });
});

describe('getAvailableOutputFormats is input-aware', () => {
  it('for a PDF with only textutil, offers built-in formats incl. docx, but NOT odt/rtf', () => {
    const formats = getAvailableOutputFormats('pdf', avail({ textutil: true }));
    // Built-in produces these offline from a PDF (docx included — it has a built-in renderer).
    expect(formats).toEqual(expect.arrayContaining(['md', 'html', 'json', 'txt', 'docx']));
    // No available engine can read a PDF into these, so they must not be offered (no garbage path).
    expect(formats).not.toContain('odt');
    expect(formats).not.toContain('rtf');
  });

  it('for a PDF with LibreOffice, odt becomes available', () => {
    expect(getAvailableOutputFormats('pdf', avail({ libreoffice: true }))).toContain('odt');
  });
});
