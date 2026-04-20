import { describe, it, expect } from 'vitest';
import { parseSizeInput, parsePageRange, formatBytes, friendlyPdfError } from '@/lib/pdfUtils';

// ─── parseSizeInput ───────────────────────────────────────────────────────────

describe('parseSizeInput', () => {
  describe('valid inputs', () => {
    it('parses MB correctly', () => {
      expect(parseSizeInput('2 MB')).toBe(2 * 1024 ** 2);
    });

    it('parses KB correctly', () => {
      expect(parseSizeInput('500 KB')).toBe(500 * 1024);
    });

    it('parses GB correctly', () => {
      expect(parseSizeInput('1 GB')).toBe(1024 ** 3);
    });

    it('parses fractional values', () => {
      expect(parseSizeInput('1.5 MB')).toBe(Math.round(1.5 * 1024 ** 2));
      expect(parseSizeInput('2.5 GB')).toBe(Math.round(2.5 * 1024 ** 3));
    });

    it('defaults to MB when no unit is given', () => {
      expect(parseSizeInput('100')).toBe(100 * 1024 ** 2);
    });

    it('is case-insensitive for units', () => {
      expect(parseSizeInput('2 mb')).toBe(2 * 1024 ** 2);
      expect(parseSizeInput('500 kb')).toBe(500 * 1024);
      expect(parseSizeInput('1 gb')).toBe(1024 ** 3);
    });

    it('trims surrounding whitespace', () => {
      expect(parseSizeInput('  2 MB  ')).toBe(2 * 1024 ** 2);
    });

    it('handles no space between number and unit', () => {
      expect(parseSizeInput('2MB')).toBe(2 * 1024 ** 2);
      expect(parseSizeInput('500KB')).toBe(500 * 1024);
    });
  });

  describe('invalid inputs', () => {
    it('returns null for non-numeric input', () => {
      expect(parseSizeInput('abc')).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(parseSizeInput('')).toBeNull();
    });

    it('returns null for unknown units', () => {
      expect(parseSizeInput('5 TB')).toBeNull();
      expect(parseSizeInput('100 bytes')).toBeNull();
    });

    it('returns null for negative numbers', () => {
      expect(parseSizeInput('-1 MB')).toBeNull();
    });

    it('returns null for mixed text', () => {
      expect(parseSizeInput('2 MB extra')).toBeNull();
    });
  });
});

// ─── parsePageRange ───────────────────────────────────────────────────────────

describe('parsePageRange', () => {
  describe('single pages', () => {
    it('parses a single valid page (1-indexed → 0-indexed)', () => {
      expect(parsePageRange('1', 5)).toEqual([0]);
    });

    it('parses the last page', () => {
      expect(parsePageRange('5', 5)).toEqual([4]);
    });

    it('ignores page 0 (not a valid 1-indexed page)', () => {
      expect(parsePageRange('0', 5)).toEqual([]);
    });

    it('ignores pages beyond maxPages', () => {
      expect(parsePageRange('6', 5)).toEqual([]);
    });
  });

  describe('ranges', () => {
    it('parses a simple range', () => {
      expect(parsePageRange('1-3', 5)).toEqual([0, 1, 2]);
    });

    it('parses a full-document range', () => {
      expect(parsePageRange('1-5', 5)).toEqual([0, 1, 2, 3, 4]);
    });

    it('clips a range to maxPages', () => {
      expect(parsePageRange('3-9', 5)).toEqual([2, 3, 4]);
    });

    it('produces no output when start > end (inverted range)', () => {
      expect(parsePageRange('3-1', 5)).toEqual([]);
    });
  });

  describe('multiple parts', () => {
    it('parses comma-separated pages', () => {
      expect(parsePageRange('1, 3, 5', 5)).toEqual([0, 2, 4]);
    });

    it('parses mixed ranges and single pages', () => {
      expect(parsePageRange('1-3, 5, 7-9', 10)).toEqual([0, 1, 2, 4, 6, 7, 8]);
    });

    it('deduplicates overlapping entries', () => {
      expect(parsePageRange('1-3, 2-4', 5)).toEqual([0, 1, 2, 3]);
    });

    it('always returns indices in ascending order', () => {
      expect(parsePageRange('5, 2, 4, 1', 5)).toEqual([0, 1, 3, 4]);
    });
  });

  describe('edge cases', () => {
    it('returns empty array for empty string', () => {
      expect(parsePageRange('', 5)).toEqual([]);
    });

    it('returns empty array for whitespace-only string', () => {
      expect(parsePageRange('   ', 5)).toEqual([]);
    });

    it('ignores non-numeric parts', () => {
      expect(parsePageRange('a, 1, b', 5)).toEqual([0]);
    });
  });
});

// ─── formatBytes ─────────────────────────────────────────────────────────────

describe('formatBytes', () => {
  it('returns empty string for 0', () => {
    expect(formatBytes(0)).toBe('');
  });

  it('formats bytes below 1 MB as KB', () => {
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(512 * 1024)).toBe('512.0 KB');
    expect(formatBytes(1024 ** 2 - 1)).toMatch(/KB$/);
  });

  it('formats values in the MB range', () => {
    expect(formatBytes(1024 ** 2)).toBe('1.00 MB');
    expect(formatBytes(2.5 * 1024 ** 2)).toBe('2.50 MB');
  });

  it('formats values in the GB range', () => {
    expect(formatBytes(1024 ** 3)).toBe('1.00 GB');
    expect(formatBytes(1.5 * 1024 ** 3)).toBe('1.50 GB');
  });
});

// ─── friendlyPdfError ─────────────────────────────────────────────────────────

describe('friendlyPdfError', () => {
  it('returns user-friendly message for "No PDF header found" errors', () => {
    const err = new Error(
      'Failed to parse PDF document (line:10443 col:114 offset=1693099): No PDF header found',
    );
    expect(friendlyPdfError(err)).toBe(
      'This file is not a valid PDF document. Please select a valid PDF file.',
    );
  });

  it('returns user-friendly message for password-protected PDFs', () => {
    expect(friendlyPdfError(new Error('PDF is encrypted with a password'))).toBe(
      'This PDF is password-protected and could not be opened.',
    );
  });

  it('returns user-friendly message for generic parse failures', () => {
    expect(friendlyPdfError(new Error('Failed to parse PDF structure'))).toBe(
      'This file appears to be corrupted or is not a valid PDF. Please try a different file.',
    );
  });

  it('returns fallback message for unknown errors', () => {
    expect(friendlyPdfError(new Error('Something unexpected'))).toBe(
      'Failed to load PDF. The file may be corrupted or not a valid PDF document.',
    );
  });

  it('handles non-Error values', () => {
    expect(friendlyPdfError('string error')).toBe(
      'Failed to load PDF. The file may be corrupted or not a valid PDF document.',
    );
  });
});
