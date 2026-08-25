/**
 * Finds text in a PDF and reports where it sits, as percentages of the page.
 *
 * Shared by the standalone Redact tool and the editor's redact panel, so both
 * find the same things -- and so this can be tested, which it could not be while
 * it lived inline in a component next to a catch that swallowed every failure.
 */

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

/** Items in reading order: top line first, left to right within a line. */
function inReadingOrder(items: unknown[]): TextItem[] {
  return (items as TextItem[])
    .filter((it) => typeof it?.str === 'string' && it.str !== '')
    .sort((a, b) => {
      // Round the baseline: two items on one line rarely share it to the decimal.
      const lineDelta = Math.round(b.transform[5]) - Math.round(a.transform[5]);
      return lineDelta !== 0 ? lineDelta : a.transform[4] - b.transform[4];
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
  const byLine = new Map<number, TextItem[]>();
  for (const it of covered) {
    const line = Math.round(it.transform[5]);
    byLine.set(line, [...(byLine.get(line) ?? []), it]);
  }
  // Never one box spanning several lines: that would black out everything
  // between them, including text the search never matched.
  return [...byLine.values()].map((line) => boxFor(line, pageW, pageH));
}

export async function findTextMatches(doc: DocLike, query: string): Promise<TextMatch[]> {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];

  const matches: TextMatch[] = [];

  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    // Per page, not around the whole sweep: one unreadable page used to return
    // zero matches for the entire document, indistinguishable from "not found".
    try {
      const page = await doc.getPage(pageNum);
      const { items } = await page.getTextContent();
      const { width: pageW, height: pageH } = page.getViewport({ scale: 1 });

      const ordered = inReadingOrder(items);

      // One string for the whole page rather than one per item. pdf.js emits an
      // item per text-showing operator, so a name is routinely split across
      // several -- matching item by item can only ever miss it, which is why
      // searching for something plainly on the page found nothing at all.
      // Lines are joined with a space so a phrase that wraps is still found.
      let haystack = '';
      const spans: { item: TextItem; from: number; to: number }[] = [];
      let previousLine: number | null = null;

      for (const it of ordered) {
        const line = Math.round(it.transform[5]);
        if (previousLine !== null && line !== previousLine) haystack += ' ';
        previousLine = line;

        const from = haystack.length;
        haystack += it.str;
        spans.push({ item: it, from, to: haystack.length });
      }

      const lower = haystack.toLowerCase();
      let from = 0;
      for (;;) {
        const at = lower.indexOf(needle, from);
        if (at === -1) break;
        const end = at + needle.length;

        const covered = spans.filter((s) => s.from < end && s.to > at).map((s) => s.item);
        for (const box of boxesForCovered(covered, pageW, pageH)) {
          matches.push({
            id: `match-${nextId++}`,
            pageIndex: pageNum - 1,
            text: haystack.slice(at, end),
            ...box,
          });
        }
        from = at + 1;
      }
    } catch {
      // An unreadable page contributes nothing; the rest of the document still counts.
    }
  }

  return matches;
}
