// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { exists } from '@tauri-apps/plugin-fs';
import { useRecentDirs } from '@/hooks/useRecentDirs';

/**
 * [RECENT] A folder the app may not stat is not a folder that is gone.
 *
 * Reported as "Recent does not track my folders any more, I just see In". The
 * store on disk had five; the list showed one. The filter that trimmed it was
 *
 *     try { if (await exists(d)) valid.push(d); }
 *     catch { skip silently }
 *
 * and a throw there is `fs:allow-exists` refusing to look, not an answer about
 * the folder. The scope covers Documents, Downloads, Desktop and Temp, so of
 * five real folders only the one under Desktop survived, and the label of that
 * survivor was the word the report is named after.
 *
 * Worth its own note: `$DESKTOP/**` matches the children of Desktop and not
 * Desktop itself, so the single most likely folder anyone uses also failed.
 *
 * Keeping a refused entry is safe. It is only ever the starting folder for the
 * file dialog, which is an OS window the scope does not bind, and whatever is
 * chosen there is granted by the dialog plugin.
 */

const store = { get: vi.fn(), set: vi.fn(), save: vi.fn() };
vi.mock('@tauri-apps/plugin-store', () => ({
  LazyStore: class {
    get(...a: unknown[]) { return store.get(...a); }
    set(...a: unknown[]) { return store.set(...a); }
    save() { return store.save(); }
  },
}));

/** The five that were actually on disk when this was reported. */
const REPORTED = [
  '/Users/x/Library/Mobile Documents/com~apple~CloudDocs/Testing Folder',
  '/Users/x/qa',
  '/Users/x/Library/Mobile Documents/com~apple~CloudDocs',
  '/Users/x/Desktop/papercut-bat06/in',
  '/Users/x/Desktop',
];

/** What the real capability does: answer inside the scope, throw outside it. */
function scopedExists(insideScope: (p: string) => boolean) {
  return vi.mocked(exists).mockImplementation(async (p) => {
    const path = String(p);
    if (!insideScope(path)) throw new Error(`forbidden path: ${path}`);
    return true;
  });
}

beforeEach(() => {
  store.get.mockReset().mockResolvedValue(REPORTED);
  store.set.mockReset().mockResolvedValue(undefined);
  store.save.mockReset().mockResolvedValue(undefined);
  vi.mocked(exists).mockReset();
});

describe('useRecentDirs', () => {
  it('[RECENT-01] keeps every folder the scope refuses to look at', async () => {
    // Only children of Desktop are inside fs:allow-exists, exactly as shipped.
    scopedExists((p) => p.startsWith('/Users/x/Desktop/'));

    const { result } = renderHook(() => useRecentDirs());
    await waitFor(() => expect(result.current.dirs.length).toBeGreaterThan(0));

    expect(result.current.dirs, 'all five should survive').toEqual(REPORTED);
  });

  it('[RECENT-02] reproduces the reported symptom when a refusal is read as absence', async () => {
    // The old behaviour, written out so the bug cannot be re-argued: this is
    // what "I just see In" was.
    scopedExists((p) => p.startsWith('/Users/x/Desktop/'));

    const surviving: string[] = [];
    for (const d of REPORTED) {
      try { if (await exists(d)) surviving.push(d); } catch { /* dropped */ }
    }

    expect(surviving).toEqual(['/Users/x/Desktop/papercut-bat06/in']);
    expect(surviving[0].split('/').pop()).toBe('in');
  });

  it('[RECENT-03] still drops a folder that is genuinely gone', async () => {
    // A clean false is an answer, and it means removed. This is the only thing
    // that should shorten the list.
    vi.mocked(exists).mockImplementation(async (p) => String(p) !== '/Users/x/qa');

    const { result } = renderHook(() => useRecentDirs());
    await waitFor(() => expect(result.current.dirs.length).toBe(REPORTED.length - 1));
    expect(result.current.dirs).not.toContain('/Users/x/qa');
  });

  it('[RECENT-04] Desktop itself survives, though $DESKTOP/** does not match it', async () => {
    // The trailing-slash detail that made the most common folder disappear.
    scopedExists((p) => p.startsWith('/Users/x/Desktop/'));

    const { result } = renderHook(() => useRecentDirs());
    await waitFor(() => expect(result.current.dirs.length).toBeGreaterThan(0));
    expect(result.current.dirs).toContain('/Users/x/Desktop');
  });

  it('[RECENT-05] records a new folder ahead of the rest, without duplicating it', async () => {
    vi.mocked(exists).mockResolvedValue(true);
    const { result } = renderHook(() => useRecentDirs());
    await waitFor(() => expect(result.current.dirs.length).toBe(REPORTED.length));

    await act(async () => {
      await result.current.addDir('/Users/x/Desktop/papercut-bat06/in/report.pdf');
    });

    expect(result.current.dirs[0]).toBe('/Users/x/Desktop/papercut-bat06/in');
    expect(
      result.current.dirs.filter((d) => d === '/Users/x/Desktop/papercut-bat06/in'),
      'the folder is promoted, not added twice',
    ).toHaveLength(1);
  });

  it('[RECENT-06] takes the folder from a Windows path too', async () => {
    vi.mocked(exists).mockResolvedValue(true);
    store.get.mockResolvedValue([]);
    const { result } = renderHook(() => useRecentDirs());
    await waitFor(() => expect(result.current.dirs).toEqual([]));

    await act(async () => {
      await result.current.addDir('C:\\Users\\you\\Desktop\\report.pdf');
    });

    expect(result.current.dirs[0]).toBe('C:/Users/you/Desktop');
  });
});
