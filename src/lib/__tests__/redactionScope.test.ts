import { describe, it, expect } from 'vitest';
import { matchToRect, isAlreadyMarked, REDACTION_SCOPES } from '@/lib/redactionScope';
import type { TextMatch } from '@/lib/pdfTextSearch';

const MATCH: TextMatch = {
  id: 'm1', pageIndex: 0, text: 'document',
  x: 20, y: 10, width: 8, height: 2,
  line: { x: 10, y: 10, width: 60, height: 2 },
};

describe('redactionScope', () => {
  it('[RS-01] offers both scopes', () => {
    expect(REDACTION_SCOPES.map((s) => s.value)).toEqual(['match', 'line']);
  });

  it('[RS-02] "match" covers only the found text', () => {
    const rect = matchToRect(MATCH, 'match', 'r1');

    expect(rect.x).toBe(20);
    expect(rect.width).toBe(8);
  });

  it('[RS-03] "line" covers the whole line it sits on', () => {
    const rect = matchToRect(MATCH, 'line', 'r1');

    expect(rect.x).toBe(10);
    expect(rect.width).toBe(60);
  });

  it('[RS-04] both are marked as coming from a search', () => {
    expect(matchToRect(MATCH, 'match', 'r1').source).toBe('search');
    expect(matchToRect(MATCH, 'line', 'r2').source).toBe('search');
  });

  it('[RS-05] a match already marked is not stacked twice', () => {
    const existing = [matchToRect(MATCH, 'match', 'r1')];

    expect(isAlreadyMarked(MATCH, 'match', existing)).toBe(true);
  });

  it('[RS-06] the same match at a different scope is a different mark', () => {
    // Marked the word, then decided the whole line should go: that is a new
    // rectangle, not a duplicate to ignore.
    const existing = [matchToRect(MATCH, 'match', 'r1')];

    expect(isAlreadyMarked(MATCH, 'line', existing)).toBe(false);
  });

  it('[RS-07] a hand-drawn rectangle in the same spot does not block a match', () => {
    const drawn = { ...matchToRect(MATCH, 'match', 'r1'), source: 'drawn' as const };

    expect(isAlreadyMarked(MATCH, 'match', [drawn])).toBe(false);
  });
});
