/**
 * [APP-BOOT] The real application, running in a real browser.
 *
 * The first layer in this project that renders the shipped App with a layout
 * engine behind it. Everything here is deliberately shallow — this file proves
 * the harness is real, not that any feature works. If these fail, nothing built
 * on top of them means anything.
 */
import { test, expect } from '@playwright/test';
import { TOOL_REGISTRY } from '@/types/tools';
import { bootApp, openTool, openToolWithFile, tauriCalls, expectOnScreen, withFile } from './support/app';

test('[APP-BOOT-01] the app boots past the splash to a dashboard of enabled tools', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await bootApp(page);

  // Distinct ids, because the favourites strip repeats four cards from the grid
  // below it — counting elements would measure the strip, not the registry.
  const toolIds = await page.evaluate(() => [
    ...new Set([...document.querySelectorAll('[data-tool-id]')].map((e) => e.getAttribute('data-tool-id'))),
  ]);
  // Counted from the registry rather than written down. This said "at least 21"
  // until three tools were removed, at which point the number was simply wrong —
  // and a hardcoded count is wrong in the other direction too, passing quietly
  // when a tool goes missing. The harness pins macOS, so nothing is hidden by
  // the platform gate and every declared tool should be on screen.
  expect(toolIds.length, 'tools offered on the dashboard').toBe(
    Object.keys(TOOL_REGISTRY).length,
  );

  // With every dependency present, nothing should be greyed out. This is the
  // assertion that caught the harness running the app in a degraded state.
  const disabled = await page.evaluate(() =>
    [...document.querySelectorAll('[data-tool-id][data-disabled="true"]')].map((e) =>
      e.getAttribute('data-tool-id'),
    ),
  );
  expect(disabled, 'no tool disabled on a fully equipped machine').toEqual([]);
  expect(errors, 'no uncaught error during boot').toEqual([]);
});

test('[APP-BOOT-02] a real fixture reaches the app through the file dialog', async ({ page }) => {
  await bootApp(page, withFile('sample.pdf'));
  await openToolWithFile(page, 'Compress PDF');

  // Proof the bridge carried real bytes rather than the app inventing state:
  // the dialog was asked, and the path it returned was then read.
  const calls = await tauriCalls(page);
  expect(calls.map((c) => c.api)).toContain('dialog.open');
  expect(
    calls.some((c) => c.api === 'fs.readFile' && c.args[0] === '/Users/tester/sample.pdf'),
    'the chosen file was read from the path the dialog returned',
  ).toBe(true);
});

test('[APP-BOOT-03] Back is genuinely on screen, not merely in the document', async ({ page }) => {
  await bootApp(page, withFile('sample.pdf'));
  await openToolWithFile(page, 'Compress PDF');

  // The assertion the old source-scanning guard could not make. Existence,
  // visibility and position are three different claims, and only the third
  // would have caught the regression that started this work.
  await expectOnScreen(page.getByTestId('back-btn'), 'Back on the Configure step of Compress PDF');
});

test('[APP-BOOT-04] the first step offers a way out to the dashboard', async ({ page }) => {
  await bootApp(page);
  await openTool(page, 'Compress PDF');

  // Before a file is chosen there is no Back — the exit is back-to-dashboard.
  // Written down because the difference is real and a contract that demanded
  // `back-btn` on every step would be demanding the wrong thing here.
  await expectOnScreen(page.getByTestId('back-to-dashboard'), 'the exit from the first step');
  await expect(page.getByTestId('back-btn')).toHaveCount(0);
});

test('[APP-BOOT-05] booting and loading needs no unregistered native call', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await bootApp(page, withFile('sample.pdf'));
  await openToolWithFile(page, 'Compress PDF');

  // The mock throws by design rather than answering `{}`. A clean run means the
  // bridge covers what the app actually reaches for.
  expect(errors.filter((e) => e.includes('[tauri-mock]')), 'no unmocked Tauri call').toEqual([]);
});
