// PageNumbersFlow: Orchestrates the page-numbers tool flow — Pick → Configure → Save.
import { useState, useCallback } from 'react';
import { getFileName } from '@/lib/fileValidation';
import { readFile } from '@tauri-apps/plugin-fs';
import { encryptedPdfRefusal } from '@/lib/pdfEncryption';
import { PDFDocument } from 'pdf-lib';
import { PageNumbersConfigureStep } from './PageNumbersConfigureStep';
import { SaveStep } from '@/components/SaveStep';
import { StepErrorBoundary } from '@/components/ErrorBoundary';
import { friendlyPdfError } from '@/lib/pdfUtils';
import { addPageNumbers } from '@/lib/pdfPageNumbers';
import type { PageNumberOptions } from '@/lib/pdfPageNumbers';
import { t } from '@/i18n';
import { FilePickStep } from '@/components/FilePickStep';

interface PageNumbersFlowProps {
  onStepChange?: (step: number) => void;
}

export function PageNumbersFlow({ onStepChange }: PageNumbersFlowProps) {
  const [step, setStep] = useState(0);
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [processedBytes, setProcessedBytes] = useState<Uint8Array | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [fileName, setFileName] = useState('');
  // The file this flow opened. Save writes back to it; Save as... writes a copy.
  const [sourcePath, setSourcePath] = useState<string | null>(null);
  const [savedFilePath, setSavedFilePath] = useState<string | null>(null);
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const goToStep = useCallback((s: number) => {
    setStep(s);
    onStepChange?.(s);
  }, [onStepChange]);


  const loadFile = useCallback(async (filePath: string) => {
    setIsLoadingFile(true);
    setLoadError(null);
    try {
      const bytes = await readFile(filePath);
      // A locked PDF loads fine under `ignoreEncryption` and reports its real
      // page count, so without this the tool opens and then renders nothing.
      const refusal = await encryptedPdfRefusal(bytes);
      if (refusal) { setLoadError(refusal); return; }
      const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const pages = doc.getPageCount();
      const name = getFileName(filePath);
      setPdfBytes(bytes);
      setPageCount(pages);
      setFileName(name);
      setSourcePath(filePath);
      goToStep(1);
    } catch (err) {
      setLoadError(friendlyPdfError(err));
    } finally {
      setIsLoadingFile(false);
    }
  }, [goToStep]);

  // Auto-load initial file on mount



  const handleApply = useCallback(async (options: PageNumberOptions) => {
    if (!pdfBytes) return;
    setIsProcessing(true);
    try {
      const result = await addPageNumbers(pdfBytes, options);
      setProcessedBytes(result);
      goToStep(2);
    } catch (err) {
      const message = err instanceof Error ? err.message : t('pageNumbersFlow.failedToAddPageNumbers');
      setLoadError(message);
    } finally {
      setIsProcessing(false);
    }
  }, [pdfBytes, goToStep]);

  return (
    <>
      <StepErrorBoundary stepName="Page Numbers">
        {/* Step 0: Pick file */}
        {step === 0 && (
          <FilePickStep
            acceptedFormats={['pdf']}
            tagline={t('pageNumbers.selectAPdfToAdd')}
            onFileReady={loadFile}
            isLoading={isLoadingFile}
            error={loadError}
          />
        )}

        {/* Step 1: Configure page numbers */}
        {step === 1 && pdfBytes && (
          <PageNumbersConfigureStep
            pdfBytes={pdfBytes}
            pageCount={pageCount}
            onApply={handleApply}
            onBack={() => goToStep(0)}
            isProcessing={isProcessing}
            error={loadError}
          />
        )}

        {/* Step 2: Save */}
        {step === 2 && processedBytes && (
          <SaveStep
            sourcePath={sourcePath}
            processedBytes={processedBytes}
            sourceFileName={fileName}
            defaultSaveName={fileName.replace(/\.pdf$/i, '') + '-numbered.pdf'}
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
