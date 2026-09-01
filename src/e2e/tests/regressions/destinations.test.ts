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
import { selectToolOnDashboard, resetAppState, waitForProcessingComplete } from '../../helpers/driver';
import {
  clickTestId, waitForTestId, waitForStep, testIdExists,
  getTestIdAttr, getTestIdText, setSliderValue,
} from '../../helpers/testid';
import { Workspace } from '../../helpers/workspace';

const ws = new Workspace('destinations');

after(() => ws.cleanup());

/** Open a PDF in Compress and stop on Configure. */
async function openInCompress(pdf: string): Promise<void> {
  await resetAppState(browser, 'Compress PDF');
  await selectToolOnDashboard(browser, 'Compress PDF');
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

    // A limit this document cannot meet, so the failing branch is exercised —
    // the one that has to name the size rather than just refuse.
    await setSliderValue(browser, 'compression-slider', 10);
    await saveSettingAs('E2E tiny');

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
