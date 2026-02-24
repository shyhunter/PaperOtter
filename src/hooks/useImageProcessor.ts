import { useState, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { processImage } from '@/lib/imageProcessor';
import type { ImageProcessingOptions, ImageProcessingResult } from '@/types/file';

export interface ImageProcessorState {
  isProcessing: boolean;
  result: ImageProcessingResult | null;
  error: string | null;
  isCancelled: boolean;
}

export interface UseImageProcessorReturn extends ImageProcessorState {
  run: (sourcePath: string, options: ImageProcessingOptions) => Promise<void>;
  cancel: () => void;
  reset: () => void;
}

const INITIAL_STATE: ImageProcessorState = {
  isProcessing: false,
  result: null,
  error: null,
  isCancelled: false,
};

export function useImageProcessor(): UseImageProcessorReturn {
  const [state, setState] = useState<ImageProcessorState>(INITIAL_STATE);
  // Tracks whether cancel() was called so we can distinguish CANCELLED from real errors
  const cancelledRef = useRef(false);

  const run = useCallback(async (sourcePath: string, options: ImageProcessingOptions): Promise<void> => {
    cancelledRef.current = false;
    // Preserve previous result while processing so ImageCompareStep can show stale overlay
    setState((prev) => ({ ...prev, isProcessing: true, error: null, isCancelled: false }));
    try {
      const result = await processImage(sourcePath, options);
      setState({ isProcessing: false, result, error: null, isCancelled: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('CANCELLED')) {
        // Normal cancellation — not a user-visible error
        setState((prev) => ({ ...prev, isProcessing: false, error: null, isCancelled: true }));
      } else {
        setState((prev) => ({ ...prev, isProcessing: false, error: message, isCancelled: false }));
      }
    }
  }, []);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    // Fire-and-forget — image processing is typically sub-second but wired for consistency
    void invoke('cancel_processing');
  }, []);

  const reset = useCallback(() => {
    cancelledRef.current = false;
    setState(INITIAL_STATE);
  }, []);

  return { ...state, run, cancel, reset };
}
