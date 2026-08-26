import { useState, useCallback, useRef } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { readFile } from '@tauri-apps/plugin-fs';
import { FileUp, Loader2, Wrench, Info } from 'lucide-react';
import { SaveStep } from '@/components/SaveStep';
import { StepErrorBoundary } from '@/components/ErrorBoundary';
import { Button } from '@/components/ui/button';
import { useToolContext } from '@/context/ToolContext';
import { t } from '@/i18n';

const PDF_EXTENSIONS = ['pdf'];

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

interface RepairPdfFlowProps {
  onStepChange?: (step: number) => void;
}

export function RepairPdfFlow({ onStepChange }: RepairPdfFlowProps) {
  const { pendingFiles, setPendingFiles } = useToolContext();
  const [step, setStep] = useState(0);

  const goToStep = useCallback((s: number) => {
    setStep(s);
    onStepChange?.(s);
  }, [onStepChange]);
  const [filePath, setFilePath] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Repair step
  const [isProcessing, setIsProcessing] = useState(false);
  const [processError, setProcessError] = useState<string | null>(null);

  // Save step
  const [resultBytes, setResultBytes] = useState<Uint8Array | null>(null);
  const [sourceFileSize, setSourceFileSize] = useState(0);
  const [savedFilePath, setSavedFilePath] = useState<string | null>(null);

  // StrictMode guard
  const consumedPending = useRef(false);

  // Consume pending file on mount
  if (!consumedPending.current && pendingFiles.length > 0) {
    const file = pendingFiles[0];
    consumedPending.current = true;
    setPendingFiles([]);
    const name = file.split('/').pop() ?? file.split('\\').pop() ?? file;
    setFilePath(file);
    setFileName(name);
    goToStep(1);
  }

  const handleSelectFile = useCallback(async () => {
    setIsLoadingFile(true);
    setLoadError(null);
    try {
      const result = await open({
        multiple: false,
        filters: [{ name: t('filter.pdfFiles'), extensions: PDF_EXTENSIONS }],
      });
      if (!result) {
        setIsLoadingFile(false);
        return;
      }
      const name = result.split('/').pop() ?? result.split('\\').pop() ?? result;
      setFilePath(result);
      setFileName(name);
      goToStep(1);
    } catch (err) {
      const message = err instanceof Error ? err.message : t('app.couldNotOpenFilePicker');
      setLoadError(message);
    } finally {
      setIsLoadingFile(false);
    }
  }, [goToStep]);

  const handleRepair = useCallback(async () => {
    if (!filePath) return;
    setIsProcessing(true);
    setProcessError(null);
    try {
      // Read source file size for comparison
      const sourceBytes = await readFile(filePath);
      setSourceFileSize(sourceBytes.byteLength);

      const bytes: Uint8Array = await invoke('repair_pdf', {
        sourcePath: filePath,
      });
      setResultBytes(new Uint8Array(bytes));
      goToStep(2);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setProcessError(message);
    } finally {
      setIsProcessing(false);
    }
  }, [filePath, goToStep]);

  const buildSaveName = (sourceFileName: string): string => {
    const base = sourceFileName.replace(/\.pdf$/i, '');
    return `${base}-repaired.pdf`;
  };

  // Check if repaired file size is close to original (within 5%)
  const isFileSizeSimilar =
    resultBytes &&
    sourceFileSize > 0 &&
    Math.abs(resultBytes.byteLength - sourceFileSize) / sourceFileSize < 0.05;

  return (
    <>
      <StepErrorBoundary stepName="Repair PDF">
        {/* Step 0: Pick file */}
        {step === 0 && (
          <div className="flex flex-1 flex-col items-center justify-center p-6">
            <div className="w-full max-w-sm space-y-4 text-center">
              <h2 className="text-lg font-semibold text-foreground">{t('repairPdf.repairPdf')}</h2>
              <p className="text-sm text-muted-foreground">
                {t('repairPdf.fixStructuralIssuesInCorrupted')}
              </p>

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

        {/* Step 1: Repair */}
        {step === 1 && (
          <div className="flex flex-1 flex-col items-center overflow-y-auto p-6">
            <div className="w-full max-w-md space-y-4 my-auto">
              {/* File name */}
              <div className="text-center">
                <p className="text-sm font-medium text-foreground truncate">{fileName}</p>
              </div>

              {/* Info card */}
              <div className="rounded-lg border border-border bg-card p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Wrench className="w-4 h-4 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground font-medium">{t('repairPdf.pdfRepair')}</p>
                </div>

                <p className="text-xs text-muted-foreground">
                  {t('repairPdf.repairExplanation')}
                </p>
              </div>

              {/* Error */}
              {processError && (
                <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {processError}
                </p>
              )}

              {/* Actions */}
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    goToStep(0);
                    setFilePath(null);
                    setFileName('');
                    setProcessError(null);
                  }}
                  disabled={isProcessing}
                  className="flex-none"
                >
                  {t('common.back')}
                </Button>
                <Button
                  size="sm"
                  onClick={handleRepair}
                  disabled={isProcessing}
                  className="flex-1"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-4 h-4 me-2 animate-spin" />
                      {t('repairPdf.repairing')}
                    </>
                  ) : (
                    t('tool.repairPdf.name')
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Save */}
        {step === 2 && resultBytes && (
          <div className="flex flex-1 flex-col">
            {/* File size comparison + status */}
            <div className="border-b border-border bg-card px-4 py-3 space-y-2">
              <p className="text-xs text-muted-foreground text-center">
                {t('repairPdf.originalToRepaired', { original: formatFileSize(sourceFileSize), repaired: formatFileSize(resultBytes.byteLength) })}
              </p>

              {isFileSizeSimilar && (
                <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                  <Info className="w-3 h-3" />
                  <span>{t('repairPdf.noIssuesDetectedFileAppears')}</span>
                </div>
              )}

              <p className="text-xs text-muted-foreground/70 text-center italic">
                {t('repairPdf.repairCompleteIfTheDocument')}
              </p>
            </div>

            <SaveStep
              processedBytes={resultBytes}
              sourceFileName={fileName}
              defaultSaveName={buildSaveName(fileName)}
              saveFilters={[{ name: t('filter.pdfDocument'), extensions: ['pdf'] }]}
              savedFilePath={savedFilePath}
              onDismissSaveConfirmation={() => setSavedFilePath(null)}
              onSaveComplete={(path) => setSavedFilePath(path)}
              onCancel={() => goToStep(1)}
              onBack={() => {
                setSavedFilePath(null);
                goToStep(1);
              }}
            />
          </div>
        )}
      </StepErrorBoundary>
    </>
  );
}
