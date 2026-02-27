import { browser } from '@wdio/globals';
import { existsSync, statSync } from 'fs';
import { join } from 'path';
import { mockOpenDialog, mockSaveDialog } from '../helpers/dialogs';
import {
  waitForStep,
  waitForProcessingComplete,
  screenshotOnFailure,
  prepareOutputPath,
  FIXTURES_DIR,
  REAL_FIXTURES_DIR,
} from '../helpers/driver';

const PHOTO_PDF  = join(REAL_FIXTURES_DIR, 'photo_heavy.pdf');
const TEXT_PDF   = join(REAL_FIXTURES_DIR, 'warnock_camelot.pdf');
const LARGE_PDF  = join(FIXTURES_DIR, 'large-sparse.pdf');
const CORRUPT_PDF = join(FIXTURES_DIR, 'corrupt.pdf');

async function injectFile(filePath: string): Promise<void> {
  // Wait for window ready BEFORE applying mock (browser.execute requires a live window).
  const openBtn = await browser.$('[data-testid="open-file-btn"]');
  await openBtn.waitForExist({ timeout: 15000 });
  // Apply IPC mock AFTER window is confirmed ready.
  await mockOpenDialog(browser, filePath);
  await openBtn.click();
}

async function navigateToCompare(): Promise<void> {
  await waitForStep(browser, 1);
  const generateBtn = await browser.$('[data-testid="generate-preview-btn"]');
  await generateBtn.waitForDisplayed({ timeout: 5000 });
  await generateBtn.click();
  // PDF compare step uses the default 'compare-step' testid
  await waitForProcessingComplete(browser, 'compare-step');
  await waitForStep(browser, 2);
}

afterEach(async function (this: Mocha.Context) {
  if (this.currentTest?.state === 'failed') {
    await screenshotOnFailure(browser, this.currentTest.fullTitle());
  }
  try {
    const processAnother = await browser.$('[data-testid="process-another-btn"]');
    if (await processAnother.isDisplayed().catch(() => false)) {
      await processAnother.click();
    }
  } catch { /* already on landing */ }
});

// ─── PDF COMPRESSION QUALITY MATRIX ─────────────────────────────────────────

describe('PDF compression — quality levels', () => {
  for (const quality of ['web', 'screen', 'print', 'archive'] as const) {
    it(`[PDF-Q-${quality.toUpperCase()}] processes photo_heavy.pdf at quality=${quality}`, async () => {
      const outPath = prepareOutputPath(`pdf-quality-${quality}.pdf`);
      await injectFile(PHOTO_PDF);
      await waitForStep(browser, 1);

      const qualityOption = await browser.$(`[data-testid="quality-option-${quality}"]`);
      await qualityOption.click();

      await mockSaveDialog(browser, outPath);
      await navigateToCompare();

      const compareStep = await browser.$('[data-testid="compare-step"]');
      await expect(compareStep).toBeDisplayed();

      const saveBtn = await browser.$('[data-testid="save-btn"]');
      await saveBtn.click();
      await browser.waitUntil(() => existsSync(outPath), { timeout: 30000, interval: 100, timeoutMsg: `output file not written: ${outPath}` });

      expect(existsSync(outPath)).toBe(true);
      const outSize = statSync(outPath).size;
      expect(outSize).toBeGreaterThan(0);

      // archive is lossless (prepress preset) — only assert existence, not size reduction.
      // web/screen/print are lossy and should compress photo_heavy.pdf.
      if (quality !== 'archive') {
        const inSize = statSync(PHOTO_PDF).size;
        expect(outSize).toBeLessThan(inSize);
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

    const resizeToggle = await browser.$('[data-testid="resize-toggle"]');
    await resizeToggle.click();

    const presetSelect = await browser.$('[data-testid="page-preset-select"]');
    await presetSelect.selectByVisibleText('A3');

    await mockSaveDialog(browser, outPath);
    await navigateToCompare();

    const statsBar = await browser.$('[data-testid="stats-bar"]');
    const statsText = await statsBar.getText();
    expect(statsText).toBeTruthy();

    const saveBtn = await browser.$('[data-testid="save-btn"]');
    await saveBtn.click();
    await browser.waitUntil(() => existsSync(outPath), { timeout: 30000, interval: 100, timeoutMsg: `output file not written: ${outPath}` });

    expect(existsSync(outPath)).toBe(true);
    expect(statSync(outPath).size).toBeGreaterThan(0);
  });

  it('[PDF-R-CUSTOM] web quality + resize to custom 100×150 mm', async () => {
    const outPath = prepareOutputPath('pdf-resize-custom.pdf');
    await injectFile(TEXT_PDF);
    await waitForStep(browser, 1);

    const resizeToggle = await browser.$('[data-testid="resize-toggle"]');
    await resizeToggle.click();

    const presetSelect = await browser.$('[data-testid="page-preset-select"]');
    await presetSelect.selectByVisibleText('Custom');

    const widthInput = await browser.$('[data-testid="custom-width-input"]');
    await widthInput.clearValue();
    await widthInput.setValue('100');

    const heightInput = await browser.$('[data-testid="custom-height-input"]');
    await heightInput.clearValue();
    await heightInput.setValue('150');

    await mockSaveDialog(browser, outPath);
    await navigateToCompare();

    const compareStep = await browser.$('[data-testid="compare-step"]');
    await expect(compareStep).toBeDisplayed();

    const saveBtn = await browser.$('[data-testid="save-btn"]');
    await saveBtn.click();
    await browser.waitUntil(() => existsSync(outPath), { timeout: 30000, interval: 100, timeoutMsg: `output file not written: ${outPath}` });

    expect(existsSync(outPath)).toBe(true);
    expect(statSync(outPath).size).toBeGreaterThan(0);
  });

  it('[PDF-R-QUALITY-RESIZE] web quality + A3 resize combined', async () => {
    const outPath = prepareOutputPath('pdf-web-resize-a3.pdf');
    await injectFile(PHOTO_PDF);
    await waitForStep(browser, 1);

    const qualityOption = await browser.$('[data-testid="quality-option-web"]');
    await qualityOption.click();

    const resizeToggle = await browser.$('[data-testid="resize-toggle"]');
    await resizeToggle.click();

    const presetSelect = await browser.$('[data-testid="page-preset-select"]');
    await presetSelect.selectByVisibleText('A3');

    await mockSaveDialog(browser, outPath);
    await navigateToCompare();

    const saveBtn = await browser.$('[data-testid="save-btn"]');
    await saveBtn.click();
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
    const modal = await browser.$('[data-testid="file-size-limit-modal"]');
    await expect(modal).toBeDisplayed();
    const dismissBtn = await browser.$('[data-testid="file-size-limit-dismiss"]');
    await dismissBtn.click();
    await browser.pause(500);
    await expect(modal).not.toBeDisplayed();
  });

  it('[PDF-ERR-CORRUPT] zero-byte file shows inline error', async () => {
    await injectFile(CORRUPT_PDF);
    await browser.pause(1500);
    const emptyErr  = await browser.$('[data-testid="empty-file-error"]');
    const corruptErr = await browser.$('[data-testid="corrupt-file-error"]');
    const oneVisible =
      (await emptyErr.isDisplayed().catch(() => false)) ||
      (await corruptErr.isDisplayed().catch(() => false));
    expect(oneVisible).toBe(true); // Expected an inline error for zero-byte file
    const configureStep = await browser.$('[data-testid="configure-step"]');
    expect(await configureStep.isDisplayed().catch(() => false)).toBe(false);
  });

  it('[PDF-ERR-CANCEL] cancel mid-processing returns to Configure or Compare step', async () => {
    await injectFile(PHOTO_PDF);
    await waitForStep(browser, 1);

    const generateBtn = await browser.$('[data-testid="generate-preview-btn"]');
    await generateBtn.click();
    await browser.pause(300);

    const cancelBtn = await browser.$('[data-testid="cancel-btn"]');
    if (await cancelBtn.isDisplayed().catch(() => false)) {
      await cancelBtn.click();
    }
    await browser.pause(2000);

    const configureVisible = await browser.$('[data-testid="configure-step"]').isDisplayed().catch(() => false);
    const compareVisible   = await browser.$('[data-testid="compare-step"]').isDisplayed().catch(() => false);
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
    const saveBtn = await browser.$('[data-testid="save-btn"]');
    await saveBtn.click();
    await browser.pause(500);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const capturedArgs = await browser.execute(() => (window as any).__E2E_SAVE_OPTS__);

    const filters = JSON.stringify(capturedArgs).toLowerCase();
    expect(filters).toContain('pdf'); // Save dialog filters must mention "pdf"
    expect(filters).not.toMatch(/jpeg|png|webp/); // must NOT mention image formats
  });
});
