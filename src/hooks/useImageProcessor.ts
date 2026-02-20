import { useState, useCallback } from 'react';
import { processImage } from '@/lib/imageProcessor';
import type { ImageProcessingOptions, ImageProcessingResult } from '@/types/file';

export interface ImageProcessorState {
  isProcessing: boolean;
  result: ImageProcessingResult | null;
  error: string | null;
}

export interface UseImageProcessorReturn extends ImageProcessorState {
  run: (sourcePath: string, options: ImageProcessingOptions) => Promise<void>;
  reset: () => void;
}

const INITIAL_STATE: ImageProcessorState = {
  isProcessing: false,
  result: null,
  error: null,
};

export function useImageProcessor(): UseImageProcessorReturn {
  const [state, setState] = useState<ImageProcessorState>(INITIAL_STATE);

  const run = useCallback(async (sourcePath: string, options: ImageProcessingOptions): Promise<void> => {
    setState({ isProcessing: true, result: null, error: null });
    try {
      const result = await processImage(sourcePath, options);
      setState({ isProcessing: false, result, error: null });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Image processing failed. The file may be corrupted or unsupported.';
      setState({ isProcessing: false, result: null, error: message });
    }
  }, []);

  const reset = useCallback(() => {
    setState(INITIAL_STATE);
  }, []);

  return { ...state, run, reset };
}
