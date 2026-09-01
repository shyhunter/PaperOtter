/**
 * SAVE-DIR — Save as… opens where the document came from.
 *
 * `defaultPath` was a bare filename with no directory, so the dialog knew what
 * to call the file and nothing about where to put it. macOS hid that, because
 * its save panel remembers the last folder used; on Linux the location falls to
 * the platform, and under `tauri dev` that can be the project directory itself.
 *
 * This is the one assertion that needs `__E2E_CAPTURE_SAVE_OPTS__` rather than
 * `__E2E_SAVE_PATH__`: bypassing the dialog with a path writes the file but
 * discards the very thing under test, which is what the dialog was *asked* for.
 *
 * Requires PR #96 to be merged.
 */
import { browser } from '@wdio/globals';
import { expect } from '@wdio/globals';
import { mockOpenDialog, captureSaveOptions, readCapturedSaveOptions } from '../../helpers/dialogs';
import { selectToolOnDashboard, resetAppState, waitForProcessingComplete } from '../../helpers/driver';
import { clickTestId, waitForTestId, waitForStep } from '../../helpers/testid';
import { Workspace } from '../../helpers/workspace';

const ws = new Workspace('save-location');

after(() => ws.cleanup());

describe('Where Save as… opens', () => {
  it('[E2E-SAVE-DIR-01] suggests the folder the document was opened from', async () => {
    // Deliberately in a subdirectory: a suggestion that happened to match the
    // workspace root could pass without carrying any folder at all.
    const folder = ws.subdir('deep/nested');
    const pdf = ws.fixture('warnock_camelot.pdf', 'deep/nested/source.pdf');

    await resetAppState(browser, 'Rotate PDF');
    await selectToolOnDashboard(browser, 'Rotate PDF');
    await waitForTestId(browser, 'open-file-btn');
    await mockOpenDialog(browser, pdf);
    await clickTestId(browser, 'open-file-btn');
    await waitForStep(browser, 1);

    await clickTestId(browser, 'rotate-all-right-btn');
    await clickTestId(browser, 'apply-rotation-btn');
    await waitForProcessingComplete(browser);
    await waitForStep(browser, 2);

    await captureSaveOptions(browser);
    await clickTestId(browser, 'save-as-btn');

    await browser.waitUntil(async () => (await readCapturedSaveOptions(browser)) !== null, {
      timeout: 10000,
      timeoutMsg: 'Save as… never reached the dialog',
    });

    const options = await readCapturedSaveOptions(browser);
    // The folder is the assertion. The name is allowed to be whatever the flow
    // suggests, and pinning it here would make this fail on a copy change.
    expect(options?.defaultPath?.startsWith(folder)).toBe(true);
    expect(options?.defaultPath).not.toBe(undefined);
  });
});
