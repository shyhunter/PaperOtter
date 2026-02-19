import type { SupportedFormat } from '@/types/file';

const SUPPORTED_EXTENSIONS = new Set(['pdf', 'jpg', 'jpeg', 'png', 'webp']);

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
  if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) return 'image';
  return null;
}

export function getFileName(filePath: string): string {
  return filePath.replace(/\\/g, '/').split('/').pop() ?? filePath;
}
