import { useState, useCallback } from 'react';
import { getFileName } from '@/lib/fileValidation';
import { readFile } from '@tauri-apps/plugin-fs';
import { encryptedPdfRefusal } from '@/lib/pdfEncryption';
import { SignatureCreateStep } from './SignatureCreateStep';
import { SignaturePlaceStep } from './SignaturePlaceStep';
import { SaveStep } from '@/components/SaveStep';
import { StepErrorBoundary } from '@/components/ErrorBoundary';
import { Button } from '@/components/ui/button';
import { t } from '@/i18n';
import { FilePickStep } from '@/components/FilePickStep';


interface SignPdfFlowProps {
  onStepChange?: (step: number) => void;
}

export function SignPdfFlow({ onStepChange }: SignPdfFlowProps) {
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



  // The picker is shared; what a tool does with the path it is handed is not.
  const handleFileReady = useCallback(async (filePath: string) => {
    setIsLoadingFile(true);
    setLoadError(null);
    try {
      const name = getFileName(filePath);
      const bytes = await readFile(filePath);
      // A locked PDF loads fine under `ignoreEncryption` and reports its real
      // page count, so without this the tool opens and then renders nothing.
      const refusal = await encryptedPdfRefusal(bytes);
      if (refusal) { setLoadError(refusal); return; }
      setFilePath(filePath);
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
          <FilePickStep
            acceptedFormats={['pdf']}
            tagline={t('signPdf.addASignatureToYour')}
            onFileReady={handleFileReady}
            isLoading={isLoadingFile}
            error={loadError}
          />
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
