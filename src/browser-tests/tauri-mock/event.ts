/** @tauri-apps/api/event — nothing emits in the harness, so listeners just detach. */
import { record } from './state';

export async function listen<T = unknown>(
  event: string,
  _handler: (event: { payload: T }) => void,
): Promise<() => void> {
  record('event.listen', event);
  return () => {};
}
