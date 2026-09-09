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

// ─── The replacement page's size ─────────────────────────────────────────────
//
// [RD-ROT-01] used to live here: a source guard that regexed this file for
// `pageWidth = viewport.width / renderScale`, because applyRedactions needs a
// real canvas to render and encode, "which jsdom does not provide, so the
// end-to-end behaviour belongs on the manual pass".
//
// That premise no longer holds. RED-05 in src/browser-tests/redaction-output.spec.ts
// runs the real function in a real browser on pages turned 90, 180 and 270
// degrees and asserts the outcome -- that the redacted page keeps the shape the
// reader saw -- which is the thing the regex was standing in for. It also
// catches the mistake the regex could not: rendering without the page's
// rotation, which a correctly-shaped line of code can still do.
//
// The guard was removed rather than updated when this file was refactored,
// because updating it would only have re-pinned the new wording of an
// implementation that RED-05 already checks by result.
