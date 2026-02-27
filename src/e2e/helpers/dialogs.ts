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
