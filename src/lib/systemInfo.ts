import { invoke } from '@tauri-apps/api/core';

/** Reports the OS and CPU architecture this build actually runs on, e.g.
 * "macOS (aarch64)".
 *
 * The webview's `navigator.platform` says "MacIntel" on every Mac, Apple
 * Silicon included, so it cannot distinguish an aarch64 build from an x86_64
 * one -- a distinction that matters because the Ghostscript sidecar is
 * architecture-specific. The authoritative value comes from the Rust side.
 *
 * Never throws: falls back to `navigator.platform` if the command is
 * unavailable (e.g. running outside Tauri, or in a test environment). */
export async function getSystemInfo(): Promise<string> {
  const fallback = navigator.platform || 'unknown';
  try {
    const info = await invoke<string>('system_info');
    return typeof info === 'string' && info.length > 0 ? info : fallback;
  } catch {
    return fallback;
  }
}
