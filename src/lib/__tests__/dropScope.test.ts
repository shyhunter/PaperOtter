// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { grantDroppedPaths } from '@/lib/dropScope';

// ─── DROP-SCOPE-01..03 — filesystem access for dragged-in files ──────────────
//
// Tauri's dialog plugin widens the fs plugin's runtime scope for every file the
// user picks through a dialog (tauri-plugin-dialog commands.rs — allow_file /
// allow_directory on try_fs_scope). Drag-and-drop does not: tauri core only
// calls scopes.allow_file on `tauri::scope::Scopes`, which holds the asset
// protocol and nothing tauri-plugin-fs consults when resolving a path.
//
// The consequence shipped: a file dragged from anywhere outside the four
// capability roots ($DESKTOP/$DOCUMENT/$DOWNLOAD/$TEMP) could not be read, and
// the app told the user their document was corrupt.
//
// No automated test can exercise the real scope — there is no Tauri runtime
// here. What these pin is the seam: the app asks for the grant, for the right
// paths, before anything tries to read them.

beforeEach(() => {
  vi.mocked(invoke).mockClear();
  vi.mocked(invoke).mockResolvedValue(undefined);
});

describe('grantDroppedPaths', () => {
  it('[DROP-SCOPE-01] asks the backend to grant every dropped path', async () => {
    await grantDroppedPaths(['/Volumes/USB/scan.pdf', '/Users/me/elsewhere/id.jpg']);

    expect(invoke).toHaveBeenCalledWith('allow_dropped_paths', {
      paths: ['/Volumes/USB/scan.pdf', '/Users/me/elsewhere/id.jpg'],
    });
  });

  it('[DROP-SCOPE-02] does not call the backend when nothing was dropped', async () => {
    await grantDroppedPaths([]);

    expect(invoke).not.toHaveBeenCalled();
  });

  it('[DROP-SCOPE-03] resolves even when the grant fails, so an in-scope drop still works', async () => {
    // A failed grant is not fatal: files under the static capability roots read
    // fine without it, and a file that genuinely cannot be granted will produce
    // an honest permission error at read time (see friendlyPdfError).
    vi.mocked(invoke).mockRejectedValue(new Error('command not found'));

    await expect(grantDroppedPaths(['/Volumes/USB/scan.pdf'])).resolves.toBeUndefined();
  });
});
