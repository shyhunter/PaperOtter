import { browser } from '@wdio/globals';
import { existsSync, statSync, readFileSync } from 'fs';
import { join } from 'path';
import { mockSaveDialog } from '../helpers/dialogs';
import {
  waitForStep,
  waitForProcessingComplete,
  screenshotOnFailure,
  prepareOutputPath,
  FIXTURES_DIR,
  REAL_FIXTURES_DIR,
} from '../helpers/driver';

const PHOTO_JPG   = join(REAL_FIXTURES_DIR, 'pexels-pixabay-459225.jpg');
const SAMPLE_PNG  = join(REAL_FIXTURES_DIR, 'sample.png');
const LARGE_JPG   = join(FIXTURES_DIR, 'large-sparse.jpg');
const CORRUPT_JPG = join(FIXTURES_DIR, 'corrupt.jpg');

function detectMagicBytes(filePath: string): 'jpeg' | 'png' | 'webp' | 'unknown' {
  const buf = readFileSync(filePath);
  if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return 'jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return 'png';
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46) return 'webp';
  return 'unknown';
}

async function injectFile(filePath: string): Promise<void> {
  await browser.execute((path: string) => {
    const tauri = (window as unknown as { __TAURI__?: { dialog?: Record<string, unknown> } }).__TAURI__;
    if (tauri?.dialog) { tauri.dialog.open = async () => path; }
  }, filePath);
  const openBtn = await browser.$('[data-testid="open-file-btn"]');
  await openBtn.click();
}

async function navigateToImageCompare(): Promise<void> {
  await waitForStep(browser, 1);
  const generateBtn = await browser.$('[data-testid="generate-preview-btn"]');
  await generateBtn.waitForClickable({ timeout: 5000 });
  await generateBtn.click();
  // Image compare step uses 'image-compare-step' — NOT the PDF 'compare-step'
  await waitForProcessingComplete(browser, 'image-compare-step');
  await waitForStep(browser, 2);
}

afterEach(async function (this: Mocha.Context) {
  if (this.currentTest?.state === 'failed') {
    await screenshotOnFailure(browser, this.currentTest.fullTitle());
  }
  try {
    const processAnother = await browser.$('[data-testid="process-another-btn"]');
    if (await processAnother.isDisplayed().catch(() => false)) await processAnother.click();
  } catch { /* already on landing */ }
});

// ─── IMAGE QUALITY ONLY ──────────────────────────────────────────────────────

describe('Image — quality only', () => {
  it('[IMG-Q-50] JPEG at 50% quality: output exists, is JPEG, is smaller than input', async () => {
    const outPath = prepareOutputPath('img-quality-50.jpg');
    await injectFile(PHOTO_JPG);
    await waitForStep(browser, 1);

    const slider = await browser.$('[data-testid="quality-slider"]');
    await browser.execute((el: HTMLInputElement) => {
      el.value = '50';
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('mouseup', { bubbles: true }));
    }, slider as unknown as HTMLInputElement);

    await mockSaveDialog(browser, outPath);
    await navigateToImageCompare();

    const saveBtn = await browser.$('[data-testid="save-btn"]');
    await saveBtn.click();
    await waitForStep(browser, 3);

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

    const slider = await browser.$('[data-testid="quality-slider"]');
    await browser.execute((el: HTMLInputElement) => {
      el.value = '100';
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('mouseup', { bubbles: true }));
    }, slider as unknown as HTMLInputElement);

    await mockSaveDialog(browser, outPath);
    await navigateToImageCompare();

    const saveBtn = await browser.$('[data-testid="save-btn"]');
    await saveBtn.click();
    await waitForStep(browser, 3);

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

    const pngBtn = await browser.$('[data-testid="format-option-png"]');
    await pngBtn.click();

    await mockSaveDialog(browser, outPath);
    await navigateToImageCompare();

    const saveBtn = await browser.$('[data-testid="save-btn"]');
    await saveBtn.click();
    await waitForStep(browser, 3);

    expect(existsSync(outPath)).toBe(true);
    expect(detectMagicBytes(outPath)).toBe('png');
    expect(statSync(outPath).size).toBeGreaterThan(0);
  });

  it('[IMG-FMT-WEBP] JPG → WebP at 75% quality: output is WebP format', async () => {
    const outPath = prepareOutputPath('img-format-webp.webp');
    await injectFile(PHOTO_JPG);
    await waitForStep(browser, 1);

    const webpBtn = await browser.$('[data-testid="format-option-webp"]');
    await webpBtn.click();

    const slider = await browser.$('[data-testid="quality-slider"]');
    await browser.execute((el: HTMLInputElement) => {
      el.value = '75';
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('mouseup', { bubbles: true }));
    }, slider as unknown as HTMLInputElement);

    await mockSaveDialog(browser, outPath);
    await navigateToImageCompare();

    const saveBtn = await browser.$('[data-testid="save-btn"]');
    await saveBtn.click();
    await waitForStep(browser, 3);

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

    const pngBtn = await browser.$('[data-testid="format-option-png"]');
    await pngBtn.click();

    const slider = await browser.$('[data-testid="quality-slider"]');
    await browser.execute((el: HTMLInputElement) => {
      el.value = '60';
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('mouseup', { bubbles: true }));
    }, slider as unknown as HTMLInputElement);

    const resizeToggle = await browser.$('[data-testid="resize-toggle"]');
    await resizeToggle.click();

    const thumbBtn = await browser.$('[data-testid="preset-btn-thumb"]');
    await thumbBtn.click();

    await mockSaveDialog(browser, outPath);
    await navigateToImageCompare();

    const compareStep = await browser.$('[data-testid="image-compare-step"]');
    await expect(compareStep).toBeDisplayed();

    const saveBtn = await browser.$('[data-testid="save-btn"]');
    await saveBtn.click();
    await waitForStep(browser, 3);

    expect(existsSync(outPath)).toBe(true);
    expect(detectMagicBytes(outPath)).toBe('png');
    expect(statSync(outPath).size).toBeGreaterThan(0);
  });

  it('[IMG-RESIZE-CUSTOM] quality 80% + WebP + custom 800×600 px (aspect unlocked)', async () => {
    const outPath = prepareOutputPath('img-resize-custom.webp');
    await injectFile(PHOTO_JPG);
    await waitForStep(browser, 1);

    const webpBtn = await browser.$('[data-testid="format-option-webp"]');
    await webpBtn.click();

    const resizeToggle = await browser.$('[data-testid="resize-toggle"]');
    await resizeToggle.click();

    // Unlock aspect ratio if currently locked
    const lockBtn = await browser.$('[data-testid="aspect-ratio-lock"]');
    const isLocked = await lockBtn.getAttribute('data-locked');
    if (isLocked === 'true') await lockBtn.click();

    const widthInput = await browser.$('[data-testid="resize-width-input"]');
    await widthInput.clearValue();
    await widthInput.setValue('800');

    const heightInput = await browser.$('[data-testid="resize-height-input"]');
    await heightInput.clearValue();
    await heightInput.setValue('600');

    await mockSaveDialog(browser, outPath);
    await navigateToImageCompare();

    const saveBtn = await browser.$('[data-testid="save-btn"]');
    await saveBtn.click();
    await waitForStep(browser, 3);

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
    const modal = await browser.$('[data-testid="file-size-limit-modal"]');
    await expect(modal).toBeDisplayed();
    const dismissBtn = await browser.$('[data-testid="file-size-limit-dismiss"]');
    await dismissBtn.click();
    await browser.pause(500);
    await expect(modal).not.toBeDisplayed();
  });

  it('[IMG-ERR-CORRUPT] zero-byte image shows inline error, no crash', async () => {
    await injectFile(CORRUPT_JPG);
    await browser.pause(1500);
    const emptyErr  = await browser.$('[data-testid="empty-file-error"]');
    const corruptErr = await browser.$('[data-testid="corrupt-file-error"]');
    const oneVisible =
      (await emptyErr.isDisplayed().catch(() => false)) ||
      (await corruptErr.isDisplayed().catch(() => false));
    expect(oneVisible).toBe(true); // Expected inline error for zero-byte image
    const configStep = await browser.$('[data-testid="image-configure-step"]');
    expect(await configStep.isDisplayed().catch(() => false)).toBe(false);
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

      const fmtBtn = await browser.$(`[data-testid="format-option-${format}"]`);
      await fmtBtn.click();

      await browser.execute(() => {
        const tauri = (window as unknown as { __TAURI__?: { dialog?: Record<string, unknown> } }).__TAURI__;
        if (tauri?.dialog) {
          tauri.dialog.save = async (opts: unknown) => {
            (window as unknown as { __E2E_SAVE_OPTS__?: unknown }).__E2E_SAVE_OPTS__ = opts;
            return null;
          };
        }
      });

      await navigateToImageCompare();
      const saveBtn = await browser.$('[data-testid="save-btn"]');
      await saveBtn.click();
      await browser.pause(500);

      const captured = await browser.execute(() =>
        (window as unknown as { __E2E_SAVE_OPTS__?: unknown }).__E2E_SAVE_OPTS__
      );

      const filtersJson = JSON.stringify(captured).toLowerCase();
      expect(filtersJson).toContain(expectedExt); // Save options must contain format extension
      expect(filtersJson).not.toContain('pdf'); // Save options must NOT contain "pdf"
    });
  }
});
