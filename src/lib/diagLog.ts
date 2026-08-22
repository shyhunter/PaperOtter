// TEMPORARY diagnostic logger for tracking down the editor freeze bug.
// Writes to a fixed file on disk so logs can be read directly, without
// needing the user to copy/paste browser console output.
// Remove this file and all its call sites once the bug is resolved.
import { writeFile } from '@tauri-apps/plugin-fs';
import { desktopDir, join } from '@tauri-apps/api/path';

let logPath: string | null = null;
let queue: string[] = [];
let writing = false;
let accumulated = ''; // writeFile always overwrites, so we keep the full text in memory

async function getLogPath(): Promise<string> {
  if (!logPath) {
    logPath = await join(await desktopDir(), 'papercut-diag.log');
  }
  return logPath;
}

async function flush() {
  if (writing || queue.length === 0) return;
  writing = true;
  const batch = queue;
  queue = [];
  accumulated += batch.join('');
  try {
    const path = await getLogPath();
    await writeFile(path, new TextEncoder().encode(accumulated));
  } catch {
    // swallow — diagnostics must never break the app
  } finally {
    writing = false;
    if (queue.length > 0) flush();
  }
}

export function diagLog(msg: string) {
  queue.push(`[${performance.now().toFixed(0)}] ${msg}\n`);
  flush();
}

function showDiagBanner(text: string, ok: boolean) {
  let el = document.getElementById('diag-banner');
  if (!el) {
    el = document.createElement('div');
    el.id = 'diag-banner';
    el.style.cssText =
      'position:fixed;top:0;left:0;right:0;z-index:999999;padding:4px 8px;' +
      'font:11px monospace;white-space:pre-wrap;word-break:break-all;';
    document.body.appendChild(el);
  }
  el.style.background = ok ? '#0a0' : '#a00';
  el.style.color = '#fff';
  el.textContent = text;
}

/** Call once at app startup to reset the log file for a fresh session, and print its path. */
export async function diagLogReset() {
  try {
    const path = await getLogPath();
    accumulated = `=== SESSION START ${new Date().toISOString()} — ${path} ===\n`;
    await writeFile(path, new TextEncoder().encode(accumulated));
    showDiagBanner(`DIAG-OK: ${path}`, true);
  } catch (err) {
    showDiagBanner(`DIAG-ERROR: ${err instanceof Error ? err.message : String(err)}`, false);
  }
}
