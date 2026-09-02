/**
 * BATCH-CANCEL — cancelling a batch really does stop Ghostscript.
 *
 * The Pre-Release Gate has carried this item as "fixed by inspection; no run
 * has confirmed the child dies", and inspection is exactly what it sounds like:
 * the code reads correctly. `cancel_processing` takes the child out of the
 * mutex and kills it, and the batch hook aborts its queue as well as the work
 * in flight. All true, and none of it evidence.
 *
 * What an orphan would actually cost: Ghostscript carries on compressing a
 * document the user has abandoned — minutes of CPU on a large scan — holding a
 * temp file, with no window left to stop it from. It is invisible, so nobody
 * would report it; they would report that the fan is loud.
 *
 * So this asks the operating system. It matches the bundled sidecar by its full
 * path rather than by the name `gs`, because the machine running this may have
 * its own Ghostscript and a test that reported on someone else's process would
 * be worse than no test.
 *
 * Two claims, and the second is the one inspection cannot make:
 *   1. the queue stops — the batch does not move on to the next file
 *   2. no Ghostscript process belonging to this app is left running
 */
import { browser } from '@wdio/globals';
import { expect } from '@wdio/globals';
import {
  goToDashboard, goToToolById, captureFailure, ghostscriptPids, isAlive,
} from '../../helpers/driver';
import {
  clickTestId, waitForTestId, testIdExists, getTestIdAttr,
} from '../../helpers/testid';
import { Workspace } from '../../helpers/workspace';
import { requirePlatform } from '../../helpers/platform';

const ws = new Workspace('batch-cancel');

after(() => ws.cleanup());

afterEach(async function (this: Mocha.Context) {
  if (this.currentTest?.state === 'failed') {
    await captureFailure(browser, this.currentTest.fullTitle());
  }
});

/** Emit a drop of several files, the way the dashboard receives one. */
async function drop(paths: string[]): Promise<void> {
  await browser.execute(async (dropped: string[]) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const invoke = (window as any).__TAURI_INTERNALS__?.invoke;
    if (!invoke) throw new Error('Tauri IPC unavailable — is this the e2e build?');
    await invoke('e2e_emit_drop', { paths: dropped });
  }, paths);
  await browser.pause(400);
}

describe('Cancelling a batch stops Ghostscript', () => {
  it('[E2E-CANCEL-01] leaves no Ghostscript process behind', async function () {
    // pgrep, and the signal-0 liveness check, are POSIX. Windows would need a
    // different probe and has never run this suite at all.
    if (!requirePlatform(this, ['macos', 'linux'], 'needs pgrep and POSIX signals')) return;

    // Big enough that Ghostscript is still working when we reach for Cancel.
    // Three copies, so there is a queue to stop as well as a child to kill.
    const files = [
      ws.fixture('photo_heavy.pdf', 'cancel-a.pdf'),
      ws.fixture('photo_heavy.pdf', 'cancel-b.pdf'),
      ws.fixture('photo_heavy.pdf', 'cancel-c.pdf'),
    ];

    // Nothing of ours may be running before we start, or the assertion at the
    // end would be measuring an earlier test's leftovers.
    expect(ghostscriptPids()).toEqual([]);

    await goToDashboard(browser);
    if (await testIdExists(browser, 'staged-file')) {
      await clickTestId(browser, 'staged-file-dismiss');
    }
    await drop(files);
    await goToToolById(browser, 'compress-pdf');

    // A batch configures once for the whole set, then runs. The run step only
    // exists after that, so the settings screen has to be cleared first.
    //
    // Generous, and deliberately so. Reaching the starting line is not what
    // this test measures: it is three 2.3 MB documents being read and thumbnailed
    // before anything interesting happens, and how long that takes is a fact
    // about the machine. Twenty seconds was a number picked on a fast Mac and it
    // failed on an old Ubuntu box that ran the rest of the suite perfectly.
    //
    // The assertions after the cancel stay tight, because those are the claim.
    // Setup waits should be forgiving; the thing being proved should not be.
    await waitForTestId(browser, 'configure-step', { timeout: 90000 });
    await clickTestId(browser, 'generate-preview-btn');

    await waitForTestId(browser, 'batch-run-step', { timeout: 90000 });

    // Wait for Ghostscript to actually be running. Cancelling before it starts
    // would prove nothing at all, and would pass every time.
    let running: number[] = [];
    await browser.waitUntil(
      async () => { running = ghostscriptPids(); return running.length > 0; },
      { timeout: 60000, interval: 100, timeoutMsg: 'Ghostscript never started, so there was nothing to cancel' },
    );

    const indexAtCancel = Number(await getTestIdAttr(browser, 'batch-run-step', 'data-batch-index'));
    await clickTestId(browser, 'batch-cancel-btn');

    // 1. Every child that was running when we cancelled is gone.
    await browser.waitUntil(
      async () => running.every((pid) => !isAlive(pid)),
      {
        timeout: 15000,
        interval: 100,
        timeoutMsg: `Ghostscript survived the cancel: ${running.filter(isAlive).join(', ')}`,
      },
    );

    // 2. And nothing new was started — the queue stopped rather than moving on.
    await browser.pause(1500);
    const started = ghostscriptPids();
    if (started.length > 0) {
      throw new Error(`a new Ghostscript started after cancelling: ${started.join(', ')}`);
    }

    // 3. The run really was cancelled, not merely observed finishing.
    //
    // This is the assertion that makes the test mean anything. Without it the
    // whole thing passes when the cancel is removed entirely: three small files
    // compress in about three seconds, every process exits on its own, and
    // "no Ghostscript is running" becomes a statement about a completed batch.
    // Verified by mutation — deleting the click made the earlier version green.
    await waitForTestId(browser, 'batch-summary-step', { timeout: 20000 });
    expect(await getTestIdAttr(browser, 'batch-summary-step', 'data-cancelled')).toBe('true');

    // And it stopped early: fewer files finished than were queued.
    const succeeded = Number(await getTestIdAttr(browser, 'batch-summary-step', 'data-succeeded'));
    expect(succeeded).toBeLessThan(files.length);
    expect(indexAtCancel).toBeLessThan(files.length);
  });
});
