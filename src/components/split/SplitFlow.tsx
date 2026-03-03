// SplitFlow: Orchestrates the split tool flow — Pick → Select Pages → Save.
import { useState, useCallback } from 'react';
import { SplitPickStep } from './SplitPickStep';
import { SplitSelectStep } from './SplitSelectStep';
import { SaveStep } from '@/components/SaveStep';
import { StepErrorBoundary } from '@/components/ErrorBoundary';
import { useToolContext } from '@/context/ToolContext';
import { useSplitPdfProcessor } from '@/hooks/useSplitPdfProcessor';
import type { SplitMode } from '@/lib/pdfSplit';

interface SplitFlowProps {
  onStepChange?: (step: number) => void;
}

export function SplitFlow({ onStepChange }: SplitFlowProps) {
  const { pendingFile, setPendingFile } = useToolContext();
  const splitProcessor = useSplitPdfProcessor();
  const [step, setStep] = useState(0);
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [fileName, setFileName] = useState('');
  const [savedFilePath, setSavedFilePath] = useState<string | null>(null);

  const goToStep = useCallback((s: number) => {
    setStep(s);
    onStepChange?.(s);
  }, [onStepChange]);

  // Consume pending file
  const initialFile = pendingFile;
  if (pendingFile) {
    setPendingFile(null);
  }

  const handleFileLoaded = useCallback((bytes: Uint8Array, pages: number, name: string) => {
    setPdfBytes(bytes);
    setPageCount(pages);
    setFileName(name);
    goToStep(1);
  }, [goToStep]);

  const handleSplit = useCallback(async (mode: SplitMode) => {
    if (!pdfBytes) return;
    await splitProcessor.split(pdfBytes, fileName, mode);
    // If successful, advance to save
    if (!splitProcessor.error) {
      goToStep(2);
    }
  }, [pdfBytes, fileName, splitProcessor, goToStep]);

  // After split completes, check if we should advance
  // (split is async, result arrives after the callback returns)
  if (step === 1 && splitProcessor.result && !splitProcessor.isProcessing) {
    goToStep(2);
  }

  return (
    <>
      <StepErrorBoundary stepName="Split">
        {step === 0 && (
          <SplitPickStep
            onFileLoaded={handleFileLoaded}
            initialFile={initialFile}
          />
        )}

        {step === 1 && pdfBytes && (
          <SplitSelectStep
            pdfBytes={pdfBytes}
            pageCount={pageCount}
            fileName={fileName}
            onSplit={handleSplit}
            onBack={() => goToStep(0)}
            isProcessing={splitProcessor.isProcessing}
          />
        )}

        {step === 2 && splitProcessor.result && (
          <SaveStep
            processedBytes={new Uint8Array(0)} // Not used in multi-file mode
            sourceFileName={fileName}
            defaultSaveName={fileName.replace(/\.pdf$/i, '') + '-split.zip'}
            multiFileOutputs={splitProcessor.result.outputs.map((o) => ({
              fileName: o.fileName,
              bytes: o.bytes,
            }))}
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
