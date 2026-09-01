import type { Browser } from 'webdriverio';

/**
 * Sets window.__E2E_OPEN_FILE__ so that the next call to handlePickerClick()
 * in App.tsx uses filePath instead of opening the OS file picker.
 *
 * Tauri v2 freezes __TAURI_INTERNALS__.invoke (non-writable, non-configurable),
 * so IPC patching is impossible from JS. Instead, we use plain window globals
 * that the app code reads before calling Tauri APIs.
 *
 * Must be called BEFORE the UI action that triggers the open dialog.
 */
export async function mockOpenDialog(browser: Browser, filePath: string): Promise<void> {
  await browser.execute((path: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__E2E_OPEN_FILE__ = path;
  }, filePath);
}

/**
 * Sets window.__E2E_SAVE_PATH__ so that SaveStep.handleSave() writes directly
 * to outputPath instead of opening the OS save dialog.
 *
 * Must be called BEFORE the UI action that triggers the save dialog.
 */
export async function mockSaveDialog(browser: Browser, outputPath: string): Promise<void> {
  await browser.execute((path: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__E2E_SAVE_PATH__ = path;
  }, outputPath);
}

/**
 * Arm SaveStep's capture hook, so the next Save as… records what it *would*
 * have asked the OS for instead of opening a dialog.
 *
 * This is the only way to assert `defaultPath` — the folder and name the dialog
 * is told to open with. A native dialog cannot be inspected, and bypassing it
 * with `__E2E_SAVE_PATH__` writes the file but discards the very thing being
 * checked.
 */
export async function captureSaveOptions(browser: Browser): Promise<void> {
  await browser.execute(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__E2E_CAPTURE_SAVE_OPTS__ = true;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).__E2E_SAVE_OPTS__;
  });
}

/** Read back what the save dialog was asked for. Null until a save is attempted. */
export async function readCapturedSaveOptions(
  browser: Browser,
): Promise<{ defaultPath?: string; filters?: unknown } | null> {
  return browser.execute(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (window as any).__E2E_SAVE_OPTS__?.options ?? null;
  });
}
