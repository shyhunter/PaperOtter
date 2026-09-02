/**
 * The file-open dialog, with the automated-test override in one place.
 *
 * WebDriver cannot answer a native file picker: the dialog belongs to the OS,
 * not the page, and Tauri 2 freezes `__TAURI_INTERNALS__.invoke`, so there is
 * no way to intercept the IPC from a script either. The suite therefore sets a
 * plain window global and the app reads it before asking the OS.
 *
 * App.tsx has done exactly this since the first E2E tests. What it could not do
 * was cover the nineteen dedicated flows — Rotate, Split, Crop, Watermark and
 * the rest each call the plugin's `open` directly, so every automated test that
 * needed one of them clicked the button, got a real picker nobody could answer,
 * and failed fifteen seconds later on a screen that looked perfectly healthy.
 * Importing `open` from here instead makes one hook serve all of them.
 *
 * The override does nothing unless `__E2E_OPEN_FILE__` is set, and nothing in
 * the app ever sets it; it is consumed on read, so one injected path answers
 * exactly one dialog.
 */
import { open as tauriOpen, type OpenDialogOptions } from '@tauri-apps/plugin-dialog';

function takeInjectedPath(): string | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const injected = (window as any).__E2E_OPEN_FILE__ as string | undefined;
  if (!injected) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (window as any).__E2E_OPEN_FILE__;
  return injected;
}

/**
 * Drop-in for the plugin's `open`.
 *
 * Typed as the plugin's own function so callers keep its overloads — it is
 * `multiple` that decides between `string` and `string[]`, and losing that
 * narrowing would push a union onto every call site for no reason. The cast is
 * the price of writing one body for several overloads.
 */
export const open = (async (options?: OpenDialogOptions) => {
  const injected = takeInjectedPath();
  if (injected !== null) {
    // A multi-select caller is handed a one-item selection, which is a
    // selection it must already handle.
    return options?.multiple ? [injected] : injected;
  }
  return tauriOpen(options);
}) as typeof tauriOpen;
