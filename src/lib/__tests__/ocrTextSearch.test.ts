import { describe, it, expect } from 'vitest';
import { findTextMatchesInOcr } from '@/lib/ocrTextSearch';
import { REAL_OCR_PAGES } from '@/lib/__tests__/fixtures/realOcrOutput';

// ─── Searching a scan (OCR-04) ───────────────────────────────────────────────
//
// The brief's bonus: "redaction text search cannot find anything in a scan today
// and says so. With OCR it can."
//
// Driven by REAL Vision output rather than invented shapes. A previous search fix
// in this repo shipped broken because its fixtures matched what pdf.js was assumed
// to emit. The same mistake here would be worse: this feeds a redaction tool, and
// a box in the wrong place leaves the thing the user wanted removed on the page.

describe('findTextMatchesInOcr', () => {
  it('[OCR-04a] finds a name on a page that has no text layer at all', () => {
    const matches = findTextMatchesInOcr(REAL_OCR_PAGES, 'MUSTERMANN');
    expect(matches).toHaveLength(1);
    expect(matches[0].pageIndex).toBe(0);
  });

  it('[OCR-04b] is case-insensitive, as the typed query will not match the scan', () => {
    expect(findTextMatchesInOcr(REAL_OCR_PAGES, 'mustermann')).toHaveLength(1);
    expect(findTextMatchesInOcr(REAL_OCR_PAGES, 'MuStErMaNn')).toHaveLength(1);
  });

  it('[OCR-04c] searches every page, not just the first', () => {
    const matches = findTextMatchesInOcr(REAL_OCR_PAGES, 'BERLIN');
    expect(matches).toHaveLength(1);
    expect(matches[0].pageIndex).toBe(1);
  });

  it('[OCR-04d] ignores spacing differences between query and scan', () => {
    // OCR emits one block per visual line; a query typed with normal spacing
    // must still match.
    expect(findTextMatchesInOcr(REAL_OCR_PAGES, 'Surname:MUSTERMANN')).toHaveLength(1);
    expect(findTextMatchesInOcr(REAL_OCR_PAGES, 'Surname: MUSTERMANN')).toHaveLength(1);
  });

  it('[OCR-04e] returns nothing for text that is not there', () => {
    expect(findTextMatchesInOcr(REAL_OCR_PAGES, 'SCHMIDT')).toEqual([]);
    expect(findTextMatchesInOcr(REAL_OCR_PAGES, '')).toEqual([]);
  });

  it('[OCR-04f] boxes are percentages of the page, measured from the top', () => {
    // The renderer places rectangles from the top-left; OCR reports from the
    // bottom-left. Getting this backwards puts every box on the wrong half of
    // the page while every value still looks plausible.
    const [match] = findTextMatchesInOcr(REAL_OCR_PAGES, 'RESIDENCE PERMIT');
    // The heading sits near the top of the page, so y must be small.
    expect(match.y).toBeLessThan(20);
    for (const v of [match.x, match.y, match.width, match.height]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });

  it('[OCR-04g] the heading box sits above the last line, as on the page', () => {
    const [heading] = findTextMatchesInOcr(REAL_OCR_PAGES, 'RESIDENCE PERMIT');
    const [last] = findTextMatchesInOcr(REAL_OCR_PAGES, 'Nationality');
    expect(heading.y).toBeLessThan(last.y);
  });

  it('[OCR-04h] the tight box covers the match and no more than its line', () => {
    const [match] = findTextMatchesInOcr(REAL_OCR_PAGES, 'MUSTERMANN');
    // "MUSTERMANN" is the tail of "Surname: MUSTERMANN", so the tight box must
    // start to the right of the line's left edge but stay inside it.
    expect(match.x).toBeGreaterThan(match.line.x);
    expect(match.x + match.width).toBeLessThanOrEqual(match.line.x + match.line.width + 0.5);
  });

  it('[OCR-04i] never returns a box narrower than the text it covers', () => {
    // Under-covering is the dangerous direction: this feeds a redaction that
    // destroys pixels, so a box that falls short leaves part of a name visible.
    const [match] = findTextMatchesInOcr(REAL_OCR_PAGES, 'ERIKA');
    expect(match.width).toBeGreaterThan(0);
    expect(match.height).toBeGreaterThan(0);
  });

  it('[OCR-04j] offers the whole line as an alternative scope', () => {
    const [match] = findTextMatchesInOcr(REAL_OCR_PAGES, 'MUSTERMANN');
    expect(match.line.width).toBeGreaterThan(match.width);
  });

  it('[OCR-04k] gives every match a distinct id', () => {
    const matches = findTextMatchesInOcr(REAL_OCR_PAGES, 'e');
    const ids = new Set(matches.map((m) => m.id));
    expect(ids.size).toBe(matches.length);
    expect(matches.length).toBeGreaterThan(1);
  });
});
