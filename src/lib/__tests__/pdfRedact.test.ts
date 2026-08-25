import { describe, it, expect } from 'vitest';
import { resolveRedactionFill, DEFAULT_REDACTION_COLOR } from '@/lib/pdfRedact';

/**
 * The colour of a redaction box is the one cosmetic choice in this tool that
 * borders on a safety property: the box is what tells a reader something was
 * removed, and canvas will happily paint an invisible one if asked.
 */
describe('resolveRedactionFill', () => {
  it('[RD-COL-01] defaults to black, as redactions were before they had a colour', () => {
    expect(DEFAULT_REDACTION_COLOR).toBe('#000000');
    expect(resolveRedactionFill(undefined)).toBe('#000000');
  });

  it('[RD-COL-02] passes a chosen colour through in canonical form', () => {
    expect(resolveRedactionFill('#2563EB')).toBe('#2563eb');
    expect(resolveRedactionFill('#FFFFFF')).toBe('#ffffff');
  });

  it('[RD-COL-03] can never produce a transparent fill', () => {
    // A box painted 'transparent' or 'rgba(0,0,0,0)' leaves the content it was
    // meant to cover fully visible in the rasterised page -- the redaction would
    // look applied and not be. Nothing but a six-digit hex gets through.
    for (const attempt of ['transparent', 'rgba(0, 0, 0, 0)', '#0000', 'none', '']) {
      expect(resolveRedactionFill(attempt)).toBe('#000000');
    }
  });

  it('[RD-COL-04] the result is always a form canvas cannot misread', () => {
    for (const attempt of [undefined, '#DC2626', 'garbage', 'rgba(1,2,3,0.5)']) {
      expect(resolveRedactionFill(attempt)).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});
