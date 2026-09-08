/**
 * [SHELL] The rules that hold in every tool, checked where they can be seen.
 *
 * This file exists because of one defect that shipped twice. Back was moved into
 * a bottom bar in all 22 flows (D2 on the pass sheet, passed by hand). A later
 * fix made the Signature step's column scroll, the bar went with it, and Back
 * left the window — reported again as R1, *"this is D2 for the second time"*.
 *
 * Three source-scanning assertions in BackButtonConsistency.test.ts passed
 * throughout: Back still existed, was still the shared Button, was still in
 * twenty-one flows. None of them could ask the only question that mattered,
 * which is whether a person could see it. That question needs a layout engine.
 */
import { test, expect } from '@playwright/test';
import { bootApp, openTool, expectOnScreen, fixtureBytes, HOME, type Seed } from './support/app';

/**
 * The smallest window the app permits, from `tauri.conf.json`
 * (`minWidth: 900, minHeight: 660`).
 *
 * The contract is the minimum, not the default: a user may drag the window to
 * this size, and everything that must be reachable must still be reachable
 * here. Testing at Playwright's roomy 1280x720 default hid the very regression
 * this file was written to catch — the broken build passed at that size.
 */
test.use({ viewport: { width: 900, height: 660 } });

/** A 1x1 transparent PNG — the tiles only need to render, not to look like anything. */
const PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

/** The ten-signature ceiling, which is the state the regression was reported in. */
function withTenSignatures(): Seed {
  return {
    files: { [`${HOME}/sample.pdf`]: fixtureBytes('sample.pdf') },
    openQueue: [`${HOME}/sample.pdf`],
    stores: {
      'papercut-settings.json': {
        'saved-signatures': Array.from({ length: 10 }, (_, i) => ({
          id: `sig-${i}`,
          name: `Signature ${i + 1}`,
          type: 'typed' as const,
          dataUrl: PIXEL,
          createdAt: 1_757_000_000_000 + i,
        })),
      },
    },
  };
}

test('[SHELL-01] Back stays on screen on the Signature step, however many are saved', async ({ page }) => {
  await bootApp(page, withTenSignatures());
  await openTool(page, 'Sign PDF');
  await page.getByTestId('open-file-btn').click();

  const back = page.getByTestId('back-btn');
  await expect(back).toBeAttached();

  // The exact regression: present, correct, and below the window. `toBeInViewport`
  // is the whole difference between this layer and the one that missed it.
  await expectOnScreen(back, 'Back on the Signature step with ten signatures saved');
});

test('[SHELL-02] the primary action is reachable on the Signature step', async ({ page }) => {
  await bootApp(page, withTenSignatures());
  await openTool(page, 'Sign PDF');
  await page.getByTestId('open-file-btn').click();

  // I4 on the pass sheet: with several signatures saved, Use This Signature sat
  // below the window with no way to reach it. Scrolling to it is allowed —
  // being unable to is not.
  const use = page.getByRole('button', { name: 'Use This Signature' });
  await expect(use).toBeAttached();
  await use.scrollIntoViewIfNeeded();
  await expectOnScreen(use, 'Use This Signature');
});

test('[SHELL-03] the window itself never scrolls; only regions inside it do', async ({ page }) => {
  await bootApp(page, withTenSignatures());
  await openTool(page, 'Sign PDF');
  await page.getByTestId('open-file-btn').click();
  await expect(page.getByTestId('back-btn')).toBeVisible();

  // Papercut is a fixed shell -- `h-screen overflow-hidden` on the root -- with
  // scrolling panes inside it. When the document itself grows, something below
  // has escaped its pane, and whatever sits at the bottom of the screen leaves
  // with it. That is the mechanism behind D1, I4 and R1 alike, so it is worth
  // asserting directly rather than one symptom at a time.
  const overflow = await page.evaluate(() => ({
    doc: document.documentElement.scrollHeight - document.documentElement.clientHeight,
    body: document.body.scrollHeight - document.body.clientHeight,
  }));
  expect(overflow.doc, 'the document does not scroll').toBeLessThanOrEqual(0);
  expect(overflow.body, 'the body does not scroll').toBeLessThanOrEqual(0);
});
