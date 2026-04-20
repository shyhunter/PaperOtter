// RedactPdfFlow: Pick PDF → Redact (draw/search) → Save redacted PDF.
import { useState, useCallback, useRef, useEffect } from 'react';
import { readFile } from '@tauri-apps/plugin-fs';
import { open } from '@tauri-apps/plugin-dialog';
import { FileUp, Loader2 } from 'lucide-react';
import { SaveStep } from '@/components/SaveStep';
import { StepErrorBoundary } from '@/components/ErrorBoundary';
import { Button } from '@/components/ui/button';
import { useToolContext } from '@/context/ToolContext';
import { friendlyPdfError } from '@/lib/pdfUtils';
import { RedactStep } from './RedactStep';
import { applyRedactions } from '@/lib/pdfRedact';
import type { RedactionRect } from './RedactOverlay';

interface RedactPdfFlowProps {
  onStepChange?: (step: number) => void;
}

export function RedactPdfFlow({ onStepChange }: RedactPdfFlowProps) {
  const { pendingFiles, setPendingFiles } = useToolContext();
  const [step, setStep] = useState(0);

  const goToStep = useCallback((s: number) => {
    setStep(s);
    onStepChange?.(s);
  }, [onStepChange]);
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [fileName, setFileName] = useState('');
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processError, setProcessError] = useState<string | null>(null);
  const [processedBytes, setProcessedBytes] = useState<Uint8Array | null>(null);
  const [redactionCount, setRedactionCount] = useState(0);
  const [redactedPageCount, setRedactedPageCount] = useState(0);
  const [savedFilePath, setSavedFilePath] = useState<string | null>(null);

  // StrictMode guard for pendingFiles consumption
  const consumedRef = useRef(false);
  const initialFile = pendingFiles.length > 0 ? pendingFiles[0] : null;
  if (pendingFiles.length > 0 && !consumedRef.current) {
    consumedRef.current = true;
    setPendingFiles([]);
  }

  const loadFile = useCallback(async (filePath: string) => {
    setIsLoadingFile(true);
    setLoadError(null);
    try {
      const bytes = await readFile(filePath);
      const name = filePath.split('/').pop() ?? filePath.split('\\').pop() ?? filePath;
      setPdfBytes(bytes);
      setFileName(name);
      goToStep(1);
    } catch (err) {
      setLoadError(friendlyPdfError(err));
    } finally {
      setIsLoadingFile(false);
    }
  }, []);

  useEffect(() => {
    if (initialFile) loadFile(initialFile);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelectFile = useCallback(async () => {
    try {
      const result = await open({
        multiple: false,
        filters: [{ name: 'PDF Files', extensions: ['pdf'] }],
      });
      if (!result) return;
      await loadFile(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not open file picker.';
      setLoadError(message);
    }
  }, [loadFile]);

  const handleRedactComplete = useCallback(
    async (redactions: RedactionRect[]) => {
      if (!pdfBytes || redactions.length === 0) return;

      setIsProcessing(true);
      setProcessError(null);

      try {
        const result = await applyRedactions(pdfBytes, redactions);
        setProcessedBytes(result);
        setRedactionCount(redactions.length);

        // Count unique pages with redactions
        const uniquePages = new Set(redactions.map((r) => r.pageIndex));
        setRedactedPageCount(uniquePages.size);

        goToStep(2);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Redaction failed.';
        setProcessError(message);
      } finally {
        setIsProcessing(false);
      }
    },
    [pdfBytes],
  );

  return (
    <>
      <StepErrorBoundary stepName="Redact PDF">
        {/* Step 0: Pick file */}
        {step === 0 && (
          <div className="flex flex-1 flex-col items-center justify-center p-6">
            <div className="w-full max-w-sm space-y-4 text-center">
              <h2 className="text-lg font-semibold text-foreground">Redact PDF</h2>
              <p className="text-sm text-muted-foreground">
                Select a PDF to permanently redact sensitive content.
              </p>
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

        {/* Step 1: Redact */}
        {step === 1 && pdfBytes && (
          <>
            {isProcessing ? (
              <div className="flex flex-1 flex-col items-center justify-center p-6">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground mb-3" />
                <p className="text-sm font-medium text-foreground">Applying redactions...</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Rendering pages and removing content permanently
                </p>
              </div>
            ) : (
              <RedactStep
                pdfBytes={pdfBytes}
                onComplete={handleRedactComplete}
                onBack={() => goToStep(0)}
              />
            )}
            {processError && (
              <div className="mx-4 mb-3 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3">
                <p className="text-xs text-destructive">{processError}</p>
              </div>
            )}
          </>
        )}

        {/* Step 2: Save */}
        {step === 2 && processedBytes && (
          <div className="flex flex-1 flex-col">
            {/* Redaction info note */}
            <div className="mx-4 mt-3 space-y-2">
              <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-3">
                <p className="text-xs text-amber-800 dark:text-amber-200">
                  Redacted pages have been flattened to images. Text on those pages is no longer selectable.
                </p>
              </div>
              <p className="text-xs text-muted-foreground text-center">
                {redactionCount} redaction{redactionCount !== 1 ? 's' : ''} applied across{' '}
                {redactedPageCount} page{redactedPageCount !== 1 ? 's' : ''}
              </p>
            </div>

            <SaveStep
              processedBytes={processedBytes}
              sourceFileName={fileName}
              defaultSaveName={fileName.replace(/\.pdf$/i, '') + '-redacted.pdf'}
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
