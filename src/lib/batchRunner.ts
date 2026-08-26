/**
 * Runs one operation over a stack of files.
 *
 * The persona is dealing with a stack, not a file — "compress all twelve scans
 * for my visa application" — so everything here is about what goes wrong across
 * twelve files rather than one: a corrupt file in the middle must not cost the
 * other eleven, a cancel must keep what already finished, and afterwards the
 * user must be able to see what happened to each file rather than a count.
 *
 * Deliberately sequential. PDF compression shells out to Ghostscript, and the
 * Rust side tracks exactly one child process so it can cancel it; overlapping
 * runs would make cancel kill the wrong child and orphan the rest.
 */

export interface BatchProgress {
  /** Zero-based index of the file about to be processed. */
  index: number;
  total: number;
  /** Path of the file about to be processed, so the UI can name it. */
  path: string;
}

export interface BatchSuccess<T> {
  path: string;
  output: T;
}

export interface BatchFailure {
  path: string;
  message: string;
}

export interface BatchResult<T> {
  succeeded: BatchSuccess<T>[];
  failed: BatchFailure[];
  /** True when the run stopped early because it was cancelled. */
  cancelled: boolean;
}

export interface BatchOptions {
  onProgress?: (progress: BatchProgress) => void;
  signal?: AbortSignal;
}

export async function runBatch<T>(
  paths: string[],
  processOne: (path: string) => Promise<T>,
  options: BatchOptions = {},
): Promise<BatchResult<T>> {
  const { onProgress, signal } = options;
  const succeeded: BatchSuccess<T>[] = [];
  const failed: BatchFailure[] = [];

  for (const [index, path] of paths.entries()) {
    // Checked before starting each file rather than mid-flight: a half-written
    // output is worse than one that never began.
    if (signal?.aborted) {
      return { succeeded, failed, cancelled: true };
    }

    onProgress?.({ index, total: paths.length, path });

    try {
      succeeded.push({ path, output: await processOne(path) });
    } catch (err) {
      // Isolated on purpose. One unreadable scan must not cost the other eleven,
      // and the reason is kept per file so the summary can be specific.
      failed.push({ path, message: err instanceof Error ? err.message : String(err) });
    }
  }

  return { succeeded, failed, cancelled: signal?.aborted ?? false };
}
