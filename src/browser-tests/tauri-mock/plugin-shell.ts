/** @tauri-apps/plugin-shell — same reasoning as the opener. */
import { record } from './state';

export async function open(path: string): Promise<void> {
  record('shell.open', path);
}
