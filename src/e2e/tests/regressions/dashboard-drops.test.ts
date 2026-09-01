/**
 * BATCH-STAGE — a second dropped file adds to the first.
 *
 * Reported from a real build on macOS and Ubuntu alike: drag one file onto the
 * dashboard, then drag another, and only the second is staged. Selecting several
 * and dropping them together always worked, which is what made it read as a
 * counting bug rather than a discard.
 *
 * WHAT THIS PROVES, AND WHAT IT DOES NOT. WebDriver cannot synthesise a native
 * drop: the event begins in the window manager and there is no script path to
 * it. These drive `e2e_emit_drop`, a command compiled only under the `e2e`
 * feature, which emits the payload shape Tauri delivers. So the real app's real
 * handler is exercised with a real sequence of separate drops -- the thing the
 * jsdom test could not do -- but the OS-to-Tauri boundary itself stays
 * uncovered by this or anything else we can automate.
 */
import { browser } from '@wdio/globals';
import { expect } from '@wdio/globals';
import { resetAppState } from '../../helpers/driver';
import { waitForText, pageContainsText } from '../../helpers/testid';
import { Workspace } from '../../helpers/workspace';

const ws = new Workspace('dashboard-drops');

/** Emit a drop through the e2e-only backend command. */
async function drop(paths: string[]): Promise<void> {
  await browser.execute(async (dropped: string[]) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const invoke = (window as any).__TAURI_INTERNALS__?.invoke;
    if (!invoke) throw new Error('Tauri IPC unavailable — is this the e2e build?');
    await invoke('e2e_emit_drop', { paths: dropped });
  }, paths);
  // The handler grants filesystem scope before staging, which is a round trip.
  await browser.pause(400);
}

after(() => ws.cleanup());

describe('Dropping files onto the dashboard', () => {
  it('[E2E-DROP-01] a second drop of the same type adds to the first', async () => {
    const a = ws.fixture('warnock_camelot.pdf', 'drop-a.pdf');
    const b = ws.fixture('sample.pdf', 'drop-b.pdf');

    await resetAppState(browser, 'Merge PDF');
    await drop([a]);
    await waitForText(browser, /drop-a\.pdf/);

    await drop([b]);
    // Two files staged, and the first one's name still leading — reordering
    // under the user would be its own surprise.
    await waitForText(browser, /2 files/i);
    expect(await pageContainsText(browser, /drop-a\.pdf/)).toBe(true);
  });

  it('[E2E-DROP-02] the same file dropped twice is staged once', async () => {
    const a = ws.fixture('warnock_camelot.pdf', 'dup.pdf');

    await resetAppState(browser, 'Merge PDF');
    await drop([a]);
    await drop([a]);

    // A duplicate in a merge is silent and almost never intended.
    expect(await pageContainsText(browser, /2 files/i)).toBe(false);
  });

  it('[E2E-DROP-03] dropping a different type replaces rather than mixing', async () => {
    // A JPEG cannot be merged into a set of PDFs, and a batch of mixed types
    // has no single operation. Unlike the reported bug this is not silent: the
    // banner visibly changes to the new file.
    const pdf = ws.fixture('warnock_camelot.pdf', 'mixed.pdf');
    const jpg = ws.fixture('sample.jpg', 'mixed.jpg');

    await resetAppState(browser, 'Merge PDF');
    await drop([pdf]);
    await waitForText(browser, /mixed\.pdf/);

    await drop([jpg]);
    await waitForText(browser, /mixed\.jpg/);
    expect(await pageContainsText(browser, /mixed\.pdf/)).toBe(false);
  });

  it('[E2E-DROP-04] several drops accumulate into one staged set', async () => {
    const a = ws.fixture('warnock_camelot.pdf', 'acc-a.pdf');
    const b = ws.fixture('sample.pdf', 'acc-b.pdf');
    const c = ws.fixture('photo_heavy.pdf', 'acc-c.pdf');

    await resetAppState(browser, 'Merge PDF');
    await drop([a]);
    await drop([b, c]);

    await waitForText(browser, /3 files/i);
  });
});
