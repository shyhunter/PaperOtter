// @vitest-environment jsdom
/**
 * Suite 10 — Tool switching without a remount
 *
 * Covers: TS-01, TS-02
 *
 * ToolFlow is rendered as `{showToolFlow && <ToolFlow />}` with no `key`, so
 * switching activeTool does NOT remount it. The dedicated tool flows and the
 * compress flow used to live in one component with the compress path's hooks
 * declared below the dedicated flows' early returns — so a switch between the
 * two changed the number of hooks React saw and it threw "Rendered more hooks
 * than during the previous render", which the AppErrorBoundary caught and
 * turned into the crash panel.
 *
 * The editor sidebar's "papercut:open-tool" event is a real path that switches
 * tools directly, without passing through the dashboard.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, act, cleanup } from '@testing-library/react';
import App from '@/App';

vi.mock('@tauri-apps/api/webview', () => ({
  getCurrentWebview: vi.fn(() => ({
    onDragDropEvent: vi.fn(() => Promise.resolve(() => {})),
  })),
}));

vi.mock('@tauri-apps/plugin-store', () => ({
  LazyStore: class {
    get() { return Promise.resolve(null); }
    set() { return Promise.resolve(undefined); }
    save() { return Promise.resolve(undefined); }
  },
}));

vi.mock('@/hooks/useFileOpen', () => ({ openFilePicker: vi.fn() }));
vi.mock('@/lib/pdfThumbnail', () => ({ renderAllPdfPages: vi.fn().mockResolvedValue([]) }));
vi.mock('@/lib/imageProcessor', () => ({ processImage: vi.fn() }));
vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: vi.fn() }));

afterEach(cleanup);

/** Switches tools the way the editor sidebar does — no dashboard round-trip. */
async function openTool(toolId: string) {
  await act(async () => {
    window.dispatchEvent(new CustomEvent('papercut:open-tool', { detail: toolId }));
    await Promise.resolve();
  });
}

describe('Tool switching without a remount', () => {
  it('TS-01: switching from a dedicated flow to the compress flow does not crash', async () => {
    render(<App />);

    await openTool('merge-pdf');
    await openTool('compress-pdf');

    // The boundary's crash panel is what a hook-order violation surfaces as.
    expect(screen.queryByText(/Something went wrong/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /send crash report/i })).toBeNull();
  });

  it('TS-02: switching between two dedicated flows does not crash', async () => {
    render(<App />);

    await openTool('merge-pdf');
    await openTool('split-pdf');
    await openTool('watermark');

    expect(screen.queryByText(/Something went wrong/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /send crash report/i })).toBeNull();
  });
});
