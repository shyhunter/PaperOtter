// RotateFlow: Orchestrates the rotate tool flow — Pick → Select & Rotate → Save.
import { useState, useCallback } from 'react';
import { getFileName } from '@/lib/fileValidation';
import { readFile } from '@tauri-apps/plugin-fs';
import { encryptedPdfRefusal } from '@/lib/pdfEncryption';
import { PDFDocument } from 'pdf-lib';
import { RotateStep } from './RotateStep';
import { SaveStep } from '@/components/SaveStep';
import { StepErrorBoundary } from '@/components/ErrorBoundary';
import { friendlyPdfError } from '@/lib/pdfUtils';
import { useRotatePdfProcessor } from '@/hooks/useRotatePdfProcessor';
import type { RotationDegrees } from '@/lib/pdfRotate';
import { t } from '@/i18n';
import { FilePickStep } from '@/components/FilePickStep';

interface RotateFlowProps {
  onStepChange?: (step: number) => void;
}

export function RotateFlow({ onStepChange }: RotateFlowProps) {
  const rotateProcessor = useRotatePdfProcessor();
  const [step, setStep] = useState(0);
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [fileName, setFileName] = useState('');
  // The file this flow opened. Save writes back to it; Save as... writes a copy.
  const [sourcePath, setSourcePath] = useState<string | null>(null);
  const [savedFilePath, setSavedFilePath] = useState<string | null>(null);
  const [isLoadingFile, setIsLoadingFile] = useState(false);
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



  const handleApplied = useCallback(async (rotations: Map<number, RotationDegrees>) => {
    if (!pdfBytes) return;

    const pageRotations = Array.from(rotations.entries())
      .filter(([, r]) => r !== 0)
      .map(([pageIndex, rotation]) => ({ pageIndex, rotation }));

    await rotateProcessor.rotate(pdfBytes, pageRotations);
  }, [pdfBytes, rotateProcessor]);

  // Advance to save after rotation completes
  if (step === 1 && rotateProcessor.result && !rotateProcessor.isProcessing) {
    goToStep(2);
  }

  return (
    <>
      <StepErrorBoundary stepName="Rotate">
        {/* Step 0: Pick file */}
        {step === 0 && (
          <FilePickStep
            acceptedFormats={['pdf']}
            tagline={t('rotate.selectAPdfToRotate')}
            onFileReady={loadFile}
            isLoading={isLoadingFile}
            error={loadError}
          />
        )}

        {/* Step 1: Select & Rotate */}
        {step === 1 && pdfBytes && (
          <RotateStep
            pdfBytes={pdfBytes}
            pageCount={pageCount}
            onApplied={handleApplied}
            onBack={() => goToStep(0)}
            isProcessing={rotateProcessor.isProcessing}
          />
        )}

        {/* Step 2: Save */}
        {step === 2 && rotateProcessor.result && (
          <SaveStep
            sourcePath={sourcePath}
            processedBytes={rotateProcessor.result.bytes}
            sourceFileName={fileName}
            defaultSaveName={fileName.replace(/\.pdf$/i, '') + '-rotated.pdf'}
            savedFilePath={savedFilePath}
            onDismissSaveConfirmation={() => setSavedFilePath(null)}
            onSaveComplete={(path) => setSavedFilePath(path)}
            onCancel={() => goToStep(1)}
            onBack={() => {
              setSavedFilePath(null);
              // Clear the result first: the auto-advance above re-fires on the next
              // render while it is still set, which would bounce us back to Save.
              rotateProcessor.reset();
              goToStep(1);
            }}
          />
        )}
      </StepErrorBoundary>
    </>
  );
}
