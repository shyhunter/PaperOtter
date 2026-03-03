// React hook for PDF split processing — follows the same pattern as usePdfProcessor.
import { useState, useCallback } from 'react';
import { splitPdf } from '@/lib/pdfSplit';
import type { SplitMode, SplitResult } from '@/lib/pdfSplit';

export interface UseSplitPdfProcessorReturn {
  isProcessing: boolean;
  result: SplitResult | null;
  error: string | null;
  split: (pdfBytes: Uint8Array, sourceFileName: string, mode: SplitMode) => Promise<void>;
  reset: () => void;
}

export function useSplitPdfProcessor(): UseSplitPdfProcessorReturn {
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<SplitResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const split = useCallback(async (pdfBytes: Uint8Array, sourceFileName: string, mode: SplitMode) => {
    setIsProcessing(true);
    setResult(null);
    setError(null);

    try {
      const splitResult = await splitPdf(pdfBytes, sourceFileName, mode);
      setResult(splitResult);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setIsProcessing(false);
    }
  }, []);

  const reset = useCallback(() => {
    setIsProcessing(false);
    setResult(null);
    setError(null);
  }, []);

  return { isProcessing, result, error, split, reset };
}
