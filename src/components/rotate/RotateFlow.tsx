// RotateFlow: Orchestrates the rotate tool flow — Pick → Select & Rotate → Save.
import { useState, useCallback } from 'react';
import { readFile } from '@tauri-apps/plugin-fs';
import { PDFDocument } from 'pdf-lib';
import { open } from '@tauri-apps/plugin-dialog';
import { FileUp, Loader2 } from 'lucide-react';
import { RotateStep } from './RotateStep';
import { SaveStep } from '@/components/SaveStep';
import { StepErrorBoundary } from '@/components/ErrorBoundary';
import { Button } from '@/components/ui/button';
import { useToolContext } from '@/context/ToolContext';
import { useRotatePdfProcessor } from '@/hooks/useRotatePdfProcessor';
import type { RotationDegrees } from '@/lib/pdfRotate';

interface RotateFlowProps {
  onStepChange?: (step: number) => void;
}

export function RotateFlow({ onStepChange }: RotateFlowProps) {
  const { pendingFile, setPendingFile } = useToolContext();
  const rotateProcessor = useRotatePdfProcessor();
  const [step, setStep] = useState(0);
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [fileName, setFileName] = useState('');
  const [savedFilePath, setSavedFilePath] = useState<string | null>(null);
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const goToStep = useCallback((s: number) => {
    setStep(s);
    onStepChange?.(s);
  }, [onStepChange]);

  // Consume pending file
  const initialFile = pendingFile;
  if (pendingFile) {
    setPendingFile(null);
  }

  const loadFile = useCallback(async (filePath: string) => {
    setIsLoadingFile(true);
    setLoadError(null);
    try {
      const bytes = await readFile(filePath);
      const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const pages = doc.getPageCount();
      const name = filePath.split('/').pop() ?? filePath.split('\\').pop() ?? filePath;
      setPdfBytes(bytes);
      setPageCount(pages);
      setFileName(name);
      goToStep(1);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load PDF.';
      setLoadError(message);
    } finally {
      setIsLoadingFile(false);
    }
  }, [goToStep]);

  // Auto-load initial file
  useState(() => {
    if (initialFile) {
      loadFile(initialFile);
    }
  });

  const handleSelectFile = useCallback(async () => {
    try {
      const result = await open({
        multiple: false,
        filters: [{ name: 'PDF Files', extensions: ['pdf'] }],
      });
      if (!result) return;
      const path = typeof result === 'string' ? result : result;
      await loadFile(path);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not open file picker.';
      setLoadError(message);
    }
  }, [loadFile]);

  const handleApplied = useCallback(async (rotations: Map<number, RotationDegrees>) => {
    if (!pdfBytes) return;

    const pageRotations = Array.from(rotations.entries())
      .filter(([, r]) => r !== 0)
      .map(([pageIndex, rotation]) => ({ pageIndex, rotation }));

    await rotateProcessor.rotate(pdfBytes, pageRotations);
  }, [pdfBytes, rotateProcessor]);

  // Advance to save after rotation completes
  if (step === 1 && rotateProcessor.result && !rotateProcessor.isProcessing) {
    goToStep(2);
  }

  return (
    <>
      <StepErrorBoundary stepName="Rotate">
        {/* Step 0: Pick file */}
        {step === 0 && (
          <div className="flex flex-1 flex-col items-center justify-center p-6">
            <div className="w-full max-w-sm space-y-4 text-center">
              <h2 className="text-lg font-semibold text-foreground">Rotate Pages</h2>
              <p className="text-sm text-muted-foreground">Select a PDF to rotate individual or all pages.</p>

              {loadError && (
                <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3">
                  <p className="text-xs text-destructive">{loadError}</p>
                </div>
              )}

              <Button onClick={handleSelectFile} disabled={isLoadingFile} className="w-full">
                {isLoadingFile ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Loading…
                  </>
                ) : (
                  <>
                    <FileUp className="w-4 h-4 mr-2" />
                    Select PDF
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Step 1: Select & Rotate */}
        {step === 1 && pdfBytes && (
          <RotateStep
            pdfBytes={pdfBytes}
            pageCount={pageCount}
            onApplied={handleApplied}
            onBack={() => goToStep(0)}
            isProcessing={rotateProcessor.isProcessing}
          />
        )}

        {/* Step 2: Save */}
        {step === 2 && rotateProcessor.result && (
          <SaveStep
            processedBytes={rotateProcessor.result.bytes}
            sourceFileName={fileName}
            defaultSaveName={fileName.replace(/\.pdf$/i, '') + '-rotated.pdf'}
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
