import { useState, useCallback, useRef } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { readFile } from '@tauri-apps/plugin-fs';
import { FileUp, Loader2 } from 'lucide-react';
import { SignatureCreateStep } from './SignatureCreateStep';
import { SignaturePlaceStep } from './SignaturePlaceStep';
import { SaveStep } from '@/components/SaveStep';
import { StepErrorBoundary } from '@/components/ErrorBoundary';
import { Button } from '@/components/ui/button';
import { useToolContext } from '@/context/ToolContext';

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
  const [, setFilePath] = useState<string | null>(null);
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
    const name = file.split('/').pop() ?? file.split('\\').pop() ?? file;
    setFilePath(file);
    setFileName(name);
    // Read bytes will happen via effect-like pattern after render
    setIsLoadingFile(true);
    readFile(file)
      .then((bytes) => {
        setPdfBytes(new Uint8Array(bytes));
        goToStep(1);
      })
      .catch(() => {
        setLoadError('Could not read the PDF file.');
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
        filters: [{ name: 'PDF Files', extensions: PDF_EXTENSIONS }],
      });
      if (!result) {
        setIsLoadingFile(false);
        return;
      }
      const name = result.split('/').pop() ?? result.split('\\').pop() ?? result;
      const bytes = await readFile(result);
      setFilePath(result);
      setFileName(name);
      setPdfBytes(new Uint8Array(bytes));
      goToStep(1);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not open file picker.';
      setLoadError(message);
    } finally {
      setIsLoadingFile(false);
    }
  }, []);

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
              <h2 className="text-lg font-semibold text-foreground">Sign PDF</h2>
              <p className="text-sm text-muted-foreground">Add a signature to your PDF document.</p>

              {loadError && (
                <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3">
                  <p className="text-xs text-destructive">{loadError}</p>
                </div>
              )}

              <Button onClick={handleSelectFile} disabled={isLoadingFile} className="w-full">
                {isLoadingFile ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Loading...
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

        {/* Step 2: Place signature on page */}
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
            processedBytes={resultBytes}
            sourceFileName={fileName}
            defaultSaveName={buildSaveName(fileName)}
            saveFilters={[{ name: 'PDF Document', extensions: ['pdf'] }]}
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
