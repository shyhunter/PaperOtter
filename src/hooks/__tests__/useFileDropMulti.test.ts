// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { useFileDrop } from '@/hooks/useFileDrop';

// ─── Multi-file drop (BATCH-06) ──────────────────────────────────────────────
//
// The persona drags a stack, not a file. Today the drop handler requires exactly
// one path and silently rejects anything else, so dropping twelve scans does
// nothing at all — the very action F11 exists to support.

type DropPayload = { type: string; paths?: string[] };
let handler: ((e: { payload: DropPayload }) => void) | undefined;

vi.mock('@tauri-apps/api/webview', () => ({
  getCurrentWebview: vi.fn(() => ({
    onDragDropEvent: vi.fn((cb: (e: { payload: DropPayload }) => void) => {
      handler = cb;
      return Promise.resolve(() => {});
    }),
  })),
}));

const drop = async (paths: string[]) => {
  await act(async () => { handler?.({ payload: { type: 'drop', paths } }); });
};

beforeEach(() => { handler = undefined; vi.mocked(getCurrentWebview).mockClear(); });

describe('useFileDrop with several files', () => {
  it('[BATCH-06a] passes every supported file, first one first', async () => {
    const onDrop = vi.fn();
    renderHook(() => useFileDrop(onDrop));
    await waitFor(() => expect(handler).toBeDefined());

    await drop(['/s/a.pdf', '/s/b.pdf', '/s/c.pdf']);

    expect(onDrop).toHaveBeenCalledWith('/s/a.pdf', ['/s/b.pdf', '/s/c.pdf']);
  });

  it('[BATCH-06b] still works for a single file, with no extras', async () => {
    const onDrop = vi.fn();
    renderHook(() => useFileDrop(onDrop));
    await waitFor(() => expect(handler).toBeDefined());

    await drop(['/s/only.pdf']);

    expect(onDrop).toHaveBeenCalledWith('/s/only.pdf', []);
  });

  it('[BATCH-06c] ignores unsupported files rather than failing the whole drop', async () => {
    // Dropping a folder full of scans can easily include a stray .DS_Store.
    const onDrop = vi.fn();
    renderHook(() => useFileDrop(onDrop));
    await waitFor(() => expect(handler).toBeDefined());

    await drop(['/s/a.pdf', '/s/notes.xyz', '/s/b.pdf']);

    expect(onDrop).toHaveBeenCalledWith('/s/a.pdf', ['/s/b.pdf']);
  });

  it('[BATCH-06d] signals an invalid drop when nothing is supported', async () => {
    const onDrop = vi.fn();
    renderHook(() => useFileDrop(onDrop));
    await waitFor(() => expect(handler).toBeDefined());

    await drop(['/s/notes.xyz']);

    expect(onDrop).toHaveBeenCalledWith('', []);
  });

  it('[BATCH-06e] shows a valid drag state while several files are over the window', async () => {
    const { result } = renderHook(() => useFileDrop(vi.fn()));
    await waitFor(() => expect(handler).toBeDefined());

    await act(async () => {
      handler?.({ payload: { type: 'enter', paths: ['/s/a.pdf', '/s/b.pdf'] } });
    });

    expect(result.current).toBe('over-valid');
  });
});
