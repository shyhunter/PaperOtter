// Saving over the document a flow was opened with.
//
// Since PR #85, Save means the same file, changed — so this runs against the
// user's only copy. `tauri-plugin-fs`'s writeFile opens with O_TRUNC, which
// leaves the original at zero bytes from the moment the file opens until the
// last byte lands; a full disk or a crash inside that window destroys a scan
// and leaves nothing to recover it from. The `save_over_file` command writes a
// sibling temporary file and renames it over the target instead, so a failure
// leaves the original whole. See `atomic_replace` in src-tauri/src/lib.rs.
import { invoke } from '@tauri-apps/api/core';
import { t } from '@/i18n';

/**
 * What actually went wrong, as something the interface can act on.
 *
 * Tauri serialises a command's error to a plain string, so `err instanceof
 * Error` is false for every filesystem failure — which is why SaveStep used to
 * discard the reason and show one sentence about permissions whatever had
 * happened, including for a folder that no longer existed and for a save where
 * the user had selected no location at all.
 */
export type SaveFailure = 'readOnly' | 'gone' | 'diskFull' | 'unknown';

/** Write `bytes` over `path`, atomically. Rejects with a prefixed reason. */
export async function saveOverFile(path: string, bytes: Uint8Array): Promise<void> {
  // An IPC header is ASCII, and "Ödeme Planı.pdf" is an ordinary filename here.
  // The bytes travel as a raw body: a JSON array of 30 million numbers is not a
  // reasonable way to move a scan across the bridge.
  await invoke('save_over_file', bytes, { headers: { path: encodeURIComponent(path) } });
}

export function classifySaveFailure(err: unknown): SaveFailure {
  const raw = err instanceof Error ? err.message : String(err);
  if (raw.startsWith('READ_ONLY:')) return 'readOnly';
  // A missing folder and a missing file are one fact for the user: the document
  // is not where it was, and Save as… is the way out of both.
  if (raw.startsWith('TARGET_GONE:') || raw.startsWith('NO_DIR:')) return 'gone';
  if (raw.startsWith('DISK_FULL:')) return 'diskFull';
  return 'unknown';
}

/** The name the backend put after the prefix, or the fallback if there is none. */
function fileNameFrom(err: unknown, fallback: string): string {
  const raw = err instanceof Error ? err.message : String(err);
  const name = raw.slice(raw.indexOf(':') + 1).trim();
  return name.length > 0 && !name.includes(' ') ? name : fallback;
}

export function saveFailureMessage(err: unknown, fallbackName = ''): string {
  const name = fileNameFrom(err, fallbackName);
  switch (classifySaveFailure(err)) {
    case 'readOnly':
      return t('save.failedReadOnly', { name });
    case 'gone':
      return t('save.failedGone', { name });
    case 'diskFull':
      return t('save.failedDiskFull', { name });
    default:
      // Deliberately not the raw string: an OS message names a path the user
      // did not choose and an errno they cannot act on.
      return t('saveStep.couldNotWriteFileCheck');
  }
}
