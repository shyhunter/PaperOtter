// React hook for PDF merge processing — follows the same pattern as usePdfProcessor.
import { useState, useCallback } from 'react';
import { mergePdfs } from '@/lib/pdfMerge';
import type { MergeInput, MergeResult } from '@/lib/pdfMerge';

export interface UseMergePdfProcessorReturn {
  isProcessing: boolean;
  result: MergeResult | null;
  error: string | null;
  merge: (inputs: MergeInput[]) => Promise<void>;
  reset: () => void;
}

export function useMergePdfProcessor(): UseMergePdfProcessorReturn {
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<MergeResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const merge = useCallback(async (inputs: MergeInput[]) => {
    setIsProcessing(true);
    setResult(null);
    setError(null);

    try {
      const mergeResult = await mergePdfs(inputs);
      setResult(mergeResult);
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

  return { isProcessing, result, error, merge, reset };
}
