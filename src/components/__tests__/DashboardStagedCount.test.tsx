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

// ─── BATCH-STAGE-04..07 — a second drop adds to the first ────────────────────
//
// Reported from a real build, on macOS and Ubuntu alike: drag one file in, then
// drag a second, and only the second is staged. The first is gone, with nothing
// said about it.
//
// `setStagedFile` replaced the whole staged object, so every drop discarded
// whatever was already there. That is precisely the gathering flow Merge and
// JPG-to-PDF exist for — files come from different folders, or a multi-select is
// fiddly, so people drop them one at a time. The card even counts them, which
// made the loss look like a counting bug rather than a discard.
describe('Dashboard staged files accumulate across drops', () => {
  it('[BATCH-STAGE-04] a second drop of the same type adds to the first', async () => {
    render(<StrictMode><Dashboard /></StrictMode>);
    await waitFor(() => expect(dropHandler).toBeDefined());

    await drop(['/qa/a.pdf']);
    await drop(['/qa/b.pdf']);

    // Both, and the first one's name still leads: it is the one the user
    // started from, and re-ordering under them would be its own surprise.
    expect(await screen.findByText(/2 files/i)).toBeInTheDocument();
    expect(screen.getByText(/a\.pdf/)).toBeInTheDocument();
  });

  it('[BATCH-STAGE-05] the same file dropped twice is staged once', async () => {
    // A duplicate in a merge is silent and almost never intended; the merge step
    // is where someone would deliberately repeat a document.
    render(<StrictMode><Dashboard /></StrictMode>);
    await waitFor(() => expect(dropHandler).toBeDefined());

    await drop(['/qa/a.pdf']);
    await drop(['/qa/a.pdf']);

    expect(screen.queryByText(/2 files/i)).toBeNull();
    expect(screen.getByText(/a\.pdf/)).toBeInTheDocument();
  });

  it('[BATCH-STAGE-06] dropping a different type replaces, rather than mixing', async () => {
    // A JPEG cannot be merged into a set of PDFs, and a batch of mixed types has
    // no single operation. Replacing honours the drop; the toast is what keeps
    // it from being another silent discard.
    render(<StrictMode><Dashboard /></StrictMode>);
    await waitFor(() => expect(dropHandler).toBeDefined());

    await drop(['/qa/a.pdf', '/qa/b.pdf']);
    await drop(['/qa/photo.jpg']);

    expect(screen.getByText(/photo\.jpg/)).toBeInTheDocument();
    expect(screen.queryByText(/a\.pdf/), 'the PDFs are gone, so they must not still be counted').toBeNull();
  });

  it('[BATCH-STAGE-07] accumulating several drops keeps every one of them', async () => {
    render(<StrictMode><Dashboard /></StrictMode>);
    await waitFor(() => expect(dropHandler).toBeDefined());

    await drop(['/qa/a.pdf']);
    await drop(['/qa/b.pdf', '/qa/c.pdf']);
    await drop(['/qa/d.pdf']);

    expect(await screen.findByText(/4 files/i)).toBeInTheDocument();
  });
});
