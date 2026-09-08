/** @tauri-apps/api/core — the Rust IPC boundary. */
import { record, state, unregistered } from './state';

export async function invoke<T = unknown>(cmd: string, args?: unknown): Promise<T> {
  record('invoke', cmd, args);
  const results = state().invokeResults;
  if (!Object.prototype.hasOwnProperty.call(results, cmd)) {
    unregistered('invoke', `command ${JSON.stringify(cmd)}`);
  }
  const result = results[cmd];
  // A function lets a test answer differently per call without re-seeding.
  return (typeof result === 'function' ? result(args) : result) as T;
}
