/**
 * FP-01 – FP-04, against the real app.
 *
 * These four had never been run on any machine before 2026-09-01, and they are
 * the paths where being wrong destroys the user's only copy: since PR #85, Save
 * writes back over the document the flow was opened with.
 *
 * Every file here is made by the test. Nobody runs `cp` or `chmod` first.
 *
 * What jsdom could not reach, and this can: the real Rust `save_over_file`
 * command, real file modes, and a real document on disk to inspect afterwards.
 * The assertion that matters most is not the message — it is that the original
 * bytes are still there when the save was refused.
 */
import { browser } from '@wdio/globals';
import { expect } from '@wdio/globals';
import { mockOpenDialog } from '../../helpers/dialogs';
import { selectToolOnDashboard, resetAppState, waitForProcessingComplete } from '../../helpers/driver';
import { clickTestId, waitForTestId, waitForStep, getTestIdText } from '../../helpers/testid';
import { Workspace } from '../../helpers/workspace';
import { requiresUnixPermissions } from '../../helpers/platform';

const ws = new Workspace('save-permissions');

/** Open a PDF in Rotate PDF and reach the Save step with a real edit pending. */
async function rotateAndReachSave(pdfPath: string): Promise<void> {
  await resetAppState(browser, 'Rotate PDF');
  await selectToolOnDashboard(browser, 'Rotate PDF');
  await waitForTestId(browser, 'open-file-btn');
  await mockOpenDialog(browser, pdfPath);
  await clickTestId(browser, 'open-file-btn');
  await waitForStep(browser, 1);
  // Any real change: an unmodified document gives Save nothing to write.
  await clickTestId(browser, 'rotate-all-right-btn');
  await clickTestId(browser, 'apply-rotation-btn');
  await waitForProcessingComplete(browser);
  await waitForStep(browser, 2);
}

/** The message shown on the Save step's error state. */
async function saveError(): Promise<string> {
  await waitForTestId(browser, 'save-error', { timeout: 10000 });
  return getTestIdText(browser, 'save-error');
}

after(() => ws.cleanup());

describe('Saving over the source document', () => {
  it('[E2E-FP-01] a read-only source is refused, and left byte-for-byte intact', async function () {
    if (!requiresUnixPermissions(this)) return;

    const pdf = ws.fixture('warnock_camelot.pdf', 'read-only.pdf');
    const before = ws.bytes(pdf);
    await rotateAndReachSave(pdf);

    ws.makeReadOnly(pdf);
    await clickTestId(browser, 'save-btn');

    expect(await saveError()).toMatch(/read-only/i);
    // The point of the whole exercise. A message is worth little; the file
    // still being there is the guarantee.
    expect(ws.bytes(pdf).equals(before)).toBe(true);
    ws.makeWritable(pdf);
  });

  it('[E2E-FP-02] a source deleted mid-flow is reported, not silently recreated', async function () {
    const pdf = ws.fixture('warnock_camelot.pdf', 'vanishes.pdf');
    await rotateAndReachSave(pdf);

    ws.remove(pdf);
    await clickTestId(browser, 'save-btn');

    expect(await saveError()).toMatch(/no longer/i);
    // The old code recreated it here and called that success.
    expect(ws.exists(pdf)).toBe(false);
  });

  it('[E2E-FP-03] a renamed source leaves both paths alone', async function () {
    // On Linux "move to Trash" is a rename, so this is the case a user actually
    // hits by right-clicking a file while the tool is open.
    const from = ws.fixture('warnock_camelot.pdf', 'before-rename.pdf');
    const original = ws.bytes(from);
    await rotateAndReachSave(from);

    const to = ws.rename(from, 'after-rename.pdf');
    await clickTestId(browser, 'save-btn');

    expect(await saveError()).toMatch(/no longer/i);
    // The old name must not come back, and the renamed file must be untouched.
    expect(ws.exists(from)).toBe(false);
    expect(ws.bytes(to).equals(original)).toBe(true);
  });

  it('[E2E-FP-04] the retry after restoring permission succeeds', async function () {
    if (!requiresUnixPermissions(this)) return;

    const pdf = ws.fixture('warnock_camelot.pdf', 'retry.pdf');
    const before = ws.size(pdf);
    await rotateAndReachSave(pdf);

    ws.makeReadOnly(pdf);
    await clickTestId(browser, 'save-btn');
    expect(await saveError()).toMatch(/read-only/i);

    ws.makeWritable(pdf);
    await clickTestId(browser, 'try-again-btn');

    await waitForTestId(browser, 'save-confirmation', { timeout: 15000 });
    // Written, and written to the same path rather than beside it.
    expect(ws.exists(pdf)).toBe(true);
    expect(ws.size(pdf)).not.toBe(before);
  });

  it('[E2E-FP-05] a refused save offers Save as…, not a retry that cannot work', async function () {
    // Retrying a replace against a path that no longer holds the file is the
    // one button guaranteed to fail again.
    const pdf = ws.fixture('warnock_camelot.pdf', 'gone-offers-saveas.pdf');
    await rotateAndReachSave(pdf);

    ws.remove(pdf);
    await clickTestId(browser, 'save-btn');
    await saveError();

    await waitForTestId(browser, 'save-as-btn');
    expect(await getTestIdText(browser, 'save-as-btn')).toMatch(/save as/i);
  });
});
