// RedactPdfFlow: Pick PDF → Redact (draw/search) → Save redacted PDF.
import { useState, useCallback } from 'react';
import { getFileName } from '@/lib/fileValidation';
import { readFile } from '@tauri-apps/plugin-fs';
import { encryptedPdfRefusal } from '@/lib/pdfEncryption';
import { SaveStep } from '@/components/SaveStep';
import { FilePickStep } from '@/components/FilePickStep';
import { StepErrorBoundary } from '@/components/ErrorBoundary';
import { friendlyPdfError } from '@/lib/pdfUtils';
import { RedactStep } from './RedactStep';
import { applyRedactions } from '@/lib/pdfRedact';
import type { RedactionRect } from './RedactOverlay';
import { plural, t } from '@/i18n';
import { OtterLoader } from '@/components/brand/OtterLoader';

interface RedactPdfFlowProps {
  onStepChange?: (step: number) => void;
}

export function RedactPdfFlow({ onStepChange }: RedactPdfFlowProps) {
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

  // OCR reads from the file rather than the bytes already in memory, so the
  // path has to survive alongside them.
  const [sourcePath, setSourcePath] = useState<string | null>(null);

  const loadFile = useCallback(async (filePath: string) => {
    setIsLoadingFile(true);
    setLoadError(null);
    try {
      const bytes = await readFile(filePath);
      // A locked PDF loads fine under `ignoreEncryption` and reports its real
      // page count, so without this the tool opens and then renders nothing.
      const refusal = await encryptedPdfRefusal(bytes);
      if (refusal) { setLoadError(refusal); return; }
      const name = getFileName(filePath);
      setPdfBytes(bytes);
      setSourcePath(filePath);
      setFileName(name);
      goToStep(1);
    } catch (err) {
      setLoadError(friendlyPdfError(err));
    } finally {
      setIsLoadingFile(false);
    }
  }, [goToStep]);

  const handleRedactComplete = useCallback(
    async (redactions: RedactionRect[], color: string) => {
      if (!pdfBytes || redactions.length === 0) return;

      setIsProcessing(true);
      setProcessError(null);

      try {
        const result = await applyRedactions(pdfBytes, redactions, color);
        setProcessedBytes(result);
        setRedactionCount(redactions.length);

        // Count unique pages with redactions
        const uniquePages = new Set(redactions.map((r) => r.pageIndex));
        setRedactedPageCount(uniquePages.size);

        goToStep(2);
      } catch (err) {
        const message = err instanceof Error ? err.message : t('redactPdfFlow.redactionFailed');
        setProcessError(message);
      } finally {
        setIsProcessing(false);
      }
    },
    [pdfBytes, goToStep],
  );

  return (
    <>
      <StepErrorBoundary stepName="Redact PDF">
        {/* Step 0: Pick file */}
        {step === 0 && (
          <FilePickStep
            acceptedFormats={['pdf']}
            tagline={t('redactPdf.selectAPdfToPermanently')}
            onFileReady={loadFile}
            isLoading={isLoadingFile}
            error={loadError}
          />
        )}

        {/* Step 1: Redact */}
        {step === 1 && pdfBytes && (
          <>
            {isProcessing ? (
              <div className="flex flex-1 flex-col items-center justify-center p-6">
                <OtterLoader size="md" className="mb-3" />
                <p className="text-sm font-medium text-foreground">{t('redactPdf.applyingRedactions')}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {t('redactPdf.renderingPagesAndRemovingContent')}
                </p>
              </div>
            ) : (
              <RedactStep
                pdfBytes={pdfBytes}
                sourcePath={sourcePath}
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
                  {t('redactPdf.redactedPagesHaveBeenFlattened')}
                </p>
              </div>
              <p className="text-xs text-muted-foreground text-center">
                {t('redactPdf.appliedAcross', {
                  redactions: plural('count.redaction', redactionCount),
                  pages: plural('count.page', redactedPageCount),
                })}
              </p>
            </div>

            <SaveStep
              sourcePath={sourcePath}
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
