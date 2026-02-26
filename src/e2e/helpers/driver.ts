import type { Browser } from 'webdriverio';
import { mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';

export const E2E_OUTPUT_DIR = join(process.cwd(), 'e2e-output');
export const FIXTURES_DIR = join(process.cwd(), 'test-fixtures-e2e');
export const REAL_FIXTURES_DIR = join(process.cwd(), 'test-fixtures');

/** Ensure e2e-output dir exists and return a unique output path for this test. */
export function prepareOutputPath(filename: string): string {
  mkdirSync(E2E_OUTPUT_DIR, { recursive: true });
  const outPath = join(E2E_OUTPUT_DIR, filename);
  // Clean up any leftover from a previous run
  if (existsSync(outPath)) rmSync(outPath);
  return outPath;
}

/** Wait for the app's step bar to show the target step index (0=Pick, 1=Configure, 2=Compare, 3=Save). */
export async function waitForStep(browser: Browser, stepIndex: number): Promise<void> {
  await browser.waitUntil(
    async () => {
      const active = await browser.$(`[data-testid="step-bar-item"][data-active="true"]`);
      if (!active) return false;
      const idx = await active.getAttribute('data-step-index');
      return idx === String(stepIndex);
    },
    { timeout: 15000, interval: 200, timeoutMsg: `Timed out waiting for step ${stepIndex}` }
  );
}

/** Wait for the loading overlay to disappear (file is loaded). */
export async function waitForFileLoaded(browser: Browser): Promise<void> {
  await browser.waitUntil(
    async () => {
      const spinner = await browser.$('[data-testid="loading-spinner"]');
      return !(await spinner.isDisplayed().catch(() => false));
    },
    { timeout: 10000, interval: 100, timeoutMsg: 'Timed out waiting for file load' }
  );
}

/**
 * Wait for processing to complete by polling for the compare step container.
 *
 * @param browser - WebDriverIO browser instance
 * @param compareTestId - data-testid of the compare step root element.
 *   Use 'compare-step' for PDF tests (default).
 *   Use 'image-compare-step' for image tests.
 */
export async function waitForProcessingComplete(
  browser: Browser,
  compareTestId: 'compare-step' | 'image-compare-step' = 'compare-step'
): Promise<void> {
  await browser.waitUntil(
    async () => {
      const compare = await browser.$(`[data-testid="${compareTestId}"]`);
      return await compare.isDisplayed().catch(() => false);
    },
    { timeout: 90000, interval: 500, timeoutMsg: `Timed out waiting for ${compareTestId} to appear` }
  );
}

/** Take a screenshot on failure. Called from afterEach hooks in test files. */
export async function screenshotOnFailure(browser: Browser, testTitle: string): Promise<void> {
  const dir = join(process.cwd(), '.e2e-artifacts', 'screenshots');
  mkdirSync(dir, { recursive: true });
  const safe = testTitle.replace(/[^a-z0-9]/gi, '_').slice(0, 80);
  await browser.saveScreenshot(join(dir, `${safe}_${Date.now()}.png`));
}
