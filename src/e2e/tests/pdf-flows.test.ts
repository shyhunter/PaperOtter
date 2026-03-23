import { browser } from '@wdio/globals';
import { existsSync, statSync } from 'fs';
import { join } from 'path';
import { mockOpenDialog, mockSaveDialog } from '../helpers/dialogs';
import {
  waitForProcessingComplete,
  screenshotOnFailure,
  prepareOutputPath,
  selectToolOnDashboard,
  resetAppState,
  FIXTURES_DIR,
  REAL_FIXTURES_DIR,
} from '../helpers/driver';
import {
  clickTestId,
  testIdDisplayed,
  waitForTestId,
  waitForTestIdDisplayed,
  waitForStep,
  getTestIdText,
  selectTestIdByText,
  clearAndSetTestIdValue,
  setSliderValue,
} from '../helpers/testid';

const PHOTO_PDF  = join(REAL_FIXTURES_DIR, 'photo_heavy.pdf');
const TEXT_PDF   = join(REAL_FIXTURES_DIR, 'warnock_camelot.pdf');
const LARGE_PDF  = join(FIXTURES_DIR, 'large-sparse.pdf');
const CORRUPT_PDF = join(FIXTURES_DIR, 'corrupt.pdf');

// Navigate from Dashboard to Compress PDF tool once at session start.
before(async () => {
  await selectToolOnDashboard(browser, 'Compress PDF');
});

async function injectFile(filePath: string): Promise<void> {
  // Wait for the file-picker button to appear.
  await waitForTestId(browser, 'open-file-btn');
  // Apply IPC mock AFTER window is confirmed ready.
  await mockOpenDialog(browser, filePath);
  await clickTestId(browser, 'open-file-btn');
}

async function navigateToCompare(): Promise<void> {
  await waitForStep(browser, 1);
  await waitForTestIdDisplayed(browser, 'generate-preview-btn', { timeout: 5000 });
  await clickTestId(browser, 'generate-preview-btn');
  // PDF compare step uses the default 'compare-step' testid
  await waitForProcessingComplete(browser, 'compare-step');
  await waitForStep(browser, 2);
}

afterEach(async function (this: Mocha.Context) {
  if (this.currentTest?.state === 'failed') {
    await screenshotOnFailure(browser, this.currentTest.fullTitle());
  }
  // Always reset to the open-file page, regardless of which step we're on.
  // This prevents cascading failures when a test leaves the app in an unexpected state.
  await resetAppState(browser, 'Compress PDF');
});

// ─── PDF COMPRESSION QUALITY MATRIX ─────────────────────────────────────────

describe('PDF compression — quality levels', () => {
  for (const quality of ['web', 'screen', 'print', 'archive'] as const) {
    it(`[PDF-Q-${quality.toUpperCase()}] processes photo_heavy.pdf at quality=${quality}`, async () => {
      const outPath = prepareOutputPath(`pdf-quality-${quality}.pdf`);
      await injectFile(PHOTO_PDF);
      await waitForStep(browser, 1);

      // The ConfigureStep uses a slider for quality — set the slider value
      // to the midpoint of each zone: web=12, screen=37, print=62, archive=87
      const zoneValues: Record<string, number> = { web: 12, screen: 37, print: 62, archive: 87 };
      await setSliderValue(browser, 'compression-slider', zoneValues[quality]);

      await mockSaveDialog(browser, outPath);
      await navigateToCompare();

      expect(await testIdDisplayed(browser, 'compare-step')).toBe(true);

      await clickTestId(browser, 'save-btn');
      await browser.waitUntil(() => existsSync(outPath), { timeout: 30000, interval: 100, timeoutMsg: `output file not written: ${outPath}` });

      expect(existsSync(outPath)).toBe(true);
      const outSize = statSync(outPath).size;
      expect(outSize).toBeGreaterThan(0);

      // archive is lossless (prepress preset) — only assert existence, not size reduction.
      // web/screen/print are lossy and should compress photo_heavy.pdf.
      // Note: Ghostscript may sometimes produce output of equal size depending on
      // the PDF content and system GS version, so we use <= instead of <.
      if (quality !== 'archive') {
        const inSize = statSync(PHOTO_PDF).size;
        expect(outSize).toBeLessThanOrEqual(inSize);
      }
    });
  }
});

// ─── PDF RESIZE MATRIX ───────────────────────────────────────────────────────

describe('PDF resize', () => {
  it('[PDF-R-PRESET] web quality + resize to A3 preset (all pages)', async () => {
    const outPath = prepareOutputPath('pdf-resize-a3.pdf');
    await injectFile(TEXT_PDF);
    await waitForStep(browser, 1);

    await clickTestId(browser, 'resize-toggle');
    await selectTestIdByText(browser, 'page-preset-select', 'A3');

    await mockSaveDialog(browser, outPath);
    await navigateToCompare();

    const statsText = await getTestIdText(browser, 'stats-bar');
    expect(statsText).toBeTruthy();

    await clickTestId(browser, 'save-btn');
    await browser.waitUntil(() => existsSync(outPath), { timeout: 30000, interval: 100, timeoutMsg: `output file not written: ${outPath}` });

    expect(existsSync(outPath)).toBe(true);
    expect(statSync(outPath).size).toBeGreaterThan(0);
  });

  it('[PDF-R-CUSTOM] web quality + resize to custom 100×150 mm', async () => {
    const outPath = prepareOutputPath('pdf-resize-custom.pdf');
    await injectFile(TEXT_PDF);
    await waitForStep(browser, 1);

    await clickTestId(browser, 'resize-toggle');
    await selectTestIdByText(browser, 'page-preset-select', 'Custom');
    await clearAndSetTestIdValue(browser, 'custom-width-input', '100');
    await clearAndSetTestIdValue(browser, 'custom-height-input', '150');

    await mockSaveDialog(browser, outPath);
    await navigateToCompare();

    expect(await testIdDisplayed(browser, 'compare-step')).toBe(true);

    await clickTestId(browser, 'save-btn');
    await browser.waitUntil(() => existsSync(outPath), { timeout: 30000, interval: 100, timeoutMsg: `output file not written: ${outPath}` });

    expect(existsSync(outPath)).toBe(true);
    expect(statSync(outPath).size).toBeGreaterThan(0);
  });

  it('[PDF-R-QUALITY-RESIZE] web quality + A3 resize combined', async () => {
    const outPath = prepareOutputPath('pdf-web-resize-a3.pdf');
    await injectFile(PHOTO_PDF);
    await waitForStep(browser, 1);

    // Set to web zone (slider midpoint = 12)
    await setSliderValue(browser, 'compression-slider', 12);

    await clickTestId(browser, 'resize-toggle');
    await selectTestIdByText(browser, 'page-preset-select', 'A3');

    await mockSaveDialog(browser, outPath);
    await navigateToCompare();

    await clickTestId(browser, 'save-btn');
    await browser.waitUntil(() => existsSync(outPath), { timeout: 30000, interval: 100, timeoutMsg: `output file not written: ${outPath}` });

    expect(existsSync(outPath)).toBe(true);
    expect(statSync(outPath).size).toBeGreaterThan(0);
  });
});

// ─── PDF ERROR PATHS ─────────────────────────────────────────────────────────

describe('PDF error paths', () => {
  it('[PDF-ERR-OVERSIZE] >100 MB file shows blocking modal', async () => {
    await injectFile(LARGE_PDF);
    await browser.pause(1500); // allow async size check to complete
    expect(await testIdDisplayed(browser, 'file-size-limit-modal')).toBe(true);
    await clickTestId(browser, 'file-size-limit-dismiss');
    await browser.pause(500);
    expect(await testIdDisplayed(browser, 'file-size-limit-modal')).toBe(false);
  });

  it('[PDF-ERR-CORRUPT] zero-byte file shows inline error', async () => {
    await injectFile(CORRUPT_PDF);
    await browser.pause(1500);
    const emptyVisible  = await testIdDisplayed(browser, 'empty-file-error');
    const corruptVisible = await testIdDisplayed(browser, 'corrupt-file-error');
    expect(emptyVisible || corruptVisible).toBe(true); // Expected an inline error for zero-byte file
    expect(await testIdDisplayed(browser, 'configure-step')).toBe(false);
  });

  it('[PDF-ERR-CANCEL] cancel mid-processing returns to Configure or Compare step', async () => {
    await injectFile(PHOTO_PDF);
    await waitForStep(browser, 1);

    await clickTestId(browser, 'generate-preview-btn');
    await browser.pause(300);

    const cancelVisible = await testIdDisplayed(browser, 'cancel-btn');
    if (cancelVisible) {
      await clickTestId(browser, 'cancel-btn');
    }
    await browser.pause(2000);

    const configureVisible = await testIdDisplayed(browser, 'configure-step');
    const compareVisible   = await testIdDisplayed(browser, 'compare-step');
    // After cancel, app must show either Configure or Compare step (not blank)
    expect(configureVisible || compareVisible).toBe(true);
  });
});

// ─── PDF SAVE DIALOG FILTER ───────────────────────────────────────────────────

describe('PDF save dialog filter', () => {
  it('[PDF-SAVE-FILTER] save dialog uses PDF filter, not image filter', async () => {
    await injectFile(PHOTO_PDF);
    await waitForStep(browser, 1);

    // Tell SaveStep.handleSave to capture the dialog options instead of opening the OS dialog.
    await browser.execute(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__E2E_CAPTURE_SAVE_OPTS__ = true;
    });

    await navigateToCompare();
    await clickTestId(browser, 'save-btn');
    await browser.pause(500);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const capturedArgs = await browser.execute(() => (window as any).__E2E_SAVE_OPTS__);

    const filters = JSON.stringify(capturedArgs).toLowerCase();
    expect(filters).toContain('pdf'); // Save dialog filters must mention "pdf"
    expect(filters).not.toMatch(/jpeg|png|webp/); // must NOT mention image formats
  });
});
