// React hook wrapping processPdf with progress, loading, error, and cancellation state.
// Processing is triggered explicitly via run() — not on option change (pdf-lib is slow on large files).
import { useState, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { processPdf } from '@/lib/pdfProcessor';
import type { PdfProcessingOptions, PdfProcessingResult } from '@/types/file';

export interface PdfProcessorState {
  isProcessing: boolean;
  progress: { current: number; total: number } | null;
  result: PdfProcessingResult | null;
  error: string | null;
  isCancelled: boolean;
}

export interface UsePdfProcessorReturn extends PdfProcessorState {
  run: (sourcePath: string, options: Omit<PdfProcessingOptions, 'onProgress'>) => Promise<void>;
  cancel: () => void;
  reset: () => void;
}

const INITIAL_STATE: PdfProcessorState = {
  isProcessing: false,
  progress: null,
  result: null,
  error: null,
  isCancelled: false,
};

export function usePdfProcessor(): UsePdfProcessorReturn {
  const [state, setState] = useState<PdfProcessorState>(INITIAL_STATE);
  // Tracks whether cancel() was called so we can distinguish CANCELLED from real errors
  const cancelledRef = useRef(false);

  const run = useCallback(async (
    sourcePath: string,
    options: Omit<PdfProcessingOptions, 'onProgress'>,
  ): Promise<void> => {
    cancelledRef.current = false;
    setState({ isProcessing: true, progress: null, result: null, error: null, isCancelled: false });

    try {
      const result = await processPdf(sourcePath, {
        ...options,
        onProgress: (current, total) => {
          setState((prev) => ({ ...prev, progress: { current, total } }));
        },
      });

      setState({ isProcessing: false, progress: null, result, error: null, isCancelled: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('CANCELLED')) {
        // Normal cancellation — not a user-visible error
        setState({ isProcessing: false, progress: null, result: null, error: null, isCancelled: true });
      } else {
        setState({ isProcessing: false, progress: null, result: null, error: message, isCancelled: false });
      }
    }
  }, []);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    // Fire-and-forget — do not await; the run() catch branch handles the CANCELLED error
    void invoke('cancel_processing');
  }, []);

  const reset = useCallback(() => {
    cancelledRef.current = false;
    setState(INITIAL_STATE);
  }, []);

  return { ...state, run, cancel, reset };
}
