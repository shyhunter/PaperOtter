// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { invoke } from '@tauri-apps/api/core';
import { useBatchProcessor } from '@/hooks/useBatchProcessor';

// ─── Batch processor hook (BATCH-05) ─────────────────────────────────────────
//
// Wraps runBatch in React state. Thin on purpose — the logic worth testing lives
// in runBatch — but the things that only go wrong once React is involved are
// pinned here: the outcome reaching the UI, and cancel actually stopping a run.

const output = (path: string) => ({
  fileName: `${path}-out`, bytes: new Uint8Array([1]),
  inputSizeBytes: 100, outputSizeBytes: 50,
});

describe('useBatchProcessor', () => {
  beforeEach(() => vi.mocked(invoke).mockClear());

  it('[BATCH-05a] starts idle', () => {
    const { result } = renderHook(() => useBatchProcessor());
    expect(result.current.isRunning).toBe(false);
    expect(result.current.result).toBeNull();
  });

  it('[BATCH-05b] reports the outcome when the run finishes', async () => {
    const { result } = renderHook(() => useBatchProcessor());

    await act(async () => {
      await result.current.run(['a.pdf', 'b.pdf'], async (p) => output(p));
    });

    expect(result.current.isRunning).toBe(false);
    expect(result.current.result?.succeeded).toHaveLength(2);
    expect(result.current.result?.failed).toHaveLength(0);
  });

  it('[BATCH-05c] processes in order and clears progress when done', async () => {
    const seen: string[] = [];
    const { result } = renderHook(() => useBatchProcessor());

    await act(async () => {
      await result.current.run(['a.pdf', 'b.pdf'], async (p) => {
        seen.push(p);
        return output(p);
      });
    });

    expect(seen).toEqual(['a.pdf', 'b.pdf']);
    // Cleared, so the summary is not competing with a stale "Processing 2 of 2".
    expect(result.current.progress).toBeNull();
  });

  it('[BATCH-05d] keeps failures rather than throwing out of run()', async () => {
    const { result } = renderHook(() => useBatchProcessor());

    await act(async () => {
      await result.current.run(['a.pdf', 'bad.pdf'], async (p) => {
        if (p === 'bad.pdf') throw new Error('broken');
        return output(p);
      });
    });

    expect(result.current.result?.succeeded).toHaveLength(1);
    expect(result.current.result?.failed).toEqual([{ path: 'bad.pdf', message: 'broken' }]);
  });

  it('[BATCH-05e] cancel stops the run and keeps what finished', async () => {
    const { result } = renderHook(() => useBatchProcessor());

    await act(async () => {
      await result.current.run(['a.pdf', 'b.pdf', 'c.pdf'], async (p) => {
        if (p === 'a.pdf') result.current.cancel();
        return output(p);
      });
    });

    await waitFor(() => expect(result.current.isRunning).toBe(false));
    expect(result.current.result?.cancelled).toBe(true);
    expect(result.current.result?.succeeded.length).toBeLessThan(3);
  });

  it('[BATCH-05f] reset clears the outcome so a second batch starts clean', async () => {
    const { result } = renderHook(() => useBatchProcessor());
    await act(async () => {
      await result.current.run(['a.pdf'], async (p) => output(p));
    });

    act(() => result.current.reset());

    expect(result.current.result).toBeNull();
    expect(result.current.progress).toBeNull();
  });

  it('[BATCH-05f] cancel kills the running Ghostscript, not just the queue', async () => {
    // runBatch only checks the abort signal *between* files, and BATCH-03g
    // guarantees strictly one at a time precisely so the Rust side can track a
    // single child process for cancellation. That guarantee is pointless unless
    // someone actually asks Rust to kill it.
    //
    // Without this, pressing Cancel on a twelve-file batch during file three
    // stops file four from starting and leaves Ghostscript compressing file
    // three to completion -- minutes of work on a document the user abandoned,
    // while the UI says the batch was cancelled. usePdfProcessor and
    // useImageProcessor both get this right; the batch hook was the one that
    // did not.
    const { result } = renderHook(() => useBatchProcessor());

    await act(async () => {
      await result.current.run(['a.pdf', 'b.pdf'], async (p) => {
        if (p === 'a.pdf') result.current.cancel();
        return output(p);
      });
    });

    expect(vi.mocked(invoke).mock.calls.map((c) => c[0])).toContain('cancel_processing');
  });
});
