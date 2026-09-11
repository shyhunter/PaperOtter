// Uses @tauri-apps/plugin-dialog (Tauri 2 — NOT @tauri-apps/api/dialog which is Tauri 1)
// Requires "dialog:allow-open" in src-tauri/capabilities/default.json (added in plan 01-01)
import { open } from '@/lib/dialog';
import { extensionsForFormats, isSupportedFile, detectFormat } from '@/lib/fileValidation';
import type { SupportedFormat } from '@/types/file';
import { t } from '@/i18n';

/** The dialog label for a tool that takes exactly one kind of file. */
function filterName(formats: readonly SupportedFormat[]): string {
  if (formats.length === 1 && formats[0] === 'pdf') return t('filter.pdfFiles');
  if (formats.length === 1 && formats[0] === 'image') return t('filter.imageFiles');
  if (formats.length === 1 && formats[0] === 'document') return t('filter.documentFiles');
  return t('filter.supportedFiles');
}

/**
 * The open dialog for a tool, showing only the files that tool can work on.
 *
 * `formats` is the tool's own `acceptsFormats`. Before it was a parameter this
 * offered every supported type to every tool, so Compress Image listed PDFs and
 * picking one silently started a PDF job -- the two compress tools share a flow
 * that branches on the file, not on the tool you opened.
 */
export async function openFilePicker(
  formats: readonly SupportedFormat[] = ['pdf', 'image'],
  multiple = false,
): Promise<string | string[] | null> {
  const result = await open({
    multiple,
    directory: false,
    filters: [{ name: filterName(formats), extensions: extensionsForFormats(formats) }],
  });

  // A filter is a hint, not a gate: every platform's dialog has some way to
  // reach a file it is not showing, so the returned paths are checked again.
  const keep = (p: unknown): p is string =>
    typeof p === 'string' && isSupportedFile(p) && (formats as readonly (string | null)[]).includes(detectFormat(p));

  if (multiple) {
    const picked = (Array.isArray(result) ? result : [result]).filter(keep);
    return picked.length > 0 ? picked : null;
  }
  return keep(result) ? result : null;
}
