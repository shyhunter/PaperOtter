/** @tauri-apps/plugin-dialog — native file pickers, answered from a queue. */
import { record, state } from './state';

export interface OpenDialogOptions {
  multiple?: boolean;
  directory?: boolean;
  filters?: { name: string; extensions: string[] }[];
  defaultPath?: string;
  title?: string;
}

/**
 * Returns the next queued path, or null for "the user cancelled".
 *
 * Null on an empty queue is deliberate and is not a silent default: cancelling
 * is a real thing a user does, and a flow that mishandles it should fail here
 * rather than be handed a path nobody asked for.
 */
export async function open(options?: OpenDialogOptions): Promise<string | string[] | null> {
  record('dialog.open', options);
  return state().openQueue.shift() ?? null;
}

export async function save(options?: OpenDialogOptions): Promise<string | null> {
  record('dialog.save', options);
  return state().saveQueue.shift() ?? null;
}

export async function ask(message: string, options?: unknown): Promise<boolean> {
  record('dialog.ask', message, options);
  return state().askQueue.shift() ?? true;
}
