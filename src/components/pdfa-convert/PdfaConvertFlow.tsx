import { useState, useCallback, useRef } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { readFile } from '@tauri-apps/plugin-fs';
import { FileUp, Loader2, Archive } from 'lucide-react';
import { SaveStep } from '@/components/SaveStep';
import { StepErrorBoundary } from '@/components/ErrorBoundary';
import { Button } from '@/components/ui/button';
import { useToolContext } from '@/context/ToolContext';
import { t } from '@/i18n';

const PDF_EXTENSIONS = ['pdf'];

type PdfaLevel = '1' | '2' | '3';

interface PdfaOption {
  level: PdfaLevel;
  label: string;
  description: string;
}

/**
 * A function, not a constant: these labels are translated, and a module-level
 * constant resolves them once at import -- before the locale is known.
 */
function pdfaOptions(): PdfaOption[] {
  return [
    { level: '1', label: 'PDF/A-1b', description: t('pdfaConvertFlow.basicCompatibility') },
    { level: '2', label: 'PDF/A-2b', description: t('pdfaConvertFlow.modernStandardSupportsTransparency') },
    { level: '3', label: 'PDF/A-3b', description: t('pdfaConvertFlow.latestSupportsAttachments') },
  ];
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

interface PdfaConvertFlowProps {
  onStepChange?: (step: number) => void;
}

export function PdfaConvertFlow({ onStepChange }: PdfaConvertFlowProps) {
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

  // Configure step
  const [pdfaLevel, setPdfaLevel] = useState<PdfaLevel>('2');
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

  const handleConvert = useCallback(async () => {
    if (!filePath) return;
    setIsProcessing(true);
    setProcessError(null);
    try {
      // Read source file size for comparison
      const sourceBytes = await readFile(filePath);
      setSourceFileSize(sourceBytes.byteLength);

      const bytes: Uint8Array = await invoke('convert_pdfa', {
        sourcePath: filePath,
        pdfaLevel: pdfaLevel,
      });
      setResultBytes(new Uint8Array(bytes));
      goToStep(2);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setProcessError(message);
    } finally {
      setIsProcessing(false);
    }
  }, [filePath, pdfaLevel, goToStep]);

  const buildSaveName = (sourceFileName: string): string => {
    const base = sourceFileName.replace(/\.pdf$/i, '');
    return `${base}-pdfa.pdf`;
  };

  return (
    <>
      <StepErrorBoundary stepName="PDF/A Convert">
        {/* Step 0: Pick file */}
        {step === 0 && (
          <div className="flex flex-1 flex-col items-center justify-center p-6">
            <div className="w-full max-w-sm space-y-4 text-center">
              <h2 className="text-lg font-semibold text-foreground">{t('pdfaConvert.convertToPdfA')}</h2>
              <p className="text-sm text-muted-foreground">
                {t('pdfaConvert.convertAPdfToArchival')}
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

        {/* Step 1: Configure conformance level */}
        {step === 1 && (
          <div className="flex flex-1 flex-col items-center overflow-y-auto p-6">
            <div className="w-full max-w-md space-y-4 my-auto">
              {/* File name */}
              <div className="text-center">
                <p className="text-sm font-medium text-foreground truncate">{fileName}</p>
              </div>

              {/* Info card */}
              <div className="rounded-lg border border-border bg-card p-4 space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <Archive className="w-4 h-4 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground font-medium">{t('pdfaConvert.conformanceLevel')}</p>
                </div>

                <p className="text-xs text-muted-foreground">
                  {t('pdfaConvert.pdfAIsAnArchival')}
                </p>

                {/* Radio group */}
                <fieldset className="space-y-2">
                  {pdfaOptions().map((opt) => (
                    <label
                      key={opt.level}
                      className="flex items-start gap-3 rounded-lg border border-border p-3 cursor-pointer hover:bg-accent/50 transition-colors"
                    >
                      <input
                        type="radio"
                        name="pdfa-level"
                        value={opt.level}
                        checked={pdfaLevel === opt.level}
                        onChange={() => setPdfaLevel(opt.level)}
                        disabled={isProcessing}
                        className="accent-primary mt-0.5"
                      />
                      <div>
                        <p className="text-sm font-medium text-foreground">{opt.label}</p>
                        <p className="text-xs text-muted-foreground">{opt.description}</p>
                      </div>
                    </label>
                  ))}
                </fieldset>
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
                  onClick={handleConvert}
                  disabled={isProcessing}
                  className="flex-1"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-4 h-4 me-2 animate-spin" />
                      {t('convertImage.converting')}
                    </>
                  ) : (
                    'Convert'
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Save */}
        {step === 2 && resultBytes && (
          <div className="flex flex-1 flex-col">
            {/* File size comparison */}
            <div className="border-b border-border bg-card px-4 py-3">
              <p className="text-xs text-muted-foreground text-center">
                {t('pdfaConvert.originalToPdfa', { original: formatFileSize(sourceFileSize), pdfa: formatFileSize(resultBytes.byteLength) })}
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
