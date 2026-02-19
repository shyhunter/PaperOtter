// React hook wrapping processPdf with progress, loading, and error state.
// Processing is triggered explicitly via run() — not on option change (pdf-lib is slow on large files).
import { useState, useCallback } from 'react';
import { processPdf } from '@/lib/pdfProcessor';
import type { PdfProcessingOptions, PdfProcessingResult } from '@/types/file';

export interface PdfProcessorState {
  isProcessing: boolean;
  progress: { current: number; total: number } | null;
  result: PdfProcessingResult | null;
  error: string | null;
}

export interface UsePdfProcessorReturn extends PdfProcessorState {
  run: (sourcePath: string, options: Omit<PdfProcessingOptions, 'onProgress'>) => Promise<void>;
  reset: () => void;
}

const INITIAL_STATE: PdfProcessorState = {
  isProcessing: false,
  progress: null,
  result: null,
  error: null,
};

export function usePdfProcessor(): UsePdfProcessorReturn {
  const [state, setState] = useState<PdfProcessorState>(INITIAL_STATE);

  const run = useCallback(async (
    sourcePath: string,
    options: Omit<PdfProcessingOptions, 'onProgress'>,
  ): Promise<void> => {
    setState({ isProcessing: true, progress: null, result: null, error: null });

    try {
      const result = await processPdf(sourcePath, {
        ...options,
        onProgress: (current, total) => {
          setState((prev) => ({ ...prev, progress: { current, total } }));
        },
      });

      setState({ isProcessing: false, progress: null, result, error: null });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Processing failed. The file may be corrupted or password-protected.';
      setState({ isProcessing: false, progress: null, result: null, error: message });
    }
  }, []);

  const reset = useCallback(() => {
    setState(INITIAL_STATE);
  }, []);

  return { ...state, run, reset };
}
