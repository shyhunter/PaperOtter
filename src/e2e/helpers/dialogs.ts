import type { Browser } from 'webdriverio';

/**
 * Patches window.__TAURI__.dialog.save (Tauri v2 API) to resolve immediately
 * with the provided filePath instead of showing the OS dialog.
 *
 * Call BEFORE the user action that triggers the save dialog.
 */
export async function mockSaveDialog(browser: Browser, outputPath: string): Promise<void> {
  await browser.execute((path: string) => {
    const tauri = (window as unknown as { __TAURI__?: { dialog?: { save?: unknown } } }).__TAURI__;
    if (tauri?.dialog) {
      (tauri.dialog as Record<string, unknown>).save = async () => path;
    }
  }, outputPath);
}

/**
 * Removes the mock so subsequent calls use the real OS dialog.
 * Not required in tests (each test gets a fresh WebView), but available for cleanup.
 */
export async function clearSaveDialogMock(browser: Browser): Promise<void> {
  await browser.execute(() => {
    const tauri = (window as unknown as { __TAURI__?: { dialog?: Record<string, unknown> } }).__TAURI__;
    if (tauri?.dialog) {
      delete tauri.dialog.save;
    }
  });
}
