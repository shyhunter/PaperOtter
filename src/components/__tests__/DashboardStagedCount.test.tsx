// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StrictMode } from 'react';
import { render, screen, cleanup, act, waitFor } from '@testing-library/react';
import { Dashboard } from '@/components/Dashboard';

// ─── BATCH-STAGE-01..03 — the staged card must account for every dropped file ─
//
// Dropping twelve scans stages all twelve, but the card only ever rendered the
// first filename. Everything downstream was correct — the batch really did run
// on all of them — yet the one thing the user could see said otherwise, so a
// twelve-file drop looked like an eleven-file loss.
//
// BAT-06's own pass condition is "the count matches what you dragged". This is
// the seam where that has to be visible.

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

vi.mock('@/context/ToolContext', () => ({
  useToolContext: () => ({ selectTool: vi.fn(), setPendingFiles: vi.fn() }),
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
beforeEach(() => { dropHandler = undefined; });

describe('Dashboard staged-file count', () => {
  it('[BATCH-STAGE-01] says how many files are staged when several were dropped', async () => {
    render(<StrictMode><Dashboard /></StrictMode>);
    await waitFor(() => expect(dropHandler).toBeDefined());

    await drop([
      '/in/scan-diploma.png',
      '/in/scan-passport.jpg',
      '/in/scan-payslip.jpg',
    ]);

    // The count is the thing that matters: without it a three-file drop is
    // indistinguishable from a one-file drop.
    expect(await screen.findByText(/3 files/i)).toBeInTheDocument();
  });

  it('[BATCH-STAGE-02] still names the file when only one was dropped', async () => {
    // A single drop must not gain a pointless "1 file" label.
    render(<StrictMode><Dashboard /></StrictMode>);
    await waitFor(() => expect(dropHandler).toBeDefined());

    await drop(['/in/scan-passport.jpg']);

    expect(await screen.findByText('scan-passport.jpg')).toBeInTheDocument();
    expect(screen.queryByText(/1 file\b/i)).not.toBeInTheDocument();
  });

  it('[BATCH-STAGE-03] still names the first file when several were dropped', async () => {
    // The count is added, not swapped in: the user should still recognise what
    // they dragged.
    render(<StrictMode><Dashboard /></StrictMode>);
    await waitFor(() => expect(dropHandler).toBeDefined());

    await drop(['/in/scan-diploma.png', '/in/scan-passport.jpg']);

    expect(await screen.findByText(/scan-diploma\.png/)).toBeInTheDocument();
  });
});
