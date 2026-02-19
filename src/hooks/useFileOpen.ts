// Uses @tauri-apps/plugin-dialog (Tauri 2 — NOT @tauri-apps/api/dialog which is Tauri 1)
// Requires "dialog:allow-open" in src-tauri/capabilities/default.json (added in plan 01-01)
import { open } from '@tauri-apps/plugin-dialog';
import { isSupportedFile } from '@/lib/fileValidation';

export async function openFilePicker(): Promise<string | null> {
  const result = await open({
    multiple: false,
    directory: false,
    filters: [
      {
        name: 'Supported Files',
        extensions: ['pdf', 'jpg', 'jpeg', 'png', 'webp'],
      },
    ],
  });
  // result is string | string[] | null in Tauri 2 (multiple:false → string | null)
  if (typeof result === 'string' && isSupportedFile(result)) {
    return result;
  }
  return null;
}
