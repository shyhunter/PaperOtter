import { useCallback, useRef, useState } from 'react';
import { runBatch, type BatchProgress, type BatchResult } from '@/lib/batchRunner';

/** What one file in a batch produces: bytes to write, plus what to report. */
export interface BatchFileOutput {
  fileName: string;
  bytes: Uint8Array;
  inputSizeBytes: number;
  outputSizeBytes: number;
}

export interface UseBatchProcessorReturn {
  isRunning: boolean;
  progress: BatchProgress | null;
  result: BatchResult<BatchFileOutput> | null;
  run: (paths: string[], processOne: (path: string) => Promise<BatchFileOutput>) => Promise<void>;
  cancel: () => void;
  reset: () => void;
}

/**
 * React state around runBatch. Thin on purpose — the behaviour worth testing
 * lives in runBatch itself — but it owns the AbortController so that cancelling
 * stops the loop between files rather than only killing the current subprocess.
 */
export function useBatchProcessor(): UseBatchProcessorReturn {
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState<BatchProgress | null>(null);
  const [result, setResult] = useState<BatchResult<BatchFileOutput> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const run = useCallback(async (
    paths: string[],
    processOne: (path: string) => Promise<BatchFileOutput>,
  ) => {
    const controller = new AbortController();
    abortRef.current = controller;
    setIsRunning(true);
    setResult(null);

    const outcome = await runBatch(paths, processOne, {
      signal: controller.signal,
      onProgress: setProgress,
    });

    // Cleared before the outcome lands so the summary is not competing with a
    // stale "Processing 12 of 12".
    setProgress(null);
    setResult(outcome);
    setIsRunning(false);
    abortRef.current = null;
  }, []);

  const cancel = useCallback(() => abortRef.current?.abort(), []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsRunning(false);
    setProgress(null);
    setResult(null);
  }, []);

  return { isRunning, progress, result, run, cancel, reset };
}
