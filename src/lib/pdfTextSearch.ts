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

export interface TextMatch {
  id: string;
  pageIndex: number;
  text: string;
  /** All four are percentages of the page, so they survive any zoom or scale. */
  x: number;
  y: number;
  width: number;
  height: number;
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

/** The box covering `items`, as page percentages. */
function boxFor(items: TextItem[], pageW: number, pageH: number) {
  const left = Math.min(...items.map((i) => i.transform[4]));
  const right = Math.max(...items.map((i) => i.transform[4] + i.width));
  const height = Math.max(...items.map((i) => Math.abs(i.transform[3]) || i.height || 12));
  const baseline = Math.min(...items.map((i) => i.transform[5]));

  return {
    x: Math.max(0, (left / pageW) * 100),
    // PDF measures y from the bottom; a rectangle on screen is placed from the top.
    y: Math.max(0, ((pageH - baseline - height) / pageH) * 100),
    width: Math.min(((right - left) / pageW) * 100, 100),
    height: Math.min((height / pageH) * 100, 100),
  };
}

/** One box per line the match touches. */
function boxesForCovered(covered: TextItem[], pageW: number, pageH: number) {
  const lines: TextItem[][] = [];

  for (const it of covered) {
    const line = lines.find(
      (l) => Math.abs(l[0].transform[5] - it.transform[5]) <= SAME_LINE_TOLERANCE,
    );
    if (line) line.push(it);
    else lines.push([it]);
  }

  // Never one box spanning several lines: that would black out everything
  // between them, including text the search never matched.
  return lines.map((line) => boxFor(line, pageW, pageH));
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
      const owner: TextItem[] = [];

      for (const it of ordered) {
        for (const ch of it.str) {
          if (/\s/.test(ch)) continue;
          compact += ch.toLowerCase();
          owner.push(it);
        }
      }

      charsSeen += compact.length;

      let from = 0;
      for (;;) {
        const at = compact.indexOf(needle, from);
        if (at === -1) break;

        const covered = [...new Set(owner.slice(at, at + needle.length))];
        for (const box of boxesForCovered(covered, pageW, pageH)) {
          matches.push({
            id: `match-${nextId++}`,
            pageIndex: pageNum - 1,
            text: query.trim(),
            ...box,
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
