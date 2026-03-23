import { browser } from '@wdio/globals';
import { existsSync, statSync, readFileSync } from 'fs';
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
  setSliderValue,
  clearAndSetTestIdValue,
  getTestIdAttr,
} from '../helpers/testid';

const PHOTO_JPG   = join(REAL_FIXTURES_DIR, 'pexels-pixabay-459225.jpg');
const SAMPLE_PNG  = join(REAL_FIXTURES_DIR, 'sample.png');
const LARGE_JPG   = join(FIXTURES_DIR, 'large-sparse.jpg');
const CORRUPT_JPG = join(FIXTURES_DIR, 'corrupt.jpg');

// Navigate from Dashboard to Compress Image tool once at session start.
before(async () => {
  await selectToolOnDashboard(browser, 'Compress Image');
});

function detectMagicBytes(filePath: string): 'jpeg' | 'png' | 'webp' | 'unknown' {
  const buf = readFileSync(filePath);
  if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return 'jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return 'png';
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46) return 'webp';
  return 'unknown';
}

async function injectFile(filePath: string): Promise<void> {
  // Wait for the file-picker button to appear.
  await waitForTestId(browser, 'open-file-btn');
  // Apply IPC mock AFTER window is confirmed ready.
  await mockOpenDialog(browser, filePath);
  await clickTestId(browser, 'open-file-btn');
}

async function navigateToImageCompare(): Promise<void> {
  await waitForStep(browser, 1);
  await waitForTestIdDisplayed(browser, 'generate-preview-btn', { timeout: 5000 });
  await clickTestId(browser, 'generate-preview-btn');
  // Image compare step uses 'image-compare-step' — NOT the PDF 'compare-step'
  await waitForProcessingComplete(browser, 'image-compare-step');
  await waitForStep(browser, 2);
}

afterEach(async function (this: Mocha.Context) {
  if (this.currentTest?.state === 'failed') {
    await screenshotOnFailure(browser, this.currentTest.fullTitle());
  }
  // Always reset to the open-file page, regardless of which step we're on.
  // This prevents cascading failures when a test leaves the app in an unexpected state.
  await resetAppState(browser, 'Compress Image');
});

// ─── IMAGE QUALITY ONLY ──────────────────────────────────────────────────────

describe('Image — quality only', () => {
  it('[IMG-Q-50] JPEG at 50% quality: output exists, is JPEG, is smaller than input', async () => {
    const outPath = prepareOutputPath('img-quality-50.jpg');
    await injectFile(PHOTO_JPG);
    await waitForStep(browser, 1);

    await setSliderValue(browser, 'quality-slider', 50);

    await mockSaveDialog(browser, outPath);
    await navigateToImageCompare();

    await clickTestId(browser, 'save-btn');
    await browser.waitUntil(() => existsSync(outPath), { timeout: 30000, interval: 100, timeoutMsg: `output file not written: ${outPath}` });

    expect(existsSync(outPath)).toBe(true);
    expect(detectMagicBytes(outPath)).toBe('jpeg');
    const outSize = statSync(outPath).size;
    const inSize  = statSync(PHOTO_JPG).size;
    expect(outSize).toBeGreaterThan(0);
    expect(outSize).toBeLessThan(inSize); // 50% JPEG should be smaller than input
  });

  it('[IMG-Q-100] JPEG at 100% quality: output exists and is JPEG', async () => {
    const outPath = prepareOutputPath('img-quality-100.jpg');
    await injectFile(PHOTO_JPG);
    await waitForStep(browser, 1);

    await setSliderValue(browser, 'quality-slider', 100);

    await mockSaveDialog(browser, outPath);
    await navigateToImageCompare();

    await clickTestId(browser, 'save-btn');
    await browser.waitUntil(() => existsSync(outPath), { timeout: 30000, interval: 100, timeoutMsg: `output file not written: ${outPath}` });

    expect(existsSync(outPath)).toBe(true);
    expect(detectMagicBytes(outPath)).toBe('jpeg');
    expect(statSync(outPath).size).toBeGreaterThan(0);
  });
});

// ─── IMAGE QUALITY + FORMAT CONVERSION ───────────────────────────────────────

describe('Image — quality + format conversion', () => {
  it('[IMG-FMT-PNG] JPG → PNG: output is PNG format', async () => {
    const outPath = prepareOutputPath('img-format-png.png');
    await injectFile(PHOTO_JPG);
    await waitForStep(browser, 1);

    await clickTestId(browser, 'format-option-png');

    await mockSaveDialog(browser, outPath);
    await navigateToImageCompare();

    await clickTestId(browser, 'save-btn');
    await browser.waitUntil(() => existsSync(outPath), { timeout: 30000, interval: 100, timeoutMsg: `output file not written: ${outPath}` });

    expect(existsSync(outPath)).toBe(true);
    expect(detectMagicBytes(outPath)).toBe('png');
    expect(statSync(outPath).size).toBeGreaterThan(0);
  });

  it('[IMG-FMT-WEBP] JPG → WebP at 75% quality: output is WebP format', async () => {
    const outPath = prepareOutputPath('img-format-webp.webp');
    await injectFile(PHOTO_JPG);
    await waitForStep(browser, 1);

    await clickTestId(browser, 'format-option-webp');
    await setSliderValue(browser, 'quality-slider', 75);

    await mockSaveDialog(browser, outPath);
    await navigateToImageCompare();

    await clickTestId(browser, 'save-btn');
    await browser.waitUntil(() => existsSync(outPath), { timeout: 30000, interval: 100, timeoutMsg: `output file not written: ${outPath}` });

    expect(existsSync(outPath)).toBe(true);
    expect(detectMagicBytes(outPath)).toBe('webp');
    expect(statSync(outPath).size).toBeGreaterThan(0);
  });
});

// ─── IMAGE QUALITY + FORMAT + RESIZE ─────────────────────────────────────────

describe('Image — quality + format + resize (aspect ratio lock)', () => {
  it('[IMG-RESIZE-LOCK] quality 60% + PNG + Thumbnail 400×400 preset (aspect locked)', async () => {
    const outPath = prepareOutputPath('img-resize-thumb.png');
    await injectFile(PHOTO_JPG);
    await waitForStep(browser, 1);

    await clickTestId(browser, 'format-option-png');
    await setSliderValue(browser, 'quality-slider', 60);
    await clickTestId(browser, 'resize-toggle');
    await clickTestId(browser, 'preset-btn-thumb');

    await mockSaveDialog(browser, outPath);
    await navigateToImageCompare();

    expect(await testIdDisplayed(browser, 'image-compare-step')).toBe(true);

    await clickTestId(browser, 'save-btn');
    await browser.waitUntil(() => existsSync(outPath), { timeout: 30000, interval: 100, timeoutMsg: `output file not written: ${outPath}` });

    expect(existsSync(outPath)).toBe(true);
    expect(detectMagicBytes(outPath)).toBe('png');
    expect(statSync(outPath).size).toBeGreaterThan(0);
  });

  it('[IMG-RESIZE-CUSTOM] quality 80% + WebP + custom 800×600 px (aspect unlocked)', async () => {
    const outPath = prepareOutputPath('img-resize-custom.webp');
    await injectFile(PHOTO_JPG);
    await waitForStep(browser, 1);

    await clickTestId(browser, 'format-option-webp');
    await clickTestId(browser, 'resize-toggle');

    // Unlock aspect ratio if currently locked
    const isLocked = await getTestIdAttr(browser, 'aspect-ratio-lock', 'data-locked');
    if (isLocked === 'true') await clickTestId(browser, 'aspect-ratio-lock');

    await clearAndSetTestIdValue(browser, 'resize-width-input', '800');
    await clearAndSetTestIdValue(browser, 'resize-height-input', '600');

    await mockSaveDialog(browser, outPath);
    await navigateToImageCompare();

    await clickTestId(browser, 'save-btn');
    await browser.waitUntil(() => existsSync(outPath), { timeout: 30000, interval: 100, timeoutMsg: `output file not written: ${outPath}` });

    expect(existsSync(outPath)).toBe(true);
    expect(detectMagicBytes(outPath)).toBe('webp');
    expect(statSync(outPath).size).toBeGreaterThan(0);
  });
});

// ─── IMAGE ERROR PATHS ────────────────────────────────────────────────────────

describe('Image error paths', () => {
  it('[IMG-ERR-OVERSIZE] >100 MB image shows blocking modal', async () => {
    await injectFile(LARGE_JPG);
    await browser.pause(1500);
    expect(await testIdDisplayed(browser, 'file-size-limit-modal')).toBe(true);
    await clickTestId(browser, 'file-size-limit-dismiss');
    await browser.pause(500);
    expect(await testIdDisplayed(browser, 'file-size-limit-modal')).toBe(false);
  });

  it('[IMG-ERR-CORRUPT] zero-byte image shows inline error, no crash', async () => {
    await injectFile(CORRUPT_JPG);
    await browser.pause(1500);
    const emptyVisible  = await testIdDisplayed(browser, 'empty-file-error');
    const corruptVisible = await testIdDisplayed(browser, 'corrupt-file-error');
    expect(emptyVisible || corruptVisible).toBe(true); // Expected inline error for zero-byte image
    expect(await testIdDisplayed(browser, 'image-configure-step')).toBe(false);
  });
});

// ─── IMAGE SAVE DIALOG FILTER ─────────────────────────────────────────────────

describe('Image save dialog filter', () => {
  for (const [format, expectedExt, fixture] of [
    ['jpeg', 'jpg',  PHOTO_JPG],
    ['png',  'png',  SAMPLE_PNG],
    ['webp', 'webp', PHOTO_JPG],
  ] as const) {
    it(`[IMG-SAVE-FILTER-${format.toUpperCase()}] save dialog uses ${format} filter, not PDF filter`, async () => {
      await injectFile(fixture);
      await waitForStep(browser, 1);

      await clickTestId(browser, `format-option-${format}`);

      // Tell SaveStep.handleSave to capture the dialog options instead of opening the OS dialog.
      await browser.execute(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).__E2E_CAPTURE_SAVE_OPTS__ = true;
      });

      await navigateToImageCompare();
      await clickTestId(browser, 'save-btn');
      await browser.pause(500);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const captured = await browser.execute(() => (window as any).__E2E_SAVE_OPTS__);

      const filtersJson = JSON.stringify(captured).toLowerCase();
      expect(filtersJson).toContain(expectedExt); // Save options must contain format extension
      expect(filtersJson).not.toContain('pdf'); // Save options must NOT contain "pdf"
    });
  }
});
