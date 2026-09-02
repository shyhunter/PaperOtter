/**
 * DEST — saved settings, and the verdict on the result.
 *
 * The feature answers "will the portal accept this?" rather than "what can I do
 * to this PDF", and that answer is only produced at the end of a real run: the
 * verdict is computed from the finished document's size, page size and page
 * count. The unit suite checks the function; only this checks the number the
 * user actually sees, against a document the app really produced.
 *
 * Requires PR #94 to be merged.
 */
import { browser } from '@wdio/globals';
import { expect } from '@wdio/globals';
import { mockOpenDialog } from '../../helpers/dialogs';
import { resetAppState, waitForProcessingComplete, captureFailure } from '../../helpers/driver';
import {
  clickTestId, waitForTestId, waitForStep, testIdExists,
  getTestIdAttr, getTestIdText, setTestIdValue,
} from '../../helpers/testid';
import { Workspace } from '../../helpers/workspace';

const ws = new Workspace('destinations');

after(() => ws.cleanup());

/** Open a PDF in Compress and stop on Configure. */
async function openInCompress(pdf: string): Promise<void> {
  await resetAppState(browser, 'Compress PDF');
  await waitForTestId(browser, 'open-file-btn');
  await mockOpenDialog(browser, pdf);
  await clickTestId(browser, 'open-file-btn');
  await waitForStep(browser, 1);
}

/** Save the current controls under a name, via the panel below them. */
async function saveSettingAs(name: string): Promise<void> {
  await waitForTestId(browser, 'save-setting-as');
  await browser.execute((n: string) => {
    const panel = document.querySelector('[data-testid="save-setting-as"]');
    (panel?.querySelector('button') as HTMLElement | null)?.click();
    const input = panel?.querySelector('input') as HTMLInputElement | null;
    if (!input) throw new Error('name field did not appear');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, n);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const save = Array.from(panel?.querySelectorAll('button') ?? [])
      .find((b) => /save/i.test(b.textContent ?? '')) as HTMLElement | undefined;
    save?.click();
  }, name);
}

// A one-line timeout says which element was missing, never what was on screen
// instead. Capture both, so a red run can be read from its artefacts.
afterEach(async function (this: Mocha.Context) {
  if (this.currentTest?.state === 'failed') {
    await captureFailure(browser, this.currentTest.fullTitle());
  }
});

/**
 * Apply a saved setting, which saving it does not do.
 *
 * The verdict is gated on the destination the user has *chosen*, and choosing
 * is a separate click on the row above the controls. A test that only saves
 * gets no verdict and no error either — the panel simply renders nothing.
 */
async function selectSavedSetting(name: string): Promise<void> {
  await waitForTestId(browser, 'saved-settings-row');
  await browser.execute((n: string) => {
    const row = document.querySelector('[data-testid="saved-settings-row"]');
    const pill = Array.from(row?.querySelectorAll('button') ?? [])
      .find((b) => (b.textContent ?? '').trim() === n) as HTMLElement | undefined;
    if (!pill) throw new Error(`no saved setting named "${n}"`);
    pill.click();
  }, name);
}

describe('Saved settings and the verdict', () => {
  it('[E2E-DEST-01] nothing is offered before anything is saved', async () => {
    // The list ships empty by decision: a preset named for a portal claims to
    // know which one this user is fighting.
    const pdf = ws.fixture('photo_heavy.pdf', 'first-run.pdf');
    await openInCompress(pdf);

    expect(await testIdExists(browser, 'saved-settings-row')).toBe(false);
    expect(await testIdExists(browser, 'destination-empty')).toBe(true);
  });

  it('[E2E-DEST-02] a saved setting appears above the controls it rewrites', async () => {
    const pdf = ws.fixture('photo_heavy.pdf', 'saves.pdf');
    await openInCompress(pdf);

    await saveSettingAs('E2E setting');
    await waitForTestId(browser, 'saved-settings-row');
    expect(await getTestIdText(browser, 'saved-settings-row')).toMatch(/E2E setting/);
  });

  it('[E2E-DEST-03] the verdict reports against the finished document', async () => {
    // The whole point of the feature, and the half no unit test reaches: these
    // numbers come out of a real Ghostscript run.
    const pdf = ws.fixture('photo_heavy.pdf', 'verdict.pdf');
    await openInCompress(pdf);

    // A target size, not a quality level. Quality is a setting to restore and
    // carries nothing a finished document can be checked against, so a setting
    // saved from the slider produces zero constraints and the panel correctly
    // renders nothing at all. Only a limit yields a verdict.
    await clickTestId(browser, 'custom-target-toggle');
    // The field's own minimum is the smallest size this document can reach, so
    // it is always a valid entry; the assertions below do not care whether the
    // document meets the limit, only that a real number is reported.
    const min = await getTestIdAttr(browser, 'custom-target-size', 'min');
    await setTestIdValue(browser, 'custom-target-size', min ?? '1');
    await saveSettingAs('E2E tiny');

    // Saving is not choosing.
    await selectSavedSetting('E2E tiny');

    await clickTestId(browser, 'generate-preview-btn');
    await waitForProcessingComplete(browser);
    await waitForStep(browser, 2);

    await waitForTestId(browser, 'destination-verdict', { timeout: 30000 });
    const meets = await getTestIdAttr(browser, 'destination-verdict', 'data-meets');
    expect(meets === 'true' || meets === 'false').toBe(true);
    // Whatever the outcome, the panel must carry a measured size, not a bare
    // tick: "it failed" sends someone back to guess.
    expect(await getTestIdText(browser, 'destination-verdict')).toMatch(/\d/);
  });
});
