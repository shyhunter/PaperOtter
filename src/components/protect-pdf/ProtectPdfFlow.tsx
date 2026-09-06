import { useState, useCallback, useRef, useEffect } from 'react';
import { getFileName } from '@/lib/fileValidation';
import { open } from '@/lib/dialog';
import { readFile } from '@tauri-apps/plugin-fs';
import { invoke } from '@tauri-apps/api/core';
import { FileUp, Loader2, Eye, EyeOff, Lock } from 'lucide-react';
import { SaveStep } from '@/components/SaveStep';
import { StepErrorBoundary } from '@/components/ErrorBoundary';
import { Button } from '@/components/ui/button';
import { useToolContext } from '@/context/ToolContext';
import { isPdfEncrypted } from '@/lib/pdfEncryption';
import { t } from '@/i18n';

const PDF_EXTENSIONS = ['pdf'];

interface ProtectPdfFlowProps {
  onStepChange?: (step: number) => void;
}

export function ProtectPdfFlow({ onStepChange }: ProtectPdfFlowProps) {
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
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
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

  // Ghostscript cannot open an encrypted PDF without its existing password: it
  // refuses with "User password is specified. Need an Owner password or both."
  // and leaves a zero-byte file. Better to say so than to spend two password
  // entries and an acknowledgement first.
  const acceptFile = useCallback(async (path: string): Promise<boolean> => {
    const bytes = await readFile(path);
    if (await isPdfEncrypted(bytes)) {
      setLoadError(t('protectPdf.alreadyProtected'));
      return false;
    }
    const name = getFileName(path);
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

  const passwordsMatch = password.length > 0 && password === confirmPassword;

  // Checked when the button is pressed, not on every keystroke. Validating as
  // the user types accuses a correct confirmation of being wrong for as long as
  // it is being entered — the message is on screen from the first character to
  // the last, and only disappears at the moment it stops being needed.
  const [showMismatch, setShowMismatch] = useState(false);

  // Both fields filled is what makes the form submittable; whether they agree is
  // what the button reports. Gating the button on agreement, as this used to,
  // means the check can never run: the only control that could report the
  // problem is disabled by the problem.
  // A lost password is unrecoverable by anyone, so the acknowledgement is a
  // gate rather than a notice: the user's own decision, taken deliberately.
  const [acknowledged, setAcknowledged] = useState(false);

  const canSubmit = password.length > 0 && confirmPassword.length > 0 && acknowledged;

  const handleProtect = useCallback(async () => {
    if (!filePath || !canSubmit) return;
    if (!passwordsMatch) {
      setShowMismatch(true);
      return;
    }
    setShowMismatch(false);
    setIsProcessing(true);
    setProcessError(null);
    try {
      const bytes: Uint8Array = await invoke('protect_pdf', {
        sourcePath: filePath,
        ownerPassword: password,
        userPassword: password,
      });
      setResultBytes(new Uint8Array(bytes));
      goToStep(2);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setProcessError(message);
    } finally {
      setIsProcessing(false);
    }
  }, [filePath, password, passwordsMatch, canSubmit, goToStep]);

  const buildSaveName = (sourceFileName: string): string => {
    const base = sourceFileName.replace(/\.pdf$/i, '');
    return `${base}-protected.pdf`;
  };

  return (
    <>
      <StepErrorBoundary stepName="Protect PDF">
        {/* Step 0: Pick file */}
        {step === 0 && (
          <div className="flex flex-1 flex-col items-center justify-center p-6">
            <div className="w-full max-w-sm space-y-4 text-center">
              <h2 className="text-lg font-semibold text-foreground">{t('protectPdf.protectPdf')}</h2>
              <p className="text-sm text-muted-foreground">{t('protectPdf.addPasswordEncryptionToA')}</p>

              {loadError && (
                <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3">
                  <p className="text-xs text-destructive">{loadError}</p>
                </div>
              )}

              <Button data-testid="open-file-btn" onClick={handleSelectFile} disabled={isLoadingFile} className="w-full">
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

        {/* Step 1: Set password */}
        {step === 1 && (
          <div className="flex flex-1 flex-col items-center overflow-y-auto p-6">
            <div className="w-full max-w-md space-y-4 my-auto">
              {/* File name */}
              <div className="text-center">
                <p className="text-sm font-medium text-foreground truncate">{fileName}</p>
              </div>

              {/* Password fields */}
              <div className="rounded-lg border border-border bg-card p-4 space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <Lock className="w-4 h-4 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground font-medium">{t('protectPdf.setPassword')}</p>
                </div>

                {/* Password */}
                <div className="space-y-1.5">
                  <label htmlFor="protect-password" className="text-xs text-muted-foreground">
                    {t('protectPdf.password')}
                  </label>
                  <div className="relative">
                    <input
                      id="protect-password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => { setPassword(e.target.value); setShowMismatch(false); }}
                      disabled={isProcessing}
                      placeholder={t('protectPdf.enterPassword')}
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

                {/* Confirm password */}
                <div className="space-y-1.5">
                  <label htmlFor="protect-confirm-password" className="text-xs text-muted-foreground">
                    {t('protectPdf.confirmPassword')}
                  </label>
                  <div className="relative">
                    <input
                      id="protect-confirm-password"
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => { setConfirmPassword(e.target.value); setShowMismatch(false); }}
                      disabled={isProcessing}
                      placeholder={t('protectPdf.confirmPassword')}
                      className="w-full rounded-md border border-border bg-background px-3 py-2 pe-10 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword((v) => !v)}
                      className="absolute end-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground transition-colors"
                      tabIndex={-1}
                    >
                      {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {showMismatch && (
                    <p className="text-xs text-destructive">{t('protectPdf.passwordsDoNotMatch')}</p>
                  )}
                </div>

                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    data-testid="protect-ack"
                    checked={acknowledged}
                    onChange={(e) => setAcknowledged(e.target.checked)}
                    disabled={isProcessing}
                    className="mt-0.5 h-4 w-4 flex-none accent-primary"
                  />
                  <span className="text-xs text-muted-foreground">
                    {t('protectPdf.acknowledgePassword')}
                  </span>
                </label>
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
                    setConfirmPassword('');
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
                  onClick={handleProtect}
                  disabled={isProcessing || !canSubmit}
                  className="flex-1"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-4 h-4 me-2 animate-spin" />
                      {t('protectPdf.encrypting')}
                    </>
                  ) : (
                    t('tool.protectPdf.name')
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Save */}
        {step === 2 && resultBytes && (
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
        )}
      </StepErrorBoundary>
    </>
  );
}
