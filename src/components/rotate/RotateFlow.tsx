// RotateFlow: Orchestrates the rotate tool flow — Pick → Select & Rotate → Save.
import { useState, useCallback, useEffect } from 'react';
import { readFile } from '@tauri-apps/plugin-fs';
import { PDFDocument } from 'pdf-lib';
import { open } from '@tauri-apps/plugin-dialog';
import { FileUp, Loader2 } from 'lucide-react';
import { RotateStep } from './RotateStep';
import { SaveStep } from '@/components/SaveStep';
import { StepErrorBoundary } from '@/components/ErrorBoundary';
import { Button } from '@/components/ui/button';
import { useToolContext } from '@/context/ToolContext';
import { friendlyPdfError } from '@/lib/pdfUtils';
import { useRotatePdfProcessor } from '@/hooks/useRotatePdfProcessor';
import type { RotationDegrees } from '@/lib/pdfRotate';
import { t } from '@/i18n';

interface RotateFlowProps {
  onStepChange?: (step: number) => void;
}

export function RotateFlow({ onStepChange }: RotateFlowProps) {
  const { pendingFiles, setPendingFiles } = useToolContext();
  const rotateProcessor = useRotatePdfProcessor();
  const [step, setStep] = useState(0);
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [fileName, setFileName] = useState('');
  // The file this flow opened. Save writes back to it; Save as... writes a copy.
  const [sourcePath, setSourcePath] = useState<string | null>(null);
  const [savedFilePath, setSavedFilePath] = useState<string | null>(null);
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const goToStep = useCallback((s: number) => {
    setStep(s);
    onStepChange?.(s);
  }, [onStepChange]);

  // Consume pending file
  const initialFile = pendingFiles.length > 0 ? pendingFiles[0] : null;
  if (pendingFiles.length > 0) {
    setPendingFiles([]);
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
      setSourcePath(filePath);
      goToStep(1);
    } catch (err) {
      setLoadError(friendlyPdfError(err));
    } finally {
      setIsLoadingFile(false);
    }
  }, [goToStep]);

  // Auto-load initial file on mount

  useEffect(() => {
    if (initialFile) {
      loadFile(initialFile);
    }
  }, [initialFile, loadFile]);

  const handleSelectFile = useCallback(async () => {
    try {
      const result = await open({
        multiple: false,
        filters: [{ name: t('filter.pdfFiles'), extensions: ['pdf'] }],
      });
      if (!result) return;
      const path = typeof result === 'string' ? result : result;
      await loadFile(path);
    } catch (err) {
      const message = err instanceof Error ? err.message : t('app.couldNotOpenFilePicker');
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
              <h2 className="text-lg font-semibold text-foreground">{t('common.rotatePages')}</h2>
              <p className="text-sm text-muted-foreground">{t('rotate.selectAPdfToRotate')}</p>

              {loadError && (
                <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3">
                  <p className="text-xs text-destructive">{loadError}</p>
                </div>
              )}

              <Button onClick={handleSelectFile} disabled={isLoadingFile} className="w-full">
                {isLoadingFile ? (
                  <>
                    <Loader2 className="w-4 h-4 me-2 animate-spin" />
                    {t('common.loading')}
                  </>
                ) : (
                  <>
                    <FileUp className="w-4 h-4 me-2" />
                    {t('pdfToJpg.selectPdf')}
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
            sourcePath={sourcePath}
            processedBytes={rotateProcessor.result.bytes}
            sourceFileName={fileName}
            defaultSaveName={fileName.replace(/\.pdf$/i, '') + '-rotated.pdf'}
            savedFilePath={savedFilePath}
            onDismissSaveConfirmation={() => setSavedFilePath(null)}
            onSaveComplete={(path) => setSavedFilePath(path)}
            onCancel={() => goToStep(1)}
            onBack={() => {
              setSavedFilePath(null);
              // Clear the result first: the auto-advance above re-fires on the next
              // render while it is still set, which would bounce us back to Save.
              rotateProcessor.reset();
              goToStep(1);
            }}
          />
        )}
      </StepErrorBoundary>
    </>
  );
}
