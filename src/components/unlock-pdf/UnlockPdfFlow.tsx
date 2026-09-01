import { useState, useCallback, useRef, useEffect } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { readFile } from '@tauri-apps/plugin-fs';
import { invoke } from '@tauri-apps/api/core';
import { FileUp, Loader2, Eye, EyeOff, Unlock } from 'lucide-react';
import { SaveStep } from '@/components/SaveStep';
import { StepErrorBoundary } from '@/components/ErrorBoundary';
import { Button } from '@/components/ui/button';
import { useToolContext } from '@/context/ToolContext';
import { isPdfEncrypted } from '@/lib/pdfEncryption';
import { t } from '@/i18n';

const PDF_EXTENSIONS = ['pdf'];

interface UnlockPdfFlowProps {
  onStepChange?: (step: number) => void;
}

export function UnlockPdfFlow({ onStepChange }: UnlockPdfFlowProps) {
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

  // Password step
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processError, setProcessError] = useState<string | null>(null);

  // Save step
  const [resultBytes, setResultBytes] = useState<Uint8Array | null>(null);
  const [savedFilePath, setSavedFilePath] = useState<string | null>(null);

  // StrictMode guard
  const consumedPending = useRef(false);

  // Consume pending file on mount. A dropped file gets the same check as a
  // picked one -- it used to walk straight past it into the password screen.
  const [pendingFile, setPendingFile] = useState<string | null>(null);
  if (!consumedPending.current && pendingFiles.length > 0) {
    consumedPending.current = true;
    const file = pendingFiles[0];
    setPendingFiles([]);
    setPendingFile(file);
  }

  // Both entry points come through here: there is no point showing a password
  // screen for a document that has no password. Answering it up front is the
  // difference between "nothing to unlock" and a prompt with no correct answer.
  const acceptFile = useCallback(async (path: string): Promise<boolean> => {
    const bytes = await readFile(path);
    if (!(await isPdfEncrypted(bytes))) {
      setLoadError(t('unlockPdf.notProtected'));
      return false;
    }
    const name = path.split('/').pop() ?? path.split('\\').pop() ?? path;
    setFilePath(path);
    setFileName(name);
    setLoadError(null);
    goToStep(1);
    return true;
  }, [goToStep]);

  useEffect(() => {
    if (!pendingFile) return;
    setPendingFile(null);
    setIsLoadingFile(true);
    acceptFile(pendingFile)
      .catch((err) => setLoadError(err instanceof Error ? err.message : String(err)))
      .finally(() => setIsLoadingFile(false));
  }, [pendingFile, acceptFile]);

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
      await acceptFile(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : t('app.couldNotOpenFilePicker');
      setLoadError(message);
    } finally {
      setIsLoadingFile(false);
    }
  }, [acceptFile]);

  const handleUnlock = useCallback(async () => {
    if (!filePath || password.length === 0) return;
    setIsProcessing(true);
    setProcessError(null);
    try {
      const bytes: Uint8Array = await invoke('unlock_pdf', {
        sourcePath: filePath,
        password,
      });
      setResultBytes(new Uint8Array(bytes));
      goToStep(2);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Make the error more user-friendly for wrong password
      if (message.includes(t('unlockPdfFlow.wrongPassword')) || message.includes('failed') || message.includes('Failed')) {
        setProcessError(t('unlockPdfFlow.incorrectPasswordOrThePdf'));
      } else {
        setProcessError(message);
      }
    } finally {
      setIsProcessing(false);
    }
  }, [filePath, password, goToStep]);

  const buildSaveName = (sourceFileName: string): string => {
    const base = sourceFileName.replace(/\.pdf$/i, '');
    return `${base}-unlocked.pdf`;
  };

  return (
    <>
      <StepErrorBoundary stepName="Unlock PDF">
        {/* Step 0: Pick file */}
        {step === 0 && (
          <div className="flex flex-1 flex-col items-center justify-center p-6">
            <div className="w-full max-w-sm space-y-4 text-center">
              <h2 className="text-lg font-semibold text-foreground">{t('unlockPdf.unlockPdf')}</h2>
              <p className="text-sm text-muted-foreground">{t('unlockPdf.removePasswordProtectionFromA')}</p>

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

        {/* Step 1: Enter password */}
        {step === 1 && (
          <div className="flex flex-1 flex-col items-center overflow-y-auto p-6">
            <div className="w-full max-w-md space-y-4 my-auto">
              {/* File name */}
              <div className="text-center">
                <p className="text-sm font-medium text-foreground truncate">{fileName}</p>
              </div>

              {/* Password field */}
              <div className="rounded-lg border border-border bg-card p-4 space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <Unlock className="w-4 h-4 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground font-medium">{t('unlockPdf.enterPassword')}</p>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="unlock-password" className="text-xs text-muted-foreground">
                    {t('unlockPdf.pdfPassword')}
                  </label>
                  <div className="relative">
                    <input
                      id="unlock-password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && password.length > 0 && !isProcessing) {
                          handleUnlock();
                        }
                      }}
                      disabled={isProcessing}
                      placeholder={t('unlockPdf.enterThePdfPassword')}
                      className="w-full rounded-md border border-border bg-background px-3 py-2 pe-10 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute end-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground transition-colors"
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
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
                    setPassword('');
                    setProcessError(null);
                  }}
                  disabled={isProcessing}
                  className="flex-none"
                >
                  {t('common.back')}
                </Button>
                <Button
                  size="sm"
                  onClick={handleUnlock}
                  disabled={isProcessing || password.length === 0}
                  className="flex-1"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-4 h-4 me-2 animate-spin" />
                      {t('unlockPdf.unlocking')}
                    </>
                  ) : (
                    t('tool.unlockPdf.name')
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Save */}
        {step === 2 && resultBytes && (
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
        )}
      </StepErrorBoundary>
    </>
  );
}
