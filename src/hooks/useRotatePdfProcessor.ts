// React hook for PDF rotation processing — follows the same pattern as usePdfProcessor.
import { useState, useCallback } from 'react';
import { rotatePdf } from '@/lib/pdfRotate';
import type { PageRotation, RotateResult } from '@/lib/pdfRotate';

export interface UseRotatePdfProcessorReturn {
  isProcessing: boolean;
  result: RotateResult | null;
  error: string | null;
  rotate: (pdfBytes: Uint8Array, rotations: PageRotation[]) => Promise<void>;
  reset: () => void;
}

export function useRotatePdfProcessor(): UseRotatePdfProcessorReturn {
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<RotateResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const rotate = useCallback(async (pdfBytes: Uint8Array, rotations: PageRotation[]) => {
    setIsProcessing(true);
    setResult(null);
    setError(null);

    try {
      const rotateResult = await rotatePdf(pdfBytes, rotations);
      setResult(rotateResult);
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

  return { isProcessing, result, error, rotate, reset };
}
