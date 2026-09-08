/** @tauri-apps/plugin-fs — an in-memory filesystem the test seeds and inspects. */
import { record, state, unregistered } from './state';

export async function readFile(path: string): Promise<Uint8Array> {
  record('fs.readFile', path);
  const bytes = state().files[path];
  if (bytes === undefined) {
    // Not a silent empty buffer: an empty PDF fails much later and much less
    // legibly than the missing seed that actually caused it.
    unregistered('fs.readFile', `path ${JSON.stringify(path)}`);
  }
  return new Uint8Array(bytes);
}

export async function writeFile(path: string, data: Uint8Array): Promise<void> {
  record('fs.writeFile', path, data.byteLength);
  state().files[path] = Array.from(data);
}

export async function exists(path: string): Promise<boolean> {
  record('fs.exists', path);
  return Object.prototype.hasOwnProperty.call(state().files, path);
}

export async function remove(path: string): Promise<void> {
  record('fs.remove', path);
  delete state().files[path];
}
