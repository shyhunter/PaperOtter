/** @tauri-apps/api/window */
import { record } from './state';

export function getCurrentWindow() {
  return {
    async onCloseRequested(_handler: unknown) {
      record('window.onCloseRequested');
      return () => {};
    },
    async destroy() {
      record('window.destroy');
    },
    async close() {
      record('window.close');
    },
  };
}
