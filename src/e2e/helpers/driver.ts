import type { Browser } from 'webdriverio';
import { mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { testIdDisplayed, clickTestId, waitForTestId } from './testid';

// Fixture directories — overridable via env vars so CI can place them inside
// /tmp (within Tauri's $TEMP fs scope, which is required for the frontend
// readFile API to succeed).
export const E2E_OUTPUT_DIR = process.env.E2E_OUTPUT_DIR ?? join(process.cwd(), 'e2e-output');
export const FIXTURES_DIR = process.env.E2E_FIXTURES_DIR ?? join(process.cwd(), 'test-fixtures-e2e');
export const REAL_FIXTURES_DIR = process.env.E2E_REAL_FIXTURES_DIR ?? join(process.cwd(), 'test-fixtures');

/** Ensure e2e-output dir exists and return a unique output path for this test. */
export function prepareOutputPath(filename: string): string {
  mkdirSync(E2E_OUTPUT_DIR, { recursive: true });
  const outPath = join(E2E_OUTPUT_DIR, filename);
  // Clean up any leftover from a previous run
  if (existsSync(outPath)) rmSync(outPath);
  return outPath;
}

/**
 * Navigate from the Dashboard to a specific tool.
 * The app starts on the Dashboard (tool grid). Each tool flow begins only after
 * clicking a tool card.  Call this once per session before the first injectFile().
 */
export async function selectToolOnDashboard(browser: Browser, toolName: string): Promise<void> {
  // Wait for the Dashboard to render.  Tool cards are <button> elements
  // whose textContent includes the tool name (e.g. "Compress PDF").
  // We use browser.execute because WebDriver text selectors may be unreliable
  // in WebKitGTK.
  await browser.waitUntil(
    async () =>
      browser.execute((name: string) => {
        const btns = document.querySelectorAll('button');
        for (const btn of btns) {
          if (btn.textContent?.includes(name)) return true;
        }
        return false;
      }, toolName),
    { timeout: 15000, timeoutMsg: `Dashboard tool card "${toolName}" not found` },
  );

  await browser.execute((name: string) => {
    const btns = document.querySelectorAll('button');
    for (const btn of btns) {
      if (btn.textContent?.includes(name)) {
        btn.click();
        return;
      }
    }
  }, toolName);
}

/** Wait for the loading overlay to disappear (file is loaded). */
export async function waitForFileLoaded(browser: Browser): Promise<void> {
  await browser.waitUntil(
    async () =>
      browser.execute(() => {
        const spinner = document.querySelector('[data-testid="loading-spinner"]') as HTMLElement | null;
        if (!spinner) return true;
        const style = getComputedStyle(spinner);
        return style.display === 'none' || style.visibility === 'hidden' || spinner.offsetParent === null;
      }),
    { timeout: 10000, interval: 100, timeoutMsg: 'Timed out waiting for file load' },
  );
}

/**
 * Wait for processing to complete by polling for the compare step container.
 *
 * @param compareTestId - data-testid of the compare step root element.
 *   Use 'compare-step' for PDF tests (default).
 *   Use 'image-compare-step' for image tests.
 */
export async function waitForProcessingComplete(
  browser: Browser,
  compareTestId: 'compare-step' | 'image-compare-step' = 'compare-step',
): Promise<void> {
  await browser.waitUntil(
    async () =>
      browser.execute((id: string) => {
        const el = document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
        if (!el) return false;
        const style = getComputedStyle(el);
        return style.display !== 'none' && style.visibility !== 'hidden' && el.offsetParent !== null;
      }, compareTestId),
    { timeout: 90000, interval: 500, timeoutMsg: `Timed out waiting for ${compareTestId} to appear` },
  );
}

/** Take a screenshot on failure. Called from afterEach hooks in test files. */
export async function screenshotOnFailure(browser: Browser, testTitle: string): Promise<void> {
  const dir = join(process.cwd(), '.e2e-artifacts', 'screenshots');
  mkdirSync(dir, { recursive: true });
  const safe = testTitle.replace(/[^a-z0-9]/gi, '_').slice(0, 80);
  await browser.saveScreenshot(join(dir, `${safe}_${Date.now()}.png`));
}

/**
 * Reset the app back to the open-file page for the given tool.
 *
 * Handles any state the app might be in after a test:
 *   1. Already on open-file page → no-op
 *   2. On compare step with "Start Over" button → click it
 *   3. Stuck on any other step → refresh the page and re-navigate from Dashboard
 */
export async function resetAppState(browser: Browser, toolName: string): Promise<void> {
  // Case 1: already on the open-file page
  if (await testIdDisplayed(browser, 'open-file-btn')) return;

  // Case 2: on compare/save step with "Start Over" link
  try {
    if (await testIdDisplayed(browser, 'process-another-btn')) {
      await clickTestId(browser, 'process-another-btn');
      await waitForTestId(browser, 'open-file-btn', { timeout: 5000 });
      return;
    }
  } catch (_e) {
    // Ignore click/wait failures — the button may have disappeared during a
    // page transition or the app may be in a transient state.  Fall through
    // to the hard-refresh recovery below.
  }

  // Case 3: stuck in an unknown state — hard refresh resets everything
  await browser.refresh();
  await selectToolOnDashboard(browser, toolName);
  await waitForTestId(browser, 'open-file-btn', { timeout: 10000 });
}
