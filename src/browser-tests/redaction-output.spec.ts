/**
 * [RED] Redaction, checked by reading the document it produced.
 *
 * This is the one tool where being wrong is not a cosmetic bug. A crop on the
 * wrong edge is embarrassing; a redaction that merely *covers* text ships the
 * text. The content is still in the file, one copy-paste or one `strings` away,
 * and the document looks completely correct to the person who redacted it.
 *
 * Nothing else in the repo can make this check. The Node output-contract suite
 * cannot: `applyRedactions` rasterises through pdf.js and a canvas, neither of
 * which exists under vitest. So it belongs here, in the browser, where both are
 * real — and where the output can be *rendered* and its pixels read, because
 * "the text is gone from the text layer" and "the reader cannot see it" are two
 * different claims and only the second is what a redaction promises.
 *
 * The fixture's three pages are used deliberately: "Lorem" appears on page 2
 * alone, so one search proves both halves of the tool's contract — the marked
 * page is destroyed, and the pages nobody marked are left alone with their text
 * intact. A tool that rasterised everything would satisfy the first half and
 * quietly ruin every document it touched.
 */
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PDFDocument, degrees } from 'pdf-lib';

const SAMPLE = new Uint8Array(readFileSync(join(process.cwd(), 'test-fixtures', 'sample.pdf')));

/** Page 1 carries "Page Two — Lorem Ipsum"; no other page contains "Lorem". */
const ONLY_ON_PAGE_TWO = 'Lorem';

/** The same document, turned — redaction's geometry is where it can go wrong. */
async function turned(angle: number): Promise<number[]> {
  const doc = await PDFDocument.load(SAMPLE);
  for (const page of doc.getPages()) page.setRotation(degrees(angle));
  return Array.from(await doc.save({ useObjectStreams: true }));
}

const UPRIGHT = Array.from(SAMPLE);

test.beforeEach(async ({ page }) => {
  await page.goto('/src/browser-tests/harness.html');
  await page.waitForFunction(() => !!window.__papercut);
});

/** Every text item on a page, as one string. */
async function textOf(page: import('@playwright/test').Page, bytes: number[], index: number) {
  return page.evaluate(async ([b, i]) => {
    const items = await window.__papercut.extractPageText(b as number[], i as number);
    return items.map((it) => it.text).join(' ');
  }, [bytes, index] as const);
}

test('[RED-01] the redacted word is gone from the file, not merely covered', async ({ page }) => {
  const out = await page.evaluate(
    async (b) => window.__papercut.redactBySearch(b, 'Lorem', 'match'),
    UPRIGHT,
  );

  expect(out.rects.length, 'the word was found and marked').toBeGreaterThan(0);
  expect(out.rects.every((r) => r.pageIndex === 1), 'only page 2 was marked').toBe(true);

  // The claim that matters. Not "a black box was drawn" — the text itself is no
  // longer retrievable from the document, because the page was replaced by an
  // image of itself with the box already painted on.
  const after = await textOf(page, out.bytes, 1);
  expect(after, 'the redacted word cannot be read back out').not.toContain(ONLY_ON_PAGE_TWO);
  expect(after.trim(), 'the marked page carries no text layer at all').toBe('');
});

test('[RED-02] pages nobody marked keep their text', async ({ page }) => {
  const out = await page.evaluate(
    async (b) => window.__papercut.redactBySearch(b, 'Lorem', 'match'),
    UPRIGHT,
  );

  // The other half of the contract, and the one a paranoid implementation gets
  // wrong: flattening every page would pass RED-01 and destroy the document.
  expect(await textOf(page, out.bytes, 0), 'page 1 still has its text').toContain('Papercut Test Document');
  expect(await textOf(page, out.bytes, 2), 'page 3 still has its text').toContain('Summary');
});

test('[RED-03] the box is actually painted where the word was', async ({ page }) => {
  const result = await page.evaluate(async (b) => {
    const out = await window.__papercut.redactBySearch(b, 'Lorem', 'match');
    const rect = out.rects[0];
    // The middle of the mark, in the same frame the tool paints in.
    const pixel = await window.__papercut.pixelAt(
      out.bytes,
      rect.pageIndex,
      rect.x + rect.width / 2,
      rect.y + rect.height / 2,
    );
    return { rect, pixel };
  }, UPRIGHT);

  // Rendered and read back, because a mark in the wrong place hides nothing
  // while still passing every "the text is gone" assertion above.
  expect(result.pixel.r, 'the mark is opaque black').toBeLessThan(40);
  expect(result.pixel.g, 'the mark is opaque black').toBeLessThan(40);
  expect(result.pixel.b, 'the mark is opaque black').toBeLessThan(40);
  expect(result.pixel.a, 'the mark is not transparent').toBe(255);
});

test('[RED-04] a see-through colour cannot produce a see-through mark', async ({ page }) => {
  // `resolveRedactionFill` exists because canvas accepts `transparent` and
  // `rgba(0,0,0,0)` for fillStyle, and a box painted with either leaves the
  // content it was meant to cover fully visible — the redaction would look
  // applied and not be. This asserts the outcome rather than the guard.
  for (const colour of ['transparent', 'rgba(0,0,0,0)']) {
    const pixel = await page.evaluate(
      async ([b, c]) => {
        const out = await window.__papercut.redactBySearch(b as number[], 'Lorem', 'match', c as string);
        const rect = out.rects[0];
        return window.__papercut.pixelAt(
          out.bytes,
          rect.pageIndex,
          rect.x + rect.width / 2,
          rect.y + rect.height / 2,
        );
      },
      [UPRIGHT, colour] as const,
    );

    expect(pixel.a, `"${colour}" still paints an opaque mark`).toBe(255);
    expect(pixel.r, `"${colour}" does not leave the content showing`).toBeLessThan(40);
  }
});

for (const angle of [90, 180, 270]) {
  test(`[RED-05] the mark lands on the word on a page turned ${angle}deg`, async ({ page }) => {
    const rotated = await turned(angle);

    const result = await page.evaluate(async (b) => {
      const before = await window.__papercut.getPageDimensions(b, 1);
      const out = await window.__papercut.redactBySearch(b, 'Lorem', 'match');
      const rect = out.rects[0];
      const pixel = await window.__papercut.pixelAt(
        out.bytes,
        rect.pageIndex,
        rect.x + rect.width / 2,
        rect.y + rect.height / 2,
      );
      const items = await window.__papercut.extractPageText(out.bytes, rect.pageIndex);
      const after = await window.__papercut.getPageDimensions(out.bytes, rect.pageIndex);
      return { rect, pixel, before, after, text: items.map((it) => it.text).join(' ') };
    }, rotated);

    expect(result.pixel.a, 'the mark is opaque').toBe(255);
    expect(result.pixel.r, 'the mark is painted').toBeLessThan(40);
    expect(result.text.trim(), 'the marked page still carries no text').toBe('');

    // The claim that actually pins the geometry down.
    //
    // A turned page is where every stamping tool in this project has gone wrong:
    // the intent is applied to the unturned box underneath. Here that mistake is
    // invisible at the mark itself — the box is painted at the coordinates it
    // was given, so sampling those coordinates finds it whether or not they mean
    // anything. What it cannot hide is the *shape*: the replacement page is
    // built from the render, so a page rendered without its rotation comes back
    // portrait where the reader had landscape, which is the squashed-page defect
    // `pdfRedact.ts` describes in its own comment. Sizes come from pdf.js's
    // viewport, so they are the sizes the reader sees, rotation already applied.
    expect(result.after.width, 'the page keeps the width the reader saw').toBeCloseTo(result.before.width, 0);
    expect(result.after.height, 'the page keeps the height the reader saw').toBeCloseTo(result.before.height, 0);
  });
}
