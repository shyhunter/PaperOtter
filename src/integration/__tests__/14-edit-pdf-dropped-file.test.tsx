// @vitest-environment jsdom
/**
 * Suite 14 — Edit PDF must use the file you already dropped
 *
 * Covers: PENDING-01, PENDING-02
 *
 * AppContent intercepts `activeTool === 'edit-pdf'` and opens the native file
 * picker before EditPdfFlow ever renders, so the dropped file is never even
 * looked at. Every existing test misses this: EditPdfFlow.test.tsx renders the
 * flow component directly, which bypasses the interception entirely.
 *
 * NOTE: No fake timers — user-event v14 deadlocks with fake timers active.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, act, waitFor } from '@testing-library/react';
import { open } from '@tauri-apps/plugin-dialog';
import App from '@/App';

vi.mock('@tauri-apps/plugin-store', () => ({
  LazyStore: class {
    get() { return Promise.resolve(null); }
    set() { return Promise.resolve(undefined); }
    save() { return Promise.resolve(undefined); }
  },
}));
vi.mock('@/hooks/useDependencies', () => ({
  useDependencies: () => ({
    available: { ghostscript: true, calibre: true, libreoffice: true },
    loading: false,
    getHint: () => '',
    isAvailable: () => true,
  }),
}));
vi.mock('@/hooks/useFileOpen', () => ({ openFilePicker: vi.fn() }));
vi.mock('@/lib/pdfThumbnail', () => ({
  renderAllPdfPages: vi.fn().mockResolvedValue([]),
  renderPdfThumbnail: vi.fn().mockResolvedValue('blob:preview'),
}));

// The editor itself is heavy (canvas, pdf.js). What matters here is only which
// file it is asked to open.
const editorOpenedWith = vi.fn();
vi.mock('@/components/pdf-editor/EditorView', () => ({
  EditorView: vi.fn(({ filePath }: { filePath: string }) => {
    editorOpenedWith(filePath);
    return <div data-testid="editor-view">{filePath}</div>;
  }),
}));

// Capture the dashboard's drag-drop listener so a drop can be simulated.
type DropPayload = { type: string; paths?: string[] };
const dropHandlers: Array<(e: { payload: DropPayload }) => void> = [];
vi.mock('@tauri-apps/api/webview', () => ({
  getCurrentWebview: vi.fn(() => ({
    onDragDropEvent: vi.fn((cb: (e: { payload: DropPayload }) => void) => {
      dropHandlers.push(cb);
      return Promise.resolve(() => {});
    }),
  })),
}));

const DROPPED = '/Users/me/Desktop/scan.pdf';

const dropOnDashboard = async (paths: string[]) => {
  await act(async () => {
    for (const cb of dropHandlers) cb({ payload: { type: 'drop', paths } });
  });
};

afterEach(cleanup);
beforeEach(() => {
  dropHandlers.length = 0;
  editorOpenedWith.mockClear();
  vi.mocked(open).mockClear();
  vi.mocked(open).mockResolvedValue(null);
});

describe('Suite 14 — Edit PDF with a dropped file', () => {
  it('[PENDING-01] opens the dropped file without asking for one again', async () => {
    render(<App />);
    await waitFor(() => expect(dropHandlers.length).toBeGreaterThan(0));

    await dropOnDashboard([DROPPED]);

    const editCard = await screen.findByText(/edit pdf/i);
    await act(async () => { editCard.click(); });

    // The whole complaint: "I already dragged this file in, so use it."
    await waitFor(() => expect(editorOpenedWith).toHaveBeenCalledWith(DROPPED));
    expect(open).not.toHaveBeenCalled();
  });

  it('[PENDING-02] still shows the picker when Edit PDF is opened with nothing dropped', async () => {
    // The interception exists for a reason — going straight to the tool from a
    // cold dashboard must still let the user choose a file.
    render(<App />);
    await waitFor(() => expect(dropHandlers.length).toBeGreaterThan(0));

    const editCard = await screen.findByText(/edit pdf/i);
    await act(async () => { editCard.click(); });

    await waitFor(() => expect(open).toHaveBeenCalled());
  });
});
