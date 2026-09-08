/**
 * Booting the real Papercut in Chromium, and the small vocabulary tests use to drive it.
 *
 * Everything above the Tauri bridge is the shipped code: the same App, the same
 * components, the same CSS, laid out by a real engine. That is the whole point —
 * the assertions this enables (is the control *on screen*, does the column
 * really scroll, did the drop get refused) are the ones no jsdom test in this
 * repo can make, and they are where the defects have been coming from.
 */
import { expect, type Page, type Locator } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TauriMockState } from '../tauri-mock/state';

export type Seed = Partial<TauriMockState>;

/** Where the mock filesystem pretends the user keeps things. */
export const HOME = '/Users/tester';

/**
 * A machine with everything installed, which is the baseline most tests want.
 *
 * Without it the dashboard renders four tools disabled behind an install hint,
 * because `detect_converters` is how the app learns whether Ghostscript,
 * Calibre and LibreOffice exist. The mock throws on unregistered commands, and
 * `useDependencies` catches that and assumes nothing is available — so a suite
 * with no seed would quietly be testing a crippled app. A test that wants the
 * missing-dependency state says so by overriding this.
 */
const DEFAULT_SEED: Seed = {
  invokeResults: {
    detect_converters: JSON.stringify({ ghostscript: true, calibre: true, libreoffice: true }),
  },
};

/** Fixture bytes, as the JSON-safe array the mock state carries. */
export function fixtureBytes(name: string): number[] {
  return Array.from(readFileSync(join(process.cwd(), 'test-fixtures', name)));
}

/** A seed placing one committed fixture at a path the open dialog will return. */
export function withFile(name: string, at = `${HOME}/${name}`): Seed {
  return { files: { [at]: fixtureBytes(name) }, openQueue: [at] };
}

/**
 * Boot the app and wait until it is actually usable.
 *
 * The splash screen holds for four seconds on a `setTimeout`, and renders over
 * the dashboard rather than instead of it — so waiting for the dashboard to
 * exist proves nothing, and a click would land on the overlay. Playwright's fake
 * clock advances past it without a test hook in production code.
 */
export async function bootApp(page: Page, seed: Seed = {}): Promise<void> {
  const merged: Seed = {
    ...DEFAULT_SEED,
    ...seed,
    invokeResults: { ...DEFAULT_SEED.invokeResults, ...seed.invokeResults },
  };

  await page.addInitScript((s) => {
    (window as unknown as { __TAURI_MOCK__: unknown }).__TAURI_MOCK__ = s;
  }, merged);

  // Installed before navigation so the app's own timers are faked from the
  // first tick. A fixed origin keeps anything date-dependent deterministic.
  await page.clock.install({ time: new Date('2026-09-08T09:00:00Z') });
  await page.goto('/src/browser-tests/app.html');

  // Wait for the splash to actually be on screen before winding the clock on.
  // Its timers are registered by an effect, so advancing time before React has
  // mounted fires nothing and leaves the overlay up for the full four seconds.
  // By test id, not by its heading: the dashboard behind it carries a
  // "Papercut" heading of its own, and both are mounted at once.
  const splash = page.getByTestId('splash-screen');
  await expect(splash).toBeVisible();

  // Past the 4s hold and the 500ms fade, then let the app run on real time
  // again so nothing downstream has to reason about a frozen clock.
  await page.clock.runFor(5_000);
  await expect(splash).toHaveCount(0);
  await page.clock.resume();

  await expect(page.getByTestId('dashboard')).toBeVisible();
}

/** Open a tool from the dashboard by its visible name. */
export async function openTool(page: Page, name: string): Promise<void> {
  await page.getByTestId('tool-card').filter({ hasText: name }).first().click();
  await expect(page.getByTestId('dashboard')).toHaveCount(0);
}

/**
 * Open a tool and take a real document through its file picker.
 *
 * Stops when the configure step is on screen rather than when the click
 * returns: the read, the page count and the compressibility scan all happen
 * after it, and asserting before they land tests the loading state by accident.
 */
export async function openToolWithFile(page: Page, name: string): Promise<void> {
  await openTool(page, name);
  await page.getByTestId('open-file-btn').click();
  await expect(page.getByTestId('configure-step')).toBeVisible();
}

/** Every mocked Tauri call so far, for effects that leave no mark on screen. */
export async function tauriCalls(page: Page): Promise<{ api: string; args: unknown[] }[]> {
  return page.evaluate(
    () => (window as unknown as { __TAURI_MOCK__: TauriMockState }).__TAURI_MOCK__.calls,
  );
}

/**
 * Fire a native file drop the way Tauri would.
 *
 * Papercut does not listen for DOM drag events — it listens on Tauri's webview
 * channel, which carries filesystem paths rather than a DataTransfer. So a
 * DOM-level drop would test nothing real; this drives the same handler the OS
 * drives, which is why the mock parks it on `window`.
 */
export async function dropFiles(page: Page, paths: string[]): Promise<void> {
  const delivered = await page.evaluate((p) => {
    const fire = (window as unknown as { __papercutDrop?: (x: unknown) => void }).__papercutDrop;
    if (!fire) return false;
    fire({ type: 'drop', position: { x: 400, y: 300 }, paths: p });
    return true;
  }, paths);

  // A drop that reached no listener would otherwise look like a drop the app
  // chose to ignore, which is a very different bug.
  expect(delivered, 'the app registered a Tauri drag-drop listener').toBe(true);
}

/**
 * Assert a control is genuinely on screen, not merely in the document.
 *
 * This is the assertion the whole harness exists for. `BackButtonConsistency`
 * could see that Back existed, was a shared Button, and sat in 21 flows — and
 * still passed while Back sat below the window, because nothing it could reach
 * knew where the window ended.
 */
export async function expectOnScreen(control: Locator, what: string): Promise<void> {
  await expect(control, `${what} is in the document`).toBeAttached();
  await expect(control, `${what} is visible`).toBeVisible();
  await expect(control, `${what} is inside the viewport`).toBeInViewport({ ratio: 0.9 });
}
