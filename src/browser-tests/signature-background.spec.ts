/**
 * [BROWSER-SIGBG] The signature background, in a real browser.
 *
 * Reported twice: choosing a background colour did nothing, in Sign PDF and
 * again in the editor. Both times the tests said the code was fine, because
 * both times the tests could only read the source.
 *
 * The reason no other layer can assert this:
 *
 *   - jsdom has no canvas, so `applySignatureBackground` cannot run there at
 *     all. Every unit test around it stubs it out.
 *   - The first failure was the app's own content security policy --
 *     `connect-src ipc: http://ipc.localhost` refuses `data:` -- which a
 *     browser does not apply and a unit test cannot see.
 *
 * So this runs the real compositor, in a real browser, and reads the pixels
 * back. It is the only assertion in the project that can tell "the colour was
 * chosen" from "the colour arrived".
 */
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/src/browser-tests/harness.html');
  await page.waitForFunction(() => !!window.__papercut);
});

test('[BROWSER-SIGBG-01] a chosen colour reaches the pixels', async ({ page }) => {
  // Magenta, because it is nothing like the transparent black it replaces and
  // nothing like any of the near-white presets: a wrong answer cannot pass.
  const { background } = await page.evaluate(() => window.__papercut.compositeSignature('#ff00ff'));

  expect(background.a, 'the corner is still transparent: no background was applied').toBe(255);
  expect(background, 'the corner is not the colour that was asked for').toMatchObject({
    r: 255, g: 0, b: 255,
  });
});

test('[BROWSER-SIGBG-02] each preset stock arrives as itself', async ({ page }) => {
  // The three presets are page stocks, so they sit within a few levels of each
  // other. A compositor that ignored the argument and painted white would pass
  // a looser check on two of the three.
  const stocks = [
    { colour: '#ffffff', rgb: { r: 255, g: 255, b: 255 } },
    { colour: '#faf8f2', rgb: { r: 250, g: 248, b: 242 } },
    { colour: '#f5f5f5', rgb: { r: 245, g: 245, b: 245 } },
  ];

  for (const stock of stocks) {
    const { background } = await page.evaluate(
      (c) => window.__papercut.compositeSignature(c), stock.colour,
    );
    expect(background, `${stock.colour} did not arrive`).toMatchObject({ ...stock.rgb, a: 255 });
  }
});

test('[BROWSER-SIGBG-03] the signature itself survives the background', async ({ page }) => {
  // Composited *under* the ink, not over it. Painting the rectangle on top
  // would produce a perfectly uniform image -- which is what a check that only
  // sampled the background corner would happily call a pass.
  const { ink } = await page.evaluate(() => window.__papercut.compositeSignature('#ff00ff'));

  expect(ink, 'the background was painted over the signature').toMatchObject({ r: 0, g: 0, b: 0 });
});
