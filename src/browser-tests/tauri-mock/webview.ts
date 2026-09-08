/**
 * @tauri-apps/api/webview — the native drag-drop channel.
 *
 * The registered handler is parked on `window.__papercutDrop` so a Playwright
 * test can fire a real drop the way the OS would, rather than the app's own
 * code being asked to pretend. That is what makes drag-and-drop testable here
 * at all: in the shipped app these events come from Tauri, not from the DOM.
 */
import { record } from './state';

type DropPayload =
  | { type: 'enter' | 'over'; position: { x: number; y: number }; paths?: string[] }
  | { type: 'drop'; position: { x: number; y: number }; paths: string[] }
  | { type: 'leave' };

declare global {
  interface Window {
    __papercutDrop?: (payload: DropPayload) => void;
  }
}

export function getCurrentWebview() {
  return {
    async onDragDropEvent(handler: (event: { payload: DropPayload }) => void) {
      record('webview.onDragDropEvent');
      window.__papercutDrop = (payload) => handler({ payload });
      return () => {
        delete window.__papercutDrop;
      };
    },
  };
}
