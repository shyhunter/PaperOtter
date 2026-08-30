// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import { Dashboard } from '@/components/Dashboard';

// ─── [PGATE-03] The dashboard hides what this platform cannot run ────────────
//
// The regression this guards: `ocr-pdf` shipped with no platform requirement,
// so Make Searchable rendered a card on Windows and Linux where macOS Vision
// does not exist. Clicking it reached an engine that was never there.
//
// Hidden, not greyed. `requiresDependency` disables a tool with an install hint
// because installing Ghostscript is something a user can actually do; Vision is
// not installable on Windows, so a disabled card would advertise the
// unattainable.

vi.mock('@tauri-apps/api/webview', () => ({
  getCurrentWebview: vi.fn(() => ({
    onDragDropEvent: vi.fn(() => Promise.resolve(() => {})),
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

function setPlatform(userAgent: string) {
  Object.defineProperty(window.navigator, 'userAgent', { value: userAgent, configurable: true });
}
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)';
const WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)';
const LINUX = 'Mozilla/5.0 (X11; Linux x86_64)';

/** The Make Searchable card, found by its tool name. */
const ocrCards = () => screen.queryAllByText(/make searchable/i);

afterEach(cleanup);

describe('dashboard platform gate', () => {
  it('[PGATE-03a] offers Make Searchable on macOS', async () => {
    setPlatform(MAC);
    render(<Dashboard />);
    await act(async () => {});
    expect(ocrCards().length).toBeGreaterThan(0);
  });

  it('[PGATE-03b] hides Make Searchable on Windows', async () => {
    setPlatform(WINDOWS);
    render(<Dashboard />);
    await act(async () => {});
    expect(ocrCards()).toHaveLength(0);
  });

  it('[PGATE-03c] hides Make Searchable on Linux', async () => {
    setPlatform(LINUX);
    render(<Dashboard />);
    await act(async () => {});
    expect(ocrCards()).toHaveLength(0);
  });

  it('[PGATE-03d] hides it rather than disabling it', async () => {
    // A disabled card would still be in the document. Absence is the assertion:
    // nothing to click, nothing to explain, nothing to install.
    setPlatform(WINDOWS);
    render(<Dashboard />);
    await act(async () => {});
    expect(screen.queryByRole('button', { name: /make searchable/i })).toBeNull();
  });

  it('[PGATE-03e] leaves every other tool alone off macOS', async () => {
    // The gate must remove exactly one card, not quietly thin the dashboard.
    // Counted by card heading rather than by button: each ToolCard renders its
    // name in an <h3> plus a separate favourite-toggle button, so counting
    // buttons double-counts every card.
    setPlatform(MAC);
    const { unmount } = render(<Dashboard />);
    await act(async () => {});
    const onMac = screen.getAllByRole('heading', { level: 3 }).length;
    expect(onMac, 'sanity: the dashboard rendered a plausible number of tools')
      .toBeGreaterThan(15);
    unmount();

    setPlatform(WINDOWS);
    render(<Dashboard />);
    await act(async () => {});
    expect(screen.getAllByRole('heading', { level: 3 }).length).toBe(onMac - 1);
  });
});
