import { invoke } from '@tauri-apps/api/core';

/**
 * Grants filesystem access to files the user dragged onto the window.
 *
 * Tauri treats the two ways a file enters the app differently. A file chosen
 * through a dialog is granted in the fs plugin's runtime scope by
 * tauri-plugin-dialog. A file that is dragged in is not: tauri core widens
 * `tauri::scope::Scopes`, which carries the asset protocol alone and is not
 * what tauri-plugin-fs consults when it resolves a path.
 *
 * So without this call a dropped file outside the capability roots in
 * `src-tauri/capabilities/default.json` cannot be read at all — and the app
 * reported that as a corrupt document rather than as a permission problem.
 *
 * Granting per dropped path rather than widening the capability to `$HOME/**`
 * keeps the app's reach honest: it can read the files this person handed it,
 * and nothing else.
 */
export async function grantDroppedPaths(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  try {
    await invoke('allow_dropped_paths', { paths });
  } catch {
    // Not fatal. Files under the static capability roots read without a grant,
    // and one that truly cannot be granted fails at read time with a permission
    // message the user can act on — which is more use than a toast here.
  }
}
