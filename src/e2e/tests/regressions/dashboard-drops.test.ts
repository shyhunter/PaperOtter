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
import { goToDashboard, captureFailure, emitDrop, warmUpDropListener } from '../../helpers/driver';
import { waitForText, pageContainsText, testIdExists, clickTestId, waitForTestId } from '../../helpers/testid';
import { Workspace } from '../../helpers/workspace';

const ws = new Workspace('dashboard-drops');

/** Emit a drop and wait for it to land. */
async function drop(paths: string[]): Promise<void> {
  await emitDrop(browser, paths);
  // The banner is the observable outcome; a fixed pause is a guess about how
  // long staging takes on someone else's machine.
  await waitForTestId(browser, 'staged-file', { timeout: 15000 });
}

after(() => ws.cleanup());
before(async () => {
  await goToDashboard(browser);
  await warmUpDropListener(browser, ws.fixture('sample.pdf', 'listener-warmup.pdf'));
});


/**
 * The dashboard, with nothing staged.
 *
 * These test the dashboard's own drop handler, so they must be ON the dashboard
 * — resetAppState navigates into a tool by design, and the handler is not
 * mounted there. Staging also survives between tests, and a set left over from
 * the previous one is indistinguishable from the accumulation being tested.
 */
async function startOnEmptyDashboard(): Promise<void> {
  await goToDashboard(browser);
  if (await testIdExists(browser, 'staged-file')) {
    await clickTestId(browser, 'staged-file-dismiss');
  }
}



// A one-line timeout says which element was missing, never what was on screen
// instead. Capture both, so a red run can be read from its artefacts.
afterEach(async function (this: Mocha.Context) {
  if (this.currentTest?.state === 'failed') {
    await captureFailure(browser, this.currentTest.fullTitle());
  }
});

describe('Dropping files onto the dashboard', () => {
  it('[E2E-DROP-01] a second drop of the same type adds to the first', async () => {
    const a = ws.fixture('warnock_camelot.pdf', 'drop-a.pdf');
    const b = ws.fixture('sample.pdf', 'drop-b.pdf');

    await startOnEmptyDashboard();
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

    const other = ws.fixture('sample.pdf', 'dup-other.pdf');

    await startOnEmptyDashboard();
    await drop([a]);
    await drop([a]);

    // A third, distinct file, to turn a negative claim into a positive one.
    //
    // Asserting only that "2 files" is absent passes just as happily when the
    // second drop was never processed at all — which is precisely what a slow
    // machine does — and it would pass with deduplication entirely broken.
    // Dropping something different forces a count that can only come out one
    // way: deduplicated this is two files, not deduplicated it is three.
    //
    // A duplicate in a merge is silent and almost never intended, which is why
    // it is worth proving rather than assuming.
    await drop([other]);
    await waitForText(browser, /2 files/i);
    expect(await pageContainsText(browser, /3 files/i)).toBe(false);
  });

  it('[E2E-DROP-03] dropping a different type replaces rather than mixing', async () => {
    // A JPEG cannot be merged into a set of PDFs, and a batch of mixed types
    // has no single operation. Unlike the reported bug this is not silent: the
    // banner visibly changes to the new file.
    const pdf = ws.fixture('warnock_camelot.pdf', 'mixed.pdf');
    const jpg = ws.fixture('sample.jpg', 'mixed.jpg');

    await startOnEmptyDashboard();
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

    await startOnEmptyDashboard();
    await drop([a]);
    await drop([b, c]);

    await waitForText(browser, /3 files/i);
  });
});
