import { zipSync } from 'fflate';

/** One file destined for the archive. */
export interface ZipEntry {
  fileName: string;
  bytes: Uint8Array;
}

/**
 * Coerces whatever a Tauri command actually handed back into real bytes.
 *
 * Every byte-returning command in `src-tauri/src/lib.rs` returns
 * `tauri::ipc::Response`, which reaches the webview as an **ArrayBuffer** — but
 * every call site annotates the result as `Uint8Array`, and TypeScript cannot
 * check what `invoke` returns. Most consumers never noticed: `byteLength` and
 * `new Blob([...])` accept either.
 *
 * fflate is the one that cannot. Given a value that is not a Uint8Array it
 * treats it as a nested directory, so an ArrayBuffer — which has no enumerable
 * keys — became an empty folder. That is how a three-file batch produced an
 * archive of three empty directories and no documents at all.
 */
export function toBytes(value: Uint8Array | ArrayBuffer | ArrayBufferView): Uint8Array {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
}

/**
 * Builds a ZIP from processed outputs.
 *
 * Normalising here rather than at each call site is deliberate: this is the only
 * consumer that breaks on the wrong type, and it serves split, PDF-to-JPG and
 * batch alike.
 */
export function buildZip(entries: ZipEntry[]): Uint8Array {
  const zipData: Record<string, Uint8Array> = {};
  for (const entry of entries) {
    zipData[entry.fileName] = toBytes(entry.bytes);
  }
  return zipSync(zipData);
}
