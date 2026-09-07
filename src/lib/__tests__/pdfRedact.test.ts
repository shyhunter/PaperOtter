import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
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
// [RD-ROT] Redaction replaces each page with a flat image of it. pdf.js renders
// through a viewport that has already applied /Rotate, so on a turned page that
// image is landscape while getSize() still reports the portrait box underneath
// -- and the replacement page carries no /Rotate of its own. Built at the raw
// size, a landscape render was squashed into a portrait sheet and the content
// came out turned.
//
// A source guard rather than a run: applyRedactions needs a real canvas to
// render and encode a PNG, which jsdom does not provide, so the end-to-end
// behaviour belongs on the manual pass. What this can do is stop the two
// dimensions being swapped back.
describe('the redacted page size', () => {
  it('[RD-ROT-01] comes from the viewport that was rendered, not the raw page box', () => {
    const src = readFileSync('src/lib/pdfRedact.ts', 'utf8');
    // lastIndexOf: the first addPage in the file is the untouched-page path,
    // which copies the original and keeps its /Rotate. Only the replacement
    // page is built from dimensions.
    const addPage = src.slice(src.lastIndexOf('outputDoc.addPage('));

    expect(src, 'sized from the render').toMatch(/pageWidth = viewport\.width \/ renderScale/);
    expect(src, 'and its height').toMatch(/pageHeight = viewport\.height \/ renderScale/);
    expect(addPage.slice(0, 60), 'the page is built from those').toContain('[pageWidth, pageHeight]');
    expect(src, 'the raw box is no longer consulted for this')
      .not.toMatch(/const \{ width: pageWidth, height: pageHeight \} = originalPage\.getSize\(\)/);
  });
});
