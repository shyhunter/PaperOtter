// MergeFlow: Orchestrates the merge tool flow — Pick Files -> Order -> Save.
import { useState, useCallback } from 'react';
import { MergePickStep } from './MergePickStep';
import { MergeOrderStep } from './MergeOrderStep';
import { SaveStep } from '@/components/SaveStep';
import { StepErrorBoundary } from '@/components/ErrorBoundary';
import { useToolContext } from '@/context/ToolContext';
import type { MergeInput } from '@/lib/pdfMerge';

interface MergeFlowProps {
  onStepChange?: (step: number) => void;
}

export function MergeFlow({ onStepChange }: MergeFlowProps) {
  const { pendingFiles, setPendingFiles } = useToolContext();
  const [step, setStep] = useState(0);
  const [files, setFiles] = useState<MergeInput[]>([]);
  const [mergedBytes, setMergedBytes] = useState<Uint8Array | null>(null);
  const [savedFilePath, setSavedFilePath] = useState<string | null>(null);

  const goToStep = useCallback((s: number) => {
    setStep(s);
    onStepChange?.(s);
  }, [onStepChange]);

  // Consume pending files on first render
  const initialFiles = pendingFiles.length > 0 ? [...pendingFiles] : [];
  if (pendingFiles.length > 0) {
    setPendingFiles([]);
  }

  const handleFilesSelected = useCallback((selected: MergeInput[]) => {
    setFiles(selected);
    goToStep(1);
  }, [goToStep]);

  const handleMerged = useCallback((bytes: Uint8Array) => {
    setMergedBytes(bytes);
    goToStep(2);
  }, [goToStep]);

  const handleBackToPick = useCallback(() => {
    goToStep(0);
  }, [goToStep]);

  return (
    <>
      <StepErrorBoundary stepName="Merge">
        {step === 0 && (
          <MergePickStep
            onFilesSelected={handleFilesSelected}
            initialFiles={initialFiles}
          />
        )}

        {step === 1 && (
          <MergeOrderStep
            files={files}
            onMerged={handleMerged}
            onBack={handleBackToPick}
          />
        )}

        {step === 2 && mergedBytes && (
          <SaveStep
            processedBytes={mergedBytes}
            sourceFileName="merged.pdf"
            defaultSaveName="merged.pdf"
            savedFilePath={savedFilePath}
            onDismissSaveConfirmation={() => setSavedFilePath(null)}
            onSaveComplete={(path) => setSavedFilePath(path)}
            onCancel={() => goToStep(1)}
            onBack={() => {
              setSavedFilePath(null);
              goToStep(1);
            }}
          />
        )}
      </StepErrorBoundary>
    </>
  );
}
