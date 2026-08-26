import { describe, it, expect, vi } from 'vitest';
import { runBatch } from '@/lib/batchRunner';

// ─── Batch runner (BATCH-03) ─────────────────────────────────────────────────
//
// The persona has a stack, not a file: "compress all twelve scans for my visa
// application". The runner's whole job is the things that go wrong across twelve
// files rather than one — a bad file in the middle, a cancel halfway, and being
// able to say afterwards exactly what happened to each.

const ok = async (path: string) => ({ bytes: new Uint8Array([1]), name: path });

describe('runBatch', () => {
  it('[BATCH-03a] processes every file and returns a result per input, in order', async () => {
    const result = await runBatch(['a.pdf', 'b.pdf', 'c.pdf'], ok);

    expect(result.succeeded.map((s) => s.path)).toEqual(['a.pdf', 'b.pdf', 'c.pdf']);
    expect(result.failed).toEqual([]);
    expect(result.cancelled).toBe(false);
  });

  it('[BATCH-03b] one bad file does not abandon the rest', async () => {
    // The acceptance criterion that matters most: eleven good scans must not be
    // lost because the fourth one is corrupt.
    const process = vi.fn(async (path: string) => {
      if (path === 'b.pdf') throw new Error('This file is not a valid PDF');
      return ok(path);
    });

    const result = await runBatch(['a.pdf', 'b.pdf', 'c.pdf'], process);

    expect(result.succeeded.map((s) => s.path)).toEqual(['a.pdf', 'c.pdf']);
    expect(result.failed).toEqual([{ path: 'b.pdf', message: 'This file is not a valid PDF' }]);
    expect(process).toHaveBeenCalledTimes(3);
  });

  it('[BATCH-03c] keeps the reason each file failed, not just a count', async () => {
    const process = async (path: string) => { throw new Error(`no good: ${path}`); };
    const result = await runBatch(['a.pdf', 'b.pdf'], process);

    expect(result.failed).toEqual([
      { path: 'a.pdf', message: 'no good: a.pdf' },
      { path: 'b.pdf', message: 'no good: b.pdf' },
    ]);
    expect(result.succeeded).toEqual([]);
  });

  it('[BATCH-03d] survives a thrown non-Error without losing the batch', async () => {
    const process = async (path: string) => {
      if (path === 'b.pdf') throw 'just a string';
      return ok(path);
    };
    const result = await runBatch(['a.pdf', 'b.pdf', 'c.pdf'], process);

    expect(result.succeeded).toHaveLength(2);
    expect(result.failed[0].message).toContain('just a string');
  });

  it('[BATCH-03e] reports progress before each file, naming it', async () => {
    const onProgress = vi.fn();
    await runBatch(['a.pdf', 'b.pdf'], ok, { onProgress });

    expect(onProgress.mock.calls).toEqual([
      [{ index: 0, total: 2, path: 'a.pdf' }],
      [{ index: 1, total: 2, path: 'b.pdf' }],
    ]);
  });

  it('[BATCH-03f] stops early when cancelled, keeping what already succeeded', async () => {
    const controller = new AbortController();
    const process = vi.fn(async (path: string) => {
      if (path === 'b.pdf') controller.abort();
      return ok(path);
    });

    const result = await runBatch(['a.pdf', 'b.pdf', 'c.pdf'], process, {
      signal: controller.signal,
    });

    expect(process).toHaveBeenCalledTimes(2);          // c never starts
    expect(result.succeeded.map((s) => s.path)).toEqual(['a.pdf', 'b.pdf']);
    expect(result.cancelled).toBe(true);
  });

  it('[BATCH-03g] runs strictly one at a time', async () => {
    // PDF compression shells out to Ghostscript, and Rust tracks exactly one
    // child process for cancellation. Overlapping runs would make cancel kill
    // the wrong one and orphan the others.
    let inFlight = 0;
    let maxInFlight = 0;
    const process = async (path: string) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 1));
      inFlight--;
      return ok(path);
    };

    await runBatch(['a.pdf', 'b.pdf', 'c.pdf'], process);

    expect(maxInFlight).toBe(1);
  });

  it('[BATCH-03h] an empty batch is not an error', async () => {
    const result = await runBatch([], ok);
    expect(result.succeeded).toEqual([]);
    expect(result.failed).toEqual([]);
  });
});
