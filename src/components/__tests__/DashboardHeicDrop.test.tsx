// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { toast } from 'sonner';
import { Dashboard } from '@/components/Dashboard';
import * as fileValidation from '@/lib/fileValidation';

// ─── Dashboard HEIC drop (IMG-HEIC-06) ───────────────────────────────────────
//
// The dashboard has its own drag-drop listener, separate from the one behind
// App's handleFileSelected. Dropping an iPhone photo here is the persona's most
// likely first action, so the platform limit has to be reported at this seam too
// rather than one tool-click later.

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
vi.mock('@/hooks/useFavorites', () => ({
  useFavorites: () => ({
    favorites: [], toggleFavorite: vi.fn(), reorderFavorites: vi.fn(), isFavorite: () => false,
  }),
}));
vi.mock('@/hooks/useDependencies', () => ({
  useDependencies: () => ({ isAvailable: () => true, getHint: () => '' }),
}));
vi.mock('@/lib/fileValidation', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/fileValidation')>();
  return { ...original, isHeicDecodable: vi.fn().mockReturnValue(true) };
});

const drop = async (path: string) => {
  await act(async () => { dropHandler?.({ payload: { type: 'drop', paths: [path] } }); });
};

afterEach(cleanup);
beforeEach(() => {
  dropHandler = undefined;
  vi.mocked(toast.error).mockClear();
  setPendingFiles.mockClear();
  vi.mocked(fileValidation.isHeicDecodable).mockReturnValue(true);
});

describe('Dashboard HEIC drop', () => {
  it('[IMG-HEIC-06a] stages a HEIC photo on a build that can decode it', async () => {
    render(<Dashboard />);
    await act(async () => {});
    await drop('/Users/me/IMG_4032.heic');

    expect(toast.error).not.toHaveBeenCalled();
  });

  it('[IMG-HEIC-06b] explains the platform limit instead of silently ignoring the drop', async () => {
    vi.mocked(fileValidation.isHeicDecodable).mockReturnValue(false);
    render(<Dashboard />);
    await act(async () => {});
    await drop('/Users/me/IMG_4032.heic');

    expect(toast.error).toHaveBeenCalledWith(
      expect.stringMatching(/only be opened on macOS/i),
    );
  });

  it('[IMG-HEIC-06c] leaves other images alone on a build without a HEIC decoder', async () => {
    vi.mocked(fileValidation.isHeicDecodable).mockReturnValue(false);
    render(<Dashboard />);
    await act(async () => {});
    await drop('/Users/me/photo.jpg');

    expect(toast.error).not.toHaveBeenCalled();
  });
});
