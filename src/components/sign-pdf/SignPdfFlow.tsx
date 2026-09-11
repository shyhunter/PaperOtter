import { useState, useCallback, useRef } from 'react';
import { getFileName } from '@/lib/fileValidation';
import { open } from '@/lib/dialog';
import { readFile } from '@tauri-apps/plugin-fs';
import { encryptedPdfRefusal } from '@/lib/pdfEncryption';
import { FileUp } from 'lucide-react';
import { SignatureCreateStep } from './SignatureCreateStep';
import { SignaturePlaceStep } from './SignaturePlaceStep';
import { SaveStep } from '@/components/SaveStep';
import { StepErrorBoundary } from '@/components/ErrorBoundary';
import { Button } from '@/components/ui/button';
import { useToolContext } from '@/context/ToolContext';
import { t } from '@/i18n';
import { OtterSpinner } from '@/components/brand/OtterSpinner';

const PDF_EXTENSIONS = ['pdf'];

interface SignPdfFlowProps {
  onStepChange?: (step: number) => void;
}

export function SignPdfFlow({ onStepChange }: SignPdfFlowProps) {
  const { pendingFiles, setPendingFiles } = useToolContext();
  const [step, setStep] = useState(0);

  const goToStep = useCallback((s: number) => {
    setStep(s);
    onStepChange?.(s);
  }, [onStepChange]);
  // The value was discarded here until Save needed it: the setter was called
  // in three places and nothing ever read the state back.
  const [filePath, setFilePath] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Signature step
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);

  // Save step
  const [resultBytes, setResultBytes] = useState<Uint8Array | null>(null);
  const [savedFilePath, setSavedFilePath] = useState<string | null>(null);

  // StrictMode guard
  const consumedPending = useRef(false);

  // Consume pending file on mount
  if (!consumedPending.current && pendingFiles.length > 0) {
    const file = pendingFiles[0];
    consumedPending.current = true;
    setPendingFiles([]);
    const name = getFileName(file);
    setFilePath(file);
    setFileName(name);
    // Read bytes will happen via effect-like pattern after render
    setIsLoadingFile(true);
    readFile(file)
      .then(async (bytes) => {
        // A dropped file gets the same check as a picked one.
        const refusal = await encryptedPdfRefusal(new Uint8Array(bytes));
        if (refusal) { setLoadError(refusal); setFilePath(null); return; }
        setPdfBytes(new Uint8Array(bytes));
        goToStep(1);
      })
      .catch(() => {
        setLoadError(t('signPdf.couldNotReadThePdf'));
      })
      .finally(() => {
        setIsLoadingFile(false);
      });
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
      const name = getFileName(result);
      const bytes = await readFile(result);
      // A locked PDF loads fine under `ignoreEncryption` and reports its real
      // page count, so without this the tool opens and then renders nothing.
      const refusal = await encryptedPdfRefusal(bytes);
      if (refusal) { setLoadError(refusal); return; }
      setFilePath(result);
      setFileName(name);
      setPdfBytes(new Uint8Array(bytes));
      goToStep(1);
    } catch (err) {
      const message = err instanceof Error ? err.message : t('app.couldNotOpenFilePicker');
      setLoadError(message);
    } finally {
      setIsLoadingFile(false);
    }
  }, [goToStep]);

  const handleSignatureSelected = useCallback((dataUrl: string) => {
    setSignatureDataUrl(dataUrl);
    goToStep(2);
  }, [goToStep]);

  const handlePlacementComplete = useCallback((bytes: Uint8Array) => {
    setResultBytes(bytes);
    goToStep(3);
  }, [goToStep]);

  const buildSaveName = (sourceFileName: string): string => {
    const base = sourceFileName.replace(/\.pdf$/i, '');
    return `${base}-signed.pdf`;
  };

  return (
    <>
      <StepErrorBoundary stepName="Sign PDF">
        {/* Step 0: Pick file */}
        {step === 0 && (
          <div className="flex flex-1 flex-col items-center justify-center p-6">
            <div className="w-full max-w-sm space-y-4 text-center">
              <h2 className="text-lg font-semibold text-foreground">{t('signPdf.signPdf')}</h2>
              <p className="text-sm text-muted-foreground">{t('signPdf.addASignatureToYour')}</p>

              {loadError && (
                <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3">
                  <p className="text-xs text-destructive">{loadError}</p>
                </div>
              )}

              <Button data-testid="open-file-btn" onClick={handleSelectFile} disabled={isLoadingFile} className="w-full">
                {isLoadingFile ? (
                  <>
                    <OtterSpinner className="size-4" />
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

        {/* Step 1: Create or select signature */}
        {step === 1 && (
          <SignatureCreateStep
            onSignatureSelected={handleSignatureSelected}
            onBack={() => {
              goToStep(0);
              setFilePath(null);
              setFileName('');
              setPdfBytes(null);
              setSignatureDataUrl(null);
            }}
          />
        )}

        {/* Step 2: Place signature on page.
            The guard below used to be the whole story, so anything it turned
            away rendered nothing at all while the step bar said Place -- a
            blank window with no control on it. A saved signature carried over
            from the editor's old list had an empty dataUrl, which is falsy, so
            picking one did exactly that. */}
        {step === 2 && !(pdfBytes && signatureDataUrl) && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
            <p className="text-sm text-foreground">{t('signPdf.couldNotPlaceSignature')}</p>
            <Button variant="outline" size="sm" onClick={() => goToStep(1)}>
              {t('common.back')}
            </Button>
          </div>
        )}
        {step === 2 && pdfBytes && signatureDataUrl && (
          <SignaturePlaceStep
            pdfBytes={pdfBytes}
            signatureDataUrl={signatureDataUrl}
            onComplete={handlePlacementComplete}
            onBack={() => {
              setResultBytes(null);
              goToStep(1);
            }}
          />
        )}

        {/* Step 3: Save */}
        {step === 3 && resultBytes && (
          <SaveStep
            sourcePath={filePath}
            processedBytes={resultBytes}
            sourceFileName={fileName}
            defaultSaveName={buildSaveName(fileName)}
            saveFilters={[{ name: t('filter.pdfDocument'), extensions: ['pdf'] }]}
            savedFilePath={savedFilePath}
            onDismissSaveConfirmation={() => setSavedFilePath(null)}
            onSaveComplete={(path) => setSavedFilePath(path)}
            onCancel={() => goToStep(2)}
            onBack={() => {
              setSavedFilePath(null);
              goToStep(2);
            }}
          />
        )}
      </StepErrorBoundary>
    </>
  );
}
