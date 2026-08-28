// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { useFileDrop } from '@/hooks/useFileDrop';

// ─── DROP-SCOPE-04..05 — the drop seam asks for access before reading ────────
//
// A dragged-in file gets no fs-plugin scope grant from Tauri (see
// src/lib/dropScope.ts for why). The consumer of this hook reads the file the
// instant it is handed over, so the grant has to land first — otherwise the
// read races the permission and fails on exactly the files that needed it.

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

beforeEach(() => {
  handler = undefined;
  vi.mocked(getCurrentWebview).mockClear();
  vi.mocked(invoke).mockClear();
  vi.mocked(invoke).mockResolvedValue(undefined);
});

describe('useFileDrop filesystem scope', () => {
  it('[DROP-SCOPE-04] grants access to every dropped file', async () => {
    renderHook(() => useFileDrop(vi.fn()));
    await waitFor(() => expect(handler).toBeDefined());

    await drop(['/Volumes/USB/a.pdf', '/Volumes/USB/b.pdf']);

    expect(invoke).toHaveBeenCalledWith('allow_dropped_paths', {
      paths: ['/Volumes/USB/a.pdf', '/Volumes/USB/b.pdf'],
    });
  });

  it('[DROP-SCOPE-05] grants access before handing the file to the consumer', async () => {
    // Ordering is the whole point: the consumer reads immediately, so a grant
    // that lands afterwards is a grant that did nothing.
    const order: string[] = [];
    vi.mocked(invoke).mockImplementation(async () => { order.push('grant'); });
    const onDrop = vi.fn(() => { order.push('consume'); });

    renderHook(() => useFileDrop(onDrop));
    await waitFor(() => expect(handler).toBeDefined());

    await drop(['/Volumes/USB/scan.pdf']);
    await waitFor(() => expect(onDrop).toHaveBeenCalled());

    expect(order).toEqual(['grant', 'consume']);
  });

  it('[DROP-SCOPE-06] does not ask for a grant when nothing supported was dropped', async () => {
    renderHook(() => useFileDrop(vi.fn()));
    await waitFor(() => expect(handler).toBeDefined());

    await drop(['/Volumes/USB/notes.xyz']);

    expect(invoke).not.toHaveBeenCalledWith('allow_dropped_paths', expect.anything());
  });
});
