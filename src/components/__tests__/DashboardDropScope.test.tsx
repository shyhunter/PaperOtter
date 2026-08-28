// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act, waitFor } from '@testing-library/react';
import { invoke } from '@tauri-apps/api/core';
import { Dashboard } from '@/components/Dashboard';

// ─── DROP-SCOPE-07..08 — the dashboard drop seam grants access too ───────────
//
// The dashboard registers its own drag-drop listener, separate from the one in
// useFileDrop. It stages the file and hands it to a tool on the next click, so
// a missing grant surfaces one step later — as "failed to load PDF" on the
// tool's own first screen, which reads to the user as the file picker simply
// reappearing. That is the bug this pins.

type DropPayload = { type: string; paths?: string[] };
let dropHandler: ((event: { payload: DropPayload }) => void) | undefined;

vi.mock('@tauri-apps/api/webview', () => ({
  getCurrentWebview: vi.fn(() => ({
    onDragDropEvent: vi.fn((cb: (event: { payload: DropPayload }) => void) => {
      dropHandler = cb;
      return Promise.resolve(() => {});
    }),
  })),
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

vi.mock('@tauri-apps/plugin-store', () => ({
  LazyStore: class {
    get() { return Promise.resolve(null); }
    set() { return Promise.resolve(undefined); }
    save() { return Promise.resolve(undefined); }
  },
}));

const selectTool = vi.fn();
const setPendingFiles = vi.fn();
vi.mock('@/context/ToolContext', () => ({
  useToolContext: () => ({ selectTool, setPendingFiles }),
}));
vi.mock('@/hooks/useRecentDirs', () => ({ useRecentDirs: () => ({ dirs: [] }) }));
vi.mock('@/hooks/useFavourites', () => ({
  useFavourites: () => ({
    favourites: [], toggleFavorite: vi.fn(), reorderFavourites: vi.fn(), isFavorite: () => false,
  }),
}));
vi.mock('@/hooks/useDependencies', () => ({
  useDependencies: () => ({ isAvailable: () => true, getHint: () => '' }),
}));

const drop = async (paths: string[]) => {
  await act(async () => { dropHandler?.({ payload: { type: 'drop', paths } }); });
};

afterEach(cleanup);
beforeEach(() => {
  dropHandler = undefined;
  setPendingFiles.mockClear();
  vi.mocked(invoke).mockClear();
  vi.mocked(invoke).mockResolvedValue(undefined);
});

describe('Dashboard drop filesystem scope', () => {
  it('[DROP-SCOPE-07] grants access to a file dropped on the dashboard', async () => {
    render(<Dashboard />);
    await waitFor(() => expect(dropHandler).toBeDefined());

    await drop(['/Volumes/USB/scan.pdf']);

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('allow_dropped_paths', {
        paths: ['/Volumes/USB/scan.pdf'],
      });
    });
  });

  it('[DROP-SCOPE-08] grants access to every file of a dropped stack', async () => {
    // A twelve-scan visa application is the persona's real drop. Granting only
    // the first would fail eleven of them at the moment the batch runs.
    render(<Dashboard />);
    await waitFor(() => expect(dropHandler).toBeDefined());

    await drop(['/Volumes/USB/a.pdf', '/Volumes/USB/b.pdf', '/Volumes/USB/c.pdf']);

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('allow_dropped_paths', {
        paths: ['/Volumes/USB/a.pdf', '/Volumes/USB/b.pdf', '/Volumes/USB/c.pdf'],
      });
    });
  });
});
