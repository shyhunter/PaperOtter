import { t } from '@/i18n';
import type { SupportedFormat } from '@/types/file';

const SUPPORTED_EXTENSIONS = new Set([
  'pdf', 'jpg', 'jpeg', 'png', 'webp', 'tiff', 'tif', 'bmp', 'gif', 'heic', 'heif',
  'docx', 'doc', 'odt', 'epub', 'mobi', 'azw3', 'txt', 'rtf', 'html',
]);

/** Hard limit: 100 MB in bytes */
export const FILE_SIZE_LIMIT_BYTES = 100 * 1024 * 1024; // 104857600

/**
 * Returns the byte length of a file at the given path.
 * Uses @tauri-apps/plugin-fs readFile — same permission already granted.
 * Throws if the file cannot be read.
 */
export async function getFileSizeBytes(filePath: string): Promise<number> {
  const { readFile } = await import('@tauri-apps/plugin-fs');
  const bytes = await readFile(filePath);
  return bytes.byteLength;
}

export function getExtension(filePath: string): string {
  return filePath.split('.').pop()?.toLowerCase() ?? '';
}

export function isSupportedFile(filePath: string): boolean {
  // Defensive: guard against path corruption (Tauri Windows bug #13698)
  if (!filePath || filePath.length > 4096 || filePath.includes('\0')) {
    return false;
  }
  return SUPPORTED_EXTENSIONS.has(getExtension(filePath));
}

export function detectFormat(filePath: string): SupportedFormat | null {
  const ext = getExtension(filePath);
  if (ext === 'pdf') return 'pdf';
  if (['jpg', 'jpeg', 'png', 'webp', 'tiff', 'tif', 'bmp', 'gif', 'heic', 'heif'].includes(ext)) return 'image';
  if (['docx', 'doc', 'odt', 'epub', 'mobi', 'azw3', 'txt', 'rtf', 'html'].includes(ext)) return 'document';
  return null;
}

/** The extensions an iPhone writes for its default photo format. */
const HEIC_EXTENSIONS = ['heic', 'heif'];

export function isHeicPath(filePath: string): boolean {
  return HEIC_EXTENSIONS.includes(getExtension(filePath));
}

/**
 * Whether this build can decode HEIC.
 *
 * Decoding runs on macOS Image I/O (see src-tauri/src/heic.rs) because no
 * permissively-licensed cross-platform decoder exists. The Rust side is the real
 * gate and errors regardless; this is here so a Windows or Linux user is told at
 * the moment they drop the file rather than three configuration steps later.
 */
export function isHeicDecodable(): boolean {
  return navigator.userAgent.includes('Macintosh');
}

/**
 * Strips a trailing image extension so an output name can be built from it.
 * Without HEIC here, converting IMG_4032.heic produces "IMG_4032.heic.jpg".
 */
export function stripImageExtension(fileName: string): string {
  return fileName.replace(/\.(jpe?g|png|webp|bmp|tiff?|gif|heic|heif)$/i, '');
}

/** Tells the user what to do instead, not merely that it did not work. */
export const heicUnsupportedMessage = () => t('file.heicNeedsMacos');

export function getFileName(filePath: string): string {
  return filePath.replace(/\\/g, '/').split('/').pop() ?? filePath;
}

/**
 * Validates that a filename contains only safe characters.
 * Mirrors the Rust-side validate_filename_chars() allow-list.
 * Returns true if safe, false if the filename contains dangerous characters.
 */
export function isFilenameSafe(filePath: string): boolean {
  const filename = filePath.replace(/\\/g, '/').split('/').pop() ?? '';
  if (!filename) return false;

  const SAFE_CHARS = /^[a-zA-Z0-9\u00C0-\u024F\u0400-\u04FF\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF .\-_()[\]{}+=#@!,]+$/;
  return SAFE_CHARS.test(filename);
}

/** User-facing error message for unsafe filenames (matches Rust-side message). */
export const unsafeFilenameMessage = () => t('file.unsafeName');

/**
 * Returns true if the first 5 bytes of the given buffer match the PDF magic bytes: %PDF-
 * (0x25 0x50 0x44 0x46 0x2D).
 * Used for early corrupt-file detection before expensive PDF parsing.
 */
export function isPdfHeader(bytes: Uint8Array): boolean {
  if (bytes.length < 5) return false;
  return (
    bytes[0] === 0x25 && // %
    bytes[1] === 0x50 && // P
    bytes[2] === 0x44 && // D
    bytes[3] === 0x46 && // F
    bytes[4] === 0x2D    // -
  );
}
