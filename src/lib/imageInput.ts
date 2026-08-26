import { invoke } from '@tauri-apps/api/core';
import { readFile } from '@tauri-apps/plugin-fs';
import { getFileSizeBytes, isHeicPath } from '@/lib/fileValidation';

export interface ImageInput {
  bytes: Uint8Array;
  /** MIME type of `bytes` — not of the file on disk, which may have been HEIC. */
  mime: string;
  /**
   * Size of the file on disk. Not `bytes.byteLength`: a PNG decoded from a HEIC
   * is several times larger than the HEIC it came from, and every "before" size
   * the user is shown comes from this field.
   */
  sizeBytes: number;
  /** How many images the source container held; only ever set for HEIC. */
  frameCount?: number;
}

const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  tiff: 'image/tiff',
  tif: 'image/tiff',
  bmp: 'image/bmp',
  gif: 'image/gif',
};

function mimeForPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  return MIME_BY_EXTENSION[ext] ?? 'application/octet-stream';
}

/**
 * Reads an image for use inside the webview.
 *
 * The webview has no HEIC decoder — createImageBitmap and <img> both fail on it —
 * so a HEIC is decoded to PNG in Rust on the way in and every downstream preview,
 * thumbnail and dimension read keeps working unchanged. Everything else is read
 * straight off disk; routing ordinary images through Rust would be a needless
 * round-trip.
 */
export async function readImageBytes(path: string): Promise<ImageInput> {
  if (isHeicPath(path)) {
    const bytes: Uint8Array = await invoke('decode_heic_preview', { sourcePath: path });
    const frameCount: number = await invoke('heic_frame_count', { sourcePath: path });
    return { bytes, mime: 'image/png', sizeBytes: await getFileSizeBytes(path), frameCount };
  }
  const bytes = await readFile(path);
  return { bytes, mime: mimeForPath(path), sizeBytes: bytes.byteLength };
}
