/**
 * [MAIN] The window keeps painting while the work happens.
 *
 * A new dimension for this project, and the one the other layers cannot reach:
 * every test so far asks whether the app is *correct*, and none asks whether it
 * is *usable while it works*. Redacting a single photographic page used to
 * occupy the main thread for eleven seconds in one unbroken task — nothing
 * repaints, no progress can be shown however well the code knows it, and the
 * operating system offers to close the application.
 *
 * `PerformanceObserver` with `longtask` is the browser's own definition of that
 * state: a task holding the main thread for more than 50ms. It is the right
 * instrument here, and it replaced a first attempt that watched
 * `requestAnimationFrame` gaps and reported a synchronous 700ms encode as 0ms of
 * blocking, because rAF does not fire reliably in a page nobody is looking at.
 *
 * How the number below was reached, on `photo_heavy.pdf`, whose first page
 * renders to 68 megapixels:
 *
 *   11,196ms  as shipped: toDataURL, then base64-decoded a character at a time
 *    8,933ms  toBlob, which hands the encode to the browser's own thread
 *    2,460ms  and a 12-megapixel raster budget, which no page up to A2 reaches
 *      428ms  and pdf-lib's embedPng and save moved into a worker
 *
 * What remains is pdf.js rasterising, which would need OffscreenCanvas to move
 * as well — a platform requirement deliberately not taken on for the last
 * fraction of a second.
 *
 * Note what the third line is *not*. Once the worker exists, removing the raster
 * budget no longer shows up here at all: the pdf-lib work it was shrinking now
 * happens somewhere else, and the main thread barely notices the difference
 * between a 12- and a 68-megapixel render. The budget still matters — it is the
 * difference between a 25 MB output and a 72 MB one — but that is an output
 * contract, and it is guarded as one by RED-06, not by this file. Deleting the
 * budget passes both tests below, which is correct and worth knowing.
 */
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** A real document whose first page is enormous. The cost is area, not pages. */
const PHOTO_HEAVY = Array.from(
  readFileSync(join(process.cwd(), 'test-fixtures', 'photo_heavy.pdf')),
);

/**
 * The ceiling for one uninterrupted block of the main thread.
 *
 * Measured at ~430ms, so this is roughly four times the observed value: a
 * shared CI runner is slower and more variable than a laptop, and a performance
 * guard that flakes gets muted, which is worse than not having one. It is still
 * well below the regression it exists to catch: running the assembly inline
 * instead of on a worker measured 2,618ms here, so there is no room for that to
 * slip through unnoticed.
 */
const MAX_BLOCK_MS = 2_000;

test('[MAIN-01] redacting a huge page never blocks the window for long', async ({ page }) => {
  const workers: string[] = [];
  page.on('worker', (w) => workers.push(w.url()));

  await page.goto('/src/browser-tests/harness.html');
  await page.waitForFunction(() => !!window.__papercut);

  const result = await page.evaluate(async (bytes) => {
    const tasks: number[] = [];
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) tasks.push(Math.round(entry.duration));
    });
    observer.observe({ entryTypes: ['longtask'] });

    const out = await window.__papercut.redactRects(bytes, [
      { pageIndex: 0, x: 20, y: 20, width: 30, height: 20 },
    ]);

    // The observer reports in batches, so give it a turn before reading.
    await new Promise((resolve) => setTimeout(resolve, 400));
    observer.disconnect();

    return { tasks, worst: tasks.length ? Math.max(...tasks) : 0, outputBytes: out.length };
  }, PHOTO_HEAVY);

  expect(result.outputBytes, 'a document was actually produced').toBeGreaterThan(0);
  expect(
    result.worst,
    `longest single block was ${result.worst}ms; all blocks: [${result.tasks.join(', ')}]`,
  ).toBeLessThan(MAX_BLOCK_MS);
});

test('[MAIN-02] the assembly really runs on a worker, not on the window', async ({ page }) => {
  const workers: string[] = [];
  page.on('worker', (w) => workers.push(w.url()));

  await page.goto('/src/browser-tests/harness.html');
  await page.waitForFunction(() => !!window.__papercut);
  await page.evaluate(
    async (bytes) =>
      void (await window.__papercut.redactRects(bytes, [
        { pageIndex: 0, x: 20, y: 20, width: 30, height: 20 },
      ])),
    PHOTO_HEAVY,
  );

  // Asserted separately from the timing because the fallback path is silent by
  // design: `assembleRedacted` runs inline wherever `Worker` is undefined, and
  // produces identical output. Without this, a build that quietly stopped
  // bundling the worker would keep passing every correctness test and only show
  // up as a timing number drifting back towards two and a half seconds.
  expect(
    workers.some((url) => url.includes('pdfRedactAssembly')),
    `workers seen: ${workers.map((u) => u.split('/').pop()).join(', ') || 'none'}`,
  ).toBe(true);
});
