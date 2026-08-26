import type { OcrPage } from '@/lib/ocrProcessor';
import type { Box, TextMatch } from '@/lib/pdfTextSearch';

/**
 * Finds text on a scanned page, using what OCR read.
 *
 * A page with no text layer cannot be searched at all — the redact tool says so
 * today. Once OCR has read it, the same search becomes possible, which is the
 * point of the bonus in the F12 brief.
 *
 * Returns the same shape as `findTextMatches`, so the redact UI treats a scanned
 * page exactly like a digital one: boxes as percentages of the page, measured
 * from the top-left, because that is how the overlay places rectangles.
 *
 * The important difference from pdf.js is granularity. pdf.js reports where each
 * *item* sits, so a match can be measured precisely. Vision reports one box per
 * line of text, so a match *inside* a line has to be interpolated across it.
 * See `interpolate` for how that is handled, and why it errs outward.
 */

let nextId = 1;

/**
 * Extra width added to each side of an interpolated box, as a fraction of the
 * character width.
 *
 * Interpolation assumes every character in a line is the same width, which is
 * false for proportional type: "MM" is far wider than "il". The error is small
 * within one line but it is not zero, and this feeds a redaction that destroys
 * pixels. Erring narrow leaves part of a name showing; erring wide covers a
 * little of the neighbouring character. Only one of those is a privacy failure.
 */
const OVERSCAN = 0.75;

function toBox(
  leftPt: number, widthPt: number, bottomPt: number, heightPt: number,
  pageW: number, pageH: number,
): Box {
  const x = Math.max(0, (leftPt / pageW) * 100);
  return {
    x,
    // OCR measures y from the bottom of the page; the overlay places rectangles
    // from the top. Getting this backwards puts every box on the wrong half of
    // the page while every number still looks plausible.
    y: Math.max(0, ((pageH - bottomPt - heightPt) / pageH) * 100),
    width: Math.min((widthPt / pageW) * 100, 100 - x),
    height: Math.min((heightPt / pageH) * 100, 100),
  };
}

/** Where a character range sits within a line box, assuming even spacing. */
function interpolate(
  block: { x: number; width: number },
  from: number, length: number, total: number,
): { leftPt: number; widthPt: number } {
  if (total <= 0) return { leftPt: block.x, widthPt: block.width };
  const perChar = block.width / total;
  const leftPt = block.x + perChar * from - perChar * OVERSCAN;
  const widthPt = perChar * (length + OVERSCAN * 2);
  // Never spill outside the line the text came from: the neighbouring line is
  // not part of the match, and covering it would destroy unrelated content.
  const clampedLeft = Math.max(block.x, leftPt);
  const maxWidth = block.x + block.width - clampedLeft;
  return { leftPt: clampedLeft, widthPt: Math.min(widthPt, maxWidth) };
}

export function findTextMatchesInOcr(pages: OcrPage[], query: string): TextMatch[] {
  // Whitespace-insensitive on both sides, matching findTextMatches, so a query
  // typed with normal spacing finds text however the line was read.
  const needle = query.toLowerCase().replace(/\s+/g, '');
  if (!needle) return [];

  const matches: TextMatch[] = [];

  for (const page of pages) {
    for (const block of page.blocks) {
      // Each kept character remembers its index in the original string, so an
      // interpolated box maps back to where the character actually sits.
      const kept: number[] = [];
      let compact = '';
      for (let i = 0; i < block.text.length; i++) {
        const ch = block.text[i];
        if (/\s/.test(ch)) continue;
        compact += ch.toLowerCase();
        kept.push(i);
      }

      const line = toBox(block.x, block.width, block.y, block.height, page.width, page.height);

      let from = 0;
      for (;;) {
        const at = compact.indexOf(needle, from);
        if (at === -1) break;

        // Interpolate against the ORIGINAL string, including its spaces: the
        // line was drawn with them, so ignoring them shifts every box left.
        const startChar = kept[at];
        const endChar = kept[at + needle.length - 1] + 1;
        const { leftPt, widthPt } = interpolate(
          block, startChar, endChar - startChar, block.text.length,
        );

        matches.push({
          id: `ocr-match-${nextId++}`,
          pageIndex: page.index,
          text: block.text.slice(startChar, endChar),
          line,
          ...toBox(leftPt, widthPt, block.y, block.height, page.width, page.height),
        });

        from = at + 1;
      }
    }
  }

  return matches;
}
