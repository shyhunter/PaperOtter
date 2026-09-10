import type { Browser } from 'webdriverio';
import { mkdirSync, rmSync, existsSync, statSync, writeFileSync } from 'fs';
import { join } from 'path';
import { spawnSync } from 'child_process';
import { testIdDisplayed, testIdExists, clickTestId, waitForTestId, getTestIdText } from './testid';

// Fixture directories — overridable via env vars so CI can place them inside
// /tmp (within Tauri's $TEMP fs scope, which is required for the frontend
// readFile API to succeed).
export const E2E_OUTPUT_DIR = process.env.E2E_OUTPUT_DIR ?? join(process.cwd(), 'e2e-output');
export const FIXTURES_DIR = process.env.E2E_FIXTURES_DIR ?? join(process.cwd(), 'test-fixtures-e2e');
export const REAL_FIXTURES_DIR = process.env.E2E_REAL_FIXTURES_DIR ?? join(process.cwd(), 'test-fixtures');

/** Ensure e2e-output dir exists and return a unique output path for this test. */
export function prepareOutputPath(filename: string): string {
  mkdirSync(E2E_OUTPUT_DIR, { recursive: true });
  const outPath = join(E2E_OUTPUT_DIR, filename);
  // Clean up any leftover from a previous run
  if (existsSync(outPath)) rmSync(outPath);
  return outPath;
}

/**
 * Navigate from the Dashboard to a specific tool.
 * The app starts on the Dashboard (tool grid). Each tool flow begins only after
 * clicking a tool card.  Call this once per session before the first injectFile().
 */
export async function selectToolOnDashboard(browser: Browser, toolName: string): Promise<void> {
  // Wait for the Dashboard to render.  Tool cards are <button> elements
  // whose textContent includes the tool name (e.g. "Compress PDF").
  // We use browser.execute because WebDriver text selectors may be unreliable
  // in WebKitGTK.
  await browser.waitUntil(
    async () =>
      browser.execute((name: string) => {
        const btns = document.querySelectorAll('button');
        for (const btn of btns) {
          if (btn.textContent?.includes(name)) return true;
        }
        return false;
      }, toolName),
    { timeout: 15000, timeoutMsg: `Dashboard tool card "${toolName}" not found` },
  );

  await browser.execute((name: string) => {
    const btns = document.querySelectorAll('button');
    for (const btn of btns) {
      if (btn.textContent?.includes(name)) {
        btn.click();
        return;
      }
    }
  }, toolName);
}

/** Wait for the loading overlay to disappear (file is loaded). */
export async function waitForFileLoaded(browser: Browser): Promise<void> {
  await browser.waitUntil(
    async () =>
      browser.execute(() => {
        const spinner = document.querySelector('[data-testid="loading-spinner"]') as HTMLElement | null;
        if (!spinner) return true;
        const style = getComputedStyle(spinner);
        const rect = spinner.getBoundingClientRect();
        return style.display === 'none' || style.visibility === 'hidden' || rect.width === 0 || rect.height === 0;
      }),
    { timeout: 10000, interval: 100, timeoutMsg: 'Timed out waiting for file load' },
  );
}

/**
 * Wait for processing to complete by polling for the compare step container.
 *
 * @param compareTestId - data-testid of the compare step root element.
 *   Use 'compare-step' for PDF tests (default).
 *   Use 'image-compare-step' for image tests.
 */
export async function waitForProcessingComplete(
  browser: Browser,
  compareTestId: 'compare-step' | 'image-compare-step' = 'compare-step',
): Promise<void> {
  await browser.waitUntil(
    async () =>
      browser.execute((id: string) => {
        const el = document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
        if (!el) return false;
        const style = getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      }, compareTestId),
    { timeout: 90000, interval: 500, timeoutMsg: `Timed out waiting for ${compareTestId} to appear` },
  );
}

/** Take a screenshot on failure. Called from afterEach hooks in test files. */
export async function screenshotOnFailure(browser: Browser, testTitle: string): Promise<void> {
  const dir = join(process.cwd(), '.e2e-artifacts', 'screenshots');
  mkdirSync(dir, { recursive: true });
  const safe = testTitle.replace(/[^a-z0-9]/gi, '_').slice(0, 80);
  await browser.saveScreenshot(join(dir, `${safe}_${Date.now()}.png`));
}

/**
 * Put the app on the dashboard, from wherever it currently is.
 *
 * NEVER refreshes, and nothing in this suite may. `browser.refresh()` was this
 * helper's recovery path and it is the most destructive thing the suite could
 * do: reloading the webview throws away the scripts the automation plugin is
 * still waiting on, and tauri-plugin-webdriver-automation 0.1.3 meets a result
 * for an id it no longer holds with `.expect("no pending script with that id")`
 * — a panic, which poisons the Mutex guarding that map. Every later
 * `execute/sync` in the session then fails with `lock poisoned`, and so does
 * the DELETE that ends the session, so the run also hangs on teardown with its
 * results already written to disk. Observed on 2026-09-02: one refresh, then
 * nine minutes of `lock poisoned` and a terminal that had to be killed by hand.
 *
 * Navigation therefore goes through the app's own controls, the way a person's
 * would.
 */
export async function goToDashboard(browser: Browser): Promise<void> {
  if (await testIdDisplayed(browser, 'dashboard')) return;

  // Edit PDF guards its back button with a confirm() when there are unsaved
  // edits. An unanswered native dialog blocks the webview and every command
  // after it, so answer it before the click rather than after.
  await browser.execute(() => { window.confirm = () => true; });

  if (await testIdExists(browser, 'back-to-dashboard')) {
    await clickTestId(browser, 'back-to-dashboard');
  }
  await waitForTestId(browser, 'dashboard', { timeout: 10000 });
}

/**
 * Dashboard, then into the named tool — and then check that is where we are.
 *
 * The check is the point. `selectToolOnDashboard` clicks the first button whose
 * text contains the name, and a click that lands on nothing, or on the wrong
 * card, leaves the app somewhere else entirely with no error at all. The
 * breadcrumb is the app's own statement of which tool is open, so a spec that
 * silently ran against a different one now fails instead of passing.
 */
export async function goToTool(browser: Browser, toolName: string): Promise<void> {
  await goToDashboard(browser);
  await selectToolOnDashboard(browser, toolName);
  await waitForTestId(browser, 'current-tool', { timeout: 10000 });

  const here = (await getTestIdText(browser, 'current-tool')).trim();
  if (!here.includes(toolName)) {
    throw new Error(`Asked for "${toolName}" but the app opened "${here}"`);
  }
}


/** What the dashboard says about a tool right now. */
export type ToolAvailability = 'ready' | 'unavailable' | 'missing';

/**
 * Ask the dashboard whether a tool can be opened, by id.
 *
 * `unavailable` is the platform gate speaking: Ghostscript, Calibre or
 * LibreOffice is absent, so the card is disabled with a hint. A suite that
 * failed on those would be reporting the machine, not the code — and one that
 * ignored them would report a green run for tools it never opened. Reading the
 * app's own answer beats a hardcoded list of platforms that goes stale.
 */
export async function toolAvailability(browser: Browser, toolId: string): Promise<ToolAvailability> {
  return browser.execute((id: string) => {
    const card = document.querySelector(`[data-testid="tool-card"][data-tool-id="${id}"]`);
    if (!card) return 'missing';
    return card.getAttribute('data-disabled') === 'true' ? 'unavailable' : 'ready';
  }, toolId) as Promise<ToolAvailability>;
}

/**
 * Dashboard, then into the tool with this id — and confirm that is where we are.
 *
 * By id, not by name. The displayed name is copy in nine languages, and a spec
 * pinned to one of them broke the day "Organize PDF" became "Organise PDF" —
 * a fifteen-second timeout that said nothing about the cause.
 */
export async function goToToolById(browser: Browser, toolId: string): Promise<void> {
  await goToDashboard(browser);

  const state = await toolAvailability(browser, toolId);
  if (state !== 'ready') throw new Error(`Tool "${toolId}" is ${state} on this machine`);

  await browser.execute((id: string) => {
    const card = document.querySelector(`[data-testid="tool-card"][data-tool-id="${id}"]`) as HTMLElement | null;
    card?.click();
  }, toolId);

  await waitForTestId(browser, 'current-tool', { timeout: 10000 });
}


/**
 * Emit a drop through the e2e-only backend command. Does not wait for anything.
 *
 * The raw form, for the warm-up below. Tests should use a wrapper that waits for
 * the staged banner: a drop whose effect nobody waited for is a drop asserted
 * about in the wrong state.
 */
export async function emitDrop(browser: Browser, paths: string[]): Promise<void> {
  await browser.execute(async (dropped: string[]) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const invoke = (window as any).__TAURI_INTERNALS__?.invoke;
    if (!invoke) throw new Error('Tauri IPC unavailable — is this the e2e build?');
    await invoke('e2e_emit_drop', { paths: dropped });
  }, paths);
}

/**
 * Wait for Tauri's drag-drop listener to actually exist, then clear the probe.
 *
 * Tauri registers it with an async `listen()` from an effect, so the dashboard
 * is on screen and interactive for a window during which a drop is delivered to
 * nobody at all. A person cannot drop a file in the few hundred milliseconds
 * after launch; `e2e_emit_drop` can.
 *
 * Every spec that drops needs this, not just the one where it was first found.
 * It lived inside dashboard-drops, and batch-cancel — which sorts first, so it
 * always meets a freshly launched app — did not have it. On a fast machine the
 * listener wins that race and nothing looks wrong; on an old Ubuntu box it lost,
 * the drop vanished, and the tool opened empty twenty seconds later.
 *
 * Polling here rather than retrying inside the per-test drop keeps each test
 * honest: after this returns, a drop that goes missing is a failure rather than
 * something a helper quietly papers over.
 */
export async function warmUpDropListener(browser: Browser, probePath: string): Promise<void> {
  await browser.waitUntil(
    async () => {
      await emitDrop(browser, [probePath]);
      // A short settle: the emit is a round trip, and the banner is React state
      // that lands a tick later. This is the one place a small pause is right —
      // it is a poll interval, not a guess about how long the work takes.
      await browser.pause(250);
      return testIdExists(browser, 'staged-file');
    },
    { timeout: 30000, interval: 250, timeoutMsg: 'the drag-drop listener never came up' },
  );
  await clickTestId(browser, 'staged-file-dismiss');
}

/**
 * Reset the app to the open-file page of a standard tool (Compress, Rotate…).
 *
 * Always leaves through the dashboard and comes back in, which unmounts the
 * flow and discards its state. That costs a second or two per test and buys the
 * only thing that matters: the previous test's leftovers cannot be mistaken for
 * this one's result.
 *
 * It used to return early whenever an `open-file-btn` was on screen, without
 * checking whose. A refused document leaves its flow on step 0 with that button
 * and an error banner still showing, so on 2026-09-02 a spec that walked eleven
 * tools in turn never left the first one: every iteration saw the button,
 * returned, re-tested Rotate PDF, found Rotate's banner and passed. Eleven
 * green results for one tool tested eleven times, and the only test that failed
 * was the one that noticed.
 *
 * Guard: if the WebDriver plugin has gone (browser.execute() throws), the
 * session is dead for good — return rather than spend every remaining test's
 * timeout rediscovering that one at a time.
 */
export async function resetAppState(browser: Browser, toolName: string): Promise<void> {
  try {
    await browser.execute(() => true); // lightweight ping
  } catch {
    console.warn('[resetAppState] WebDriver plugin unresponsive — skipping reset');
    return;
  }

  await goToTool(browser, toolName);
  await waitForTestId(browser, 'open-file-btn', { timeout: 10000 });
}


/**
 * Finish a save, whichever way this flow offers one.
 *
 * There are two shapes, and a spec cannot assume either. A flow that knows the
 * file it opened can overwrite it, so SaveStep waits for the user to choose
 * between Save and Save as…; a flow that changes the type or the count cannot,
 * so it opens the dialog the moment the step mounts and, under test, has
 * already written the file before a spec can look. Compress PDF is the first,
 * Compress Image the second — and patching the specs for one shape promptly
 * broke the other.
 *
 * `outPath` must already be armed with mockSaveDialog.
 */
export async function completeSave(browser: Browser, outPath: string): Promise<void> {
  const started = (): boolean => existsSync(outPath);

  await browser.waitUntil(
    async () => started() || (await testIdExists(browser, 'save-as-btn')),
    { timeout: 30000, interval: 100, timeoutMsg: 'the save step neither saved nor offered a choice' },
  );

  // Only the choosing shape needs the click; the other has finished already.
  if (!started()) await clickTestId(browser, 'save-as-btn');

  // Existence is not completion. The file appears the moment the write opens
  // it, and a spec that reads it then gets whatever has landed so far — on
  // 2026-09-02 that was zero bytes for a 2.4 MB compress, reported as the
  // compression producing an empty document. Wait for a non-zero size that has
  // stopped changing.
  let previous = -1;
  await browser.waitUntil(
    async () => {
      if (!started()) return false;
      const size = statSync(outPath).size;
      const settled = size > 0 && size === previous;
      previous = size;
      return settled;
    },
    {
      timeout: 30000,
      interval: 100,
      timeoutMsg: `output file never settled at a non-zero size: ${outPath}`,
    },
  );
}


/**
 * Reach the point where the save dialog's options have been captured.
 *
 * Same two shapes as completeSave: the capture happens inside handleSave, and
 * whether handleSave runs on mount or waits for a click depends on whether the
 * flow could overwrite its source.
 */
export async function completeSaveCapture(browser: Browser): Promise<void> {
  // Arm with captureSaveOptions() before navigating: it clears any previous
  // result, and the clearing has to happen *then*, not here. A flow whose
  // output format differs from its input cannot replace the original, so
  // SaveStep opens the dialog the instant it mounts and the capture is already
  // finished by the time this runs — clearing here threw that capture away and
  // then waited for it. A leftover value read here would be worse still: it
  // reads as "already captured", so this returns without clicking and hands the
  // spec the previous document's options. That one cost a test that looked
  // exactly like an app bug, reporting "JPEG Image" for a PNG.
  const captured = async (): Promise<boolean> =>
    (await browser.execute(() =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      Boolean((window as any).__E2E_SAVE_OPTS__))) === true;

  await browser.waitUntil(
    async () => (await captured()) || (await testIdExists(browser, 'save-as-btn')),
    { timeout: 30000, interval: 100, timeoutMsg: 'the save step neither captured nor offered a choice' },
  );

  if (!(await captured())) await clickTestId(browser, 'save-as-btn');

  await browser.waitUntil(captured, {
    timeout: 15000, interval: 100, timeoutMsg: 'the save dialog options were never captured',
  });
}

/**
 * Save everything about the app's current state that a failure message cannot
 * carry: a screenshot, and a JSON snapshot of the DOM.
 *
 * A one-line timeout ("waiting for open-file-btn") says which element was
 * missing and nothing at all about what was on screen instead — which is the
 * only question worth asking. The snapshot lists every data-testid present and
 * every button's label, so the page can be identified from the artefact alone,
 * afterwards, on a different machine.
 *
 * Never throws: this runs in afterEach on an already-failing test, and a
 * capture that fails must not replace the real failure with its own.
 */
export async function captureFailure(browser: Browser, testTitle: string): Promise<void> {
  const root = join(process.cwd(), '.e2e-artifacts');
  const stamp = `${testTitle.replace(/[^a-z0-9]/gi, '_').slice(0, 80)}_${Date.now()}`;

  try {
    mkdirSync(join(root, 'screenshots'), { recursive: true });
    await browser.saveScreenshot(join(root, 'screenshots', `${stamp}.png`));
  } catch (e) {
    console.warn('[captureFailure] screenshot failed:', (e as Error).message);
  }

  try {
    const snapshot = await browser.execute(() => ({
      url: location.href,
      testIds: Array.from(document.querySelectorAll('[data-testid]'))
        .map((el) => el.getAttribute('data-testid')),
      buttons: Array.from(document.querySelectorAll('button'))
        .map((b) => (b.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 60))
        .filter(Boolean),
      text: (document.body.innerText ?? '').replace(/\n{3,}/g, '\n\n').slice(0, 4000),
      // Whatever the save dialog was told to do, when a spec armed the capture.
      // A filter assertion that fails says only that a string was missing; this
      // says what was actually there.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      savedDialogOptions: (window as any).__E2E_SAVE_OPTS__ ?? null,
    }));
    mkdirSync(join(root, 'dom'), { recursive: true });
    writeFileSync(join(root, 'dom', `${stamp}.json`), JSON.stringify(snapshot, null, 2) + '\n');
  } catch (e) {
    console.warn('[captureFailure] DOM snapshot failed:', (e as Error).message);
  }
}

/**
 * PIDs of the Ghostscript children belonging to the app under test.
 *
 * Matched on the bundled sidecar's full path, never on the name `gs`: the
 * machine running this may well have its own Ghostscript installed, and a test
 * that killed — or worse, reported on — someone's unrelated process would be
 * both wrong and rude.
 *
 * Ghostscript is the one subprocess this app can leave behind. Cancelling is
 * supposed to end it, and until now nothing had ever checked that it does; an
 * orphan carries on compressing a document the user abandoned, holding CPU and
 * a temp file, with no window left to stop it from.
 */
export function ghostscriptPids(): number[] {
  // Both layouts, because the build differs by platform: macOS bundles the
  // sidecar inside the .app beside the binary, Linux and Windows leave it next
  // to the plain binary in target/debug. Checking both means this helper does
  // not silently return an empty list — and therefore a passing test — on the
  // platform whose build shape it did not anticipate.
  const candidates = [
    'src-tauri/target/debug/bundle/macos/PaperOtter.app/Contents/MacOS/gs',
    'src-tauri/target/debug/gs',
  ].map((rel) => join(process.cwd(), rel));

  const found = spawnSync('pgrep', ['-f', candidates.join('|')], { encoding: 'utf8' });
  // pgrep exits 1 when nothing matches, which is the common case, not an error.
  return (found.stdout ?? '')
    .split('\n')
    .map((line) => Number(line.trim()))
    .filter((pid) => Number.isInteger(pid) && pid > 0);
}

/** Whether a process is still alive, without signalling it. */
export function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
