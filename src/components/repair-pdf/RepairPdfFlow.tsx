import { useState, useCallback, useEffect } from 'react';
import { getFileName } from '@/lib/fileValidation';
import { invoke } from '@tauri-apps/api/core';
import { readFile } from '@tauri-apps/plugin-fs';
import { encryptedPdfRefusal } from '@/lib/pdfEncryption';
import { Wrench, Info } from 'lucide-react';
import { SaveStep } from '@/components/SaveStep';
import { StepErrorBoundary } from '@/components/ErrorBoundary';
import { Button } from '@/components/ui/button';
import { t } from '@/i18n';
import { OtterSpinner } from '@/components/brand/OtterSpinner';
import { PRIMARY_ACTION } from '@/components/ui/primaryAction';
import { FilePickStep } from '@/components/FilePickStep';


function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

interface RepairPdfFlowProps {
  onStepChange?: (step: number) => void;
}

export function RepairPdfFlow({ onStepChange }: RepairPdfFlowProps) {
  const [step, setStep] = useState(0);

  const goToStep = useCallback((s: number) => {
    setStep(s);
    onStepChange?.(s);
  }, [onStepChange]);
  const [filePath, setFilePath] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<string | null>(null);

  // Repair step
  const [isProcessing, setIsProcessing] = useState(false);
  const [processError, setProcessError] = useState<string | null>(null);

  // Save step
  const [resultBytes, setResultBytes] = useState<Uint8Array | null>(null);
  const [sourceFileSize, setSourceFileSize] = useState(0);
  const [savedFilePath, setSavedFilePath] = useState<string | null>(null);



  // A dropped file gets the same check as a picked one -- it used to walk
  // straight past it into the repair step.
  useEffect(() => {
    if (!pendingFile) return;
    const file = pendingFile;
    setPendingFile(null);
    setIsLoadingFile(true);
    (async () => {
      try {
        const refusal = await encryptedPdfRefusal(await readFile(file));
        if (refusal) { setLoadError(refusal); return; }
        setFilePath(file);
        setFileName(getFileName(file));
        goToStep(1);
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : String(err));
      } finally {
        setIsLoadingFile(false);
      }
    })();
  }, [pendingFile, goToStep]);

  // The picker is shared; what a tool does with the path it is handed is not.
  const handleFileReady = useCallback(async (filePath: string) => {
    setIsLoadingFile(true);
    setLoadError(null);
    try {
      const name = getFileName(filePath);
      // Repair cannot help a locked document either: Ghostscript needs the
      // password before it can rewrite anything.
      const refusal = await encryptedPdfRefusal(await readFile(filePath));
      if (refusal) { setLoadError(refusal); return; }
      setFilePath(filePath);
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
          <FilePickStep
            acceptedFormats={['pdf']}
            tagline={t('repairPdf.fixStructuralIssuesInCorrupted')}
            onFileReady={handleFileReady}
            isLoading={isLoadingFile}
            error={loadError}
          />
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
                  data-testid="apply-btn"
                  onClick={handleRepair}
                  disabled={isProcessing}
                  className={PRIMARY_ACTION}
                >
                  {isProcessing ? (
                    <>
                      <OtterSpinner className="size-4" />
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
              sourcePath={filePath}
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
