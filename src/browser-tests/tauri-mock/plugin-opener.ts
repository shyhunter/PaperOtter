/** @tauri-apps/plugin-opener — leaves the app, so recording the intent is the test. */
import { record } from './state';

export async function openUrl(url: string): Promise<void> {
  record('opener.openUrl', url);
}

export async function revealItemInDir(path: string): Promise<void> {
  record('opener.revealItemInDir', path);
}
