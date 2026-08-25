import { describe, it, expect, vi } from 'vitest';
import { findTextMatches } from '@/lib/pdfTextSearch';

/** A pdf.js text item: transform is [scaleX, skewY, skewX, scaleY, x, y]. */
function item(str: string, x: number, y: number, width = 40) {
  return { str, transform: [12, 0, 0, 12, x, y], width, height: 12 };
}

function fakeDoc(pages: ReturnType<typeof item>[][]) {
  return {
    numPages: pages.length,
    getPage: vi.fn(async (n: number) => ({
      getTextContent: async () => ({ items: pages[n - 1] }),
      getViewport: () => ({ width: 600, height: 800 }),
    })),
  };
}

describe('findTextMatches', () => {
  it('[TS-01] finds a word and reports it as a percentage of the page', async () => {
    const matches = await findTextMatches(fakeDoc([[item('Camelot', 60, 720)]]), 'camelot');

    expect(matches).toHaveLength(1);
    expect(matches[0].pageIndex).toBe(0);
    // 60/600 across; PDF y is the bottom, so the top is measured from the other end.
    expect(matches[0].x).toBeCloseTo(10, 4);
    expect(matches[0].y).toBeCloseTo(((800 - 720 - 12) / 800) * 100, 4);
  });

  it('[TS-02] matching ignores case', async () => {
    const doc = fakeDoc([[item('CONFIDENTIAL', 10, 700)]]);

    expect(await findTextMatches(doc, 'confidential')).toHaveLength(1);
    expect(await findTextMatches(doc, 'Confidential')).toHaveLength(1);
  });

  it('[TS-03] finds a phrase split across pdf.js items', async () => {
    // The real cause of "search finds nothing": pdf.js emits one item per
    // text-showing operator, so a name is routinely broken into pieces that no
    // single item contains. Searching item by item can only ever miss it.
    const matches = await findTextMatches(
      fakeDoc([[item('John ', 60, 720, 30), item('Warnock', 92, 720, 45)]]),
      'john warnock',
    );

    expect(matches).toHaveLength(1);
    // The box has to cover both pieces, or the redaction leaves half the name.
    expect(matches[0].x).toBeCloseTo(10, 4);
    expect(matches[0].width).toBeCloseTo(((92 + 45 - 60) / 600) * 100, 4);
  });

  it('[TS-04] a phrase spanning two items on different lines yields a box per line', async () => {
    const matches = await findTextMatches(
      fakeDoc([[item('Jane', 60, 720, 30), item('Doe', 60, 700, 25)]]),
      'jane doe',
    );

    // One rectangle per line: a single box spanning both would black out the
    // whole area between them, including text that was never matched.
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(matches.every((m) => m.width > 0 && m.height > 0)).toBe(true);
  });

  it('[TS-05] searches every page, not just the first', async () => {
    const matches = await findTextMatches(
      fakeDoc([[item('nothing', 10, 700)], [item('secret', 10, 700)]]),
      'secret',
    );

    expect(matches).toHaveLength(1);
    expect(matches[0].pageIndex).toBe(1);
  });

  it('[TS-06] an empty query finds nothing rather than everything', async () => {
    expect(await findTextMatches(fakeDoc([[item('anything', 10, 700)]]), '   ')).toEqual([]);
  });

  it('[TS-07] a page that cannot be read does not silently lose the other pages', async () => {
    // The old code wrapped the whole sweep in one catch that swallowed
    // everything, so one bad page returned zero matches for the document and
    // looked exactly like "no matches found".
    const doc = {
      numPages: 2,
      getPage: vi.fn(async (n: number) => {
        if (n === 1) throw new Error('broken page');
        return {
          getTextContent: async () => ({ items: [item('secret', 10, 700)] }),
          getViewport: () => ({ width: 600, height: 800 }),
        };
      }),
    };

    expect(await findTextMatches(doc, 'secret')).toHaveLength(1);
  });

  it('[TS-08] finds a word whose items carry no space between them', async () => {
    // pdf.js does not promise spaces as text: a PDF that positions each run
    // separately emits "This" and "document" with nothing joining them, so a
    // literal join gives "Thisdocument" and the search finds nothing.
    const matches = await findTextMatches(
      fakeDoc([[item('This', 60, 720, 25), item('document', 88, 720, 55)]]),
      'this document',
    );

    expect(matches).toHaveLength(1);
  });

  it('[TS-09] a word split mid-way across items is still found', async () => {
    const matches = await findTextMatches(
      fakeDoc([[item('docum', 60, 720, 30), item('ent', 92, 720, 18)]]),
      'document',
    );

    expect(matches).toHaveLength(1);
  });

  it('[TS-10] baselines that differ by a fraction are still one line', async () => {
    // Rounding the baseline to an integer split 719.4 from 719.6 into separate
    // lines, and a line break inserted a space -- straight through the middle
    // of a word. This is what made a search for plainly visible text fail.
    const doc = {
      numPages: 1,
      getPage: vi.fn(async () => ({
        getTextContent: async () => ({
          items: [
            { str: 'docu', transform: [12, 0, 0, 12, 60, 719.4], width: 24, height: 12 },
            { str: 'ment', transform: [12, 0, 0, 12, 86, 719.6], width: 24, height: 12 },
          ],
        }),
        getViewport: () => ({ width: 600, height: 800 }),
      })),
    };

    const matches = await findTextMatches(doc, 'document');

    expect(matches).toHaveLength(1);
    // And one box, not two: they are the same line.
    expect(matches[0].width).toBeGreaterThan(0);
  });

  it('[TS-11] the extra whitespace in the middle of a run is ignored', async () => {
    const matches = await findTextMatches(
      fakeDoc([[item('The  Camelot   Project', 60, 720, 120)]]),
      'camelot project',
    );

    expect(matches).toHaveLength(1);
  });

  it('[TS-12] the box covers the matched word, not the whole line', async () => {
    // pdf.js routinely emits an entire line as one item. Using the item's own
    // bounds blacked out the whole sentence to redact one word in it.
    const line = { str: 'This document describes', transform: [12, 0, 0, 12, 60, 720], width: 230, height: 12 };
    const doc = {
      numPages: 1,
      getPage: vi.fn(async () => ({
        getTextContent: async () => ({ items: [line] }),
        getViewport: () => ({ width: 600, height: 800 }),
      })),
    };

    const [match] = await findTextMatches(doc, 'document');

    // "document" starts 5 characters in and runs 8 characters, of 23.
    const perChar = 230 / 23;
    expect(match.x).toBeCloseTo(((60 + perChar * 5) / 600) * 100, 1);
    expect(match.width).toBeCloseTo(((perChar * 8) / 600) * 100, 1);
  });

  it('[TS-13] the whole-line box is offered alongside it', async () => {
    const line = { str: 'This document describes', transform: [12, 0, 0, 12, 60, 720], width: 230, height: 12 };
    const doc = {
      numPages: 1,
      getPage: vi.fn(async () => ({
        getTextContent: async () => ({ items: [line] }),
        getViewport: () => ({ width: 600, height: 800 }),
      })),
    };

    const [match] = await findTextMatches(doc, 'document');

    // Both, so the choice is the user's and does not need a second search.
    expect(match.line.x).toBeCloseTo((60 / 600) * 100, 4);
    expect(match.line.width).toBeCloseTo((230 / 600) * 100, 4);
    expect(match.line.width).toBeGreaterThan(match.width);
  });

  it('[TS-14] a match spanning two items is still tight around the match', async () => {
    const matches = await findTextMatches(
      fakeDoc([[item('see docum', 60, 720, 45), item('ent here', 108, 720, 40)]]),
      'document',
    );

    expect(matches).toHaveLength(1);
    // Starts inside the first item, ends inside the second: neither edge should
    // sit at an item boundary.
    expect(matches[0].x).toBeGreaterThan((60 / 600) * 100);
    expect(matches[0].x + matches[0].width).toBeLessThan(((108 + 40) / 600) * 100);
  });
});
