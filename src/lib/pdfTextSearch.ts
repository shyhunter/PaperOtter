/**
 * Finds text in a PDF and reports where it sits, as percentages of the page.
 *
 * Shared by the standalone Redact tool and the editor's redact panel, so both
 * find the same things -- and so this can be tested, which it could not be while
 * it lived inline in a component next to a catch that swallowed every failure.
 */

import { diagLog } from '@/lib/diagLog';

/** A pdf.js text item. transform is [scaleX, skewY, skewX, scaleY, x, y]. */
interface TextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
}

interface PageLike {
  getTextContent(): Promise<{ items: unknown[] }>;
  getViewport(opts?: { scale: number }): { width: number; height: number };
}

interface DocLike {
  numPages: number;
  getPage(pageNumber: number): Promise<PageLike>;
}

export interface Box {
  /** All four are percentages of the page, so they survive any zoom or scale. */
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TextMatch extends Box {
  id: string;
  pageIndex: number;
  text: string;
  /** The whole line the match sits on. Offered alongside the tight box so the
   *  user can choose to cover the surrounding words too -- redacting a name
   *  often means redacting the sentence it appears in -- without a second search. */
  line: Box;
}

let nextId = 1;

/** Two items belong to the same line if their baselines are this close, in points. */
const SAME_LINE_TOLERANCE = 3;

/** Items in reading order: top line first, left to right within a line. */
function inReadingOrder(items: unknown[]): TextItem[] {
  return (items as TextItem[])
    .filter((it) => typeof it?.str === 'string' && it.str !== '')
    .sort((a, b) => {
      const delta = b.transform[5] - a.transform[5];
      // Not rounded to an integer: 719.4 and 719.6 are one line, and rounding
      // put them in different ones -- which inserted a line break, and a space,
      // straight through the middle of a word.
      return Math.abs(delta) > SAME_LINE_TOLERANCE ? delta : a.transform[4] - b.transform[4];
    });
}

/** A character kept for matching, and where it sits horizontally. */
interface CharSpan {
  item: TextItem;
  /** Left and right edge of this character, in PDF points. */
  left: number;
  right: number;
}

/**
 * The horizontal extent of one character, interpolated across its item.
 *
 * pdf.js gives a width per item, not per glyph, and an item is routinely a
 * whole line -- so without interpolating, redacting one word blacked out the
 * sentence containing it. Proportional spacing makes this an approximation for
 * variable-width fonts; it errs by a fraction of a character, where the
 * alternative erred by a whole line.
 */
function charSpan(item: TextItem, index: number): { left: number; right: number } {
  const count = item.str.length || 1;
  const perChar = item.width / count;
  const x = item.transform[4];
  return { left: x + perChar * index, right: x + perChar * (index + 1) };
}

function heightOf(item: TextItem): number {
  return Math.abs(item.transform[3]) || item.height || 12;
}

function toBox(left: number, right: number, baseline: number, height: number, pageW: number, pageH: number): Box {
  return {
    x: Math.max(0, (left / pageW) * 100),
    // PDF measures y from the bottom; a rectangle on screen is placed from the top.
    y: Math.max(0, ((pageH - baseline - height) / pageH) * 100),
    width: Math.min(((right - left) / pageW) * 100, 100),
    height: Math.min((height / pageH) * 100, 100),
  };
}

/** Groups spans by the line they sit on. */
function byLine<T extends { item: TextItem }>(entries: T[]): T[][] {
  const lines: T[][] = [];
  for (const entry of entries) {
    const line = lines.find(
      (l) => Math.abs(l[0].item.transform[5] - entry.item.transform[5]) <= SAME_LINE_TOLERANCE,
    );
    if (line) line.push(entry);
    else lines.push([entry]);
  }
  return lines;
}

/** One tight box per line the match touches, never one spanning several -- that
 *  would black out everything between them, including text nobody matched. */
function boxesForSpans(spans: CharSpan[], pageW: number, pageH: number): Box[] {
  return byLine(spans).map((line) => {
    const height = Math.max(...line.map((s) => heightOf(s.item)));
    const baseline = Math.min(...line.map((s) => s.item.transform[5]));
    return toBox(
      Math.min(...line.map((s) => s.left)),
      Math.max(...line.map((s) => s.right)),
      baseline, height, pageW, pageH,
    );
  });
}

/** The full extent of every item on the same line as `spans`. */
function lineBoxForSpans(spans: CharSpan[], all: TextItem[], pageW: number, pageH: number): Box {
  const baseline = spans[0].item.transform[5];
  const onLine = all.filter((it) => Math.abs(it.transform[5] - baseline) <= SAME_LINE_TOLERANCE);
  const height = Math.max(...onLine.map(heightOf));

  return toBox(
    Math.min(...onLine.map((it) => it.transform[4])),
    Math.max(...onLine.map((it) => it.transform[4] + it.width)),
    Math.min(...onLine.map((it) => it.transform[5])),
    height, pageW, pageH,
  );
}

export async function findTextMatches(doc: DocLike, query: string): Promise<TextMatch[]> {
  // Whitespace-insensitive on both sides, so a query typed with normal spacing
  // matches text however the PDF happens to have broken it up.
  const needle = query.toLowerCase().replace(/\s+/g, '');
  if (!needle) return [];

  const matches: TextMatch[] = [];
  // Extraction cannot be exercised in tests -- pdf.js does not run in the test
  // environment -- so the log has to be able to answer "was there any text?".
  let itemsSeen = 0;
  let charsSeen = 0;

  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    // Per page, not around the whole sweep: one unreadable page used to return
    // zero matches for the entire document, indistinguishable from "not found".
    try {
      const page = await doc.getPage(pageNum);
      const { items } = await page.getTextContent();
      const { width: pageW, height: pageH } = page.getViewport({ scale: 1 });

      const ordered = inReadingOrder(items);
      itemsSeen += ordered.length;

      // Whitespace is dropped from both sides before matching, and every kept
      // character remembers which item it came from.
      //
      // pdf.js makes no promise about spaces. A PDF that positions each run
      // separately emits "This" and "document" with nothing joining them, and
      // one that letter-spaces a heading emits fragments mid-word. Matching the
      // literal text therefore fails on documents where the words are plainly
      // visible on the page -- which is exactly what was reported.
      let compact = '';
      const spans: CharSpan[] = [];

      for (const it of ordered) {
        for (let i = 0; i < it.str.length; i++) {
          const ch = it.str[i];
          if (/\s/.test(ch)) continue;
          compact += ch.toLowerCase();
          spans.push({ item: it, ...charSpan(it, i) });
        }
      }

      charsSeen += compact.length;

      let from = 0;
      for (;;) {
        const at = compact.indexOf(needle, from);
        if (at === -1) break;

        const covered = spans.slice(at, at + needle.length);
        const line = lineBoxForSpans(covered, ordered, pageW, pageH);

        for (const box of boxesForSpans(covered, pageW, pageH)) {
          matches.push({
            id: `match-${nextId++}`,
            pageIndex: pageNum - 1,
            text: query.trim(),
            ...box,
            line,
          });
        }
        from = at + 1;
      }
    } catch {
      // An unreadable page contributes nothing; the rest of the document still counts.
    }
  }

  diagLog(
    `textSearch pages=${doc.numPages} items=${itemsSeen} chars=${charsSeen} ` +
    `needle=${needle.length} matches=${matches.length}`,
  );

  return matches;
}
