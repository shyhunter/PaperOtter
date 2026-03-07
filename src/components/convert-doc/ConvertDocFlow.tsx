import { useState, useCallback, useEffect, useRef } from 'react';
import { ConvertPickStep } from '@/components/convert-doc/ConvertPickStep';
import { ConvertConfigStep } from '@/components/convert-doc/ConvertConfigStep';
import { ConvertCompareStep } from '@/components/convert-doc/ConvertCompareStep';
import { SaveStep } from '@/components/SaveStep';
import { StepErrorBoundary } from '@/components/ErrorBoundary';
import { useToolContext } from '@/context/ToolContext';
import { getFileName } from '@/lib/fileValidation';
import type { ConvertFormat, ConvertResult } from '@/types/converter';

function buildSaveName(sourceFileName: string, outputFormat: ConvertFormat): string {
  const base = sourceFileName.replace(/\.[^.]+$/, '');
  return `${base}-converted.${outputFormat}`;
}

function buildSaveFilters(outputFormat: ConvertFormat): Array<{ name: string; extensions: string[] }> {
  const labels: Record<ConvertFormat, string> = {
    pdf: 'PDF Document',
    docx: 'Word Document',
    doc: 'Word 97-2003 Document',
    odt: 'OpenDocument Text',
    epub: 'EPUB Ebook',
    mobi: 'MOBI Ebook',
    azw3: 'AZW3 Ebook',
    txt: 'Plain Text',
    rtf: 'Rich Text Format',
  };
  return [{ name: labels[outputFormat] ?? outputFormat.toUpperCase(), extensions: [outputFormat] }];
}

export function ConvertDocFlow() {
  const { pendingFiles, setPendingFiles } = useToolContext();
  const [step, setStep] = useState(0);
  const [filePath, setFilePath] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [sourceFormat, setSourceFormat] = useState<ConvertFormat>('pdf');
  const [convertResult, setConvertResult] = useState<ConvertResult | null>(null);
  const [savedFilePath, setSavedFilePath] = useState<string | null>(null);

  // StrictMode guard for pending files
  const consumedPending = useRef(false);
  const initialFile = (!consumedPending.current && pendingFiles.length > 0) ? pendingFiles[0] : null;
  if (!consumedPending.current && pendingFiles.length > 0) {
    consumedPending.current = true;
    setPendingFiles([]);
  }

  // Auto-load initial file from dashboard drop
  useEffect(() => {
    if (initialFile) {
      const ext = initialFile.split('.').pop()?.toLowerCase() ?? '';
      const formatMap: Record<string, ConvertFormat> = {
        pdf: 'pdf', docx: 'docx', doc: 'doc', odt: 'odt',
        epub: 'epub', mobi: 'mobi', azw3: 'azw3', txt: 'txt', rtf: 'rtf',
      };
      const fmt = formatMap[ext];
      if (fmt) {
        setFilePath(initialFile);
        setFileName(getFileName(initialFile));
        setSourceFormat(fmt);
        setStep(1);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFilePicked = useCallback((path: string, format: ConvertFormat) => {
    setFilePath(path);
    setFileName(getFileName(path));
    setSourceFormat(format);
    setConvertResult(null);
    setSavedFilePath(null);
    setStep(1);
  }, []);

  const handleConvertComplete = useCallback((result: ConvertResult) => {
    setConvertResult(result);
    setStep(2);
  }, []);

  const handleSave = useCallback(() => {
    setStep(3);
  }, []);

  const handleStartOver = useCallback(() => {
    setFilePath(null);
    setFileName('');
    setConvertResult(null);
    setSavedFilePath(null);
    setStep(0);
  }, []);

  const handleBackFromConfig = useCallback(() => {
    setFilePath(null);
    setFileName('');
    setConvertResult(null);
    setStep(0);
  }, []);

  return (
    <StepErrorBoundary stepName="Convert Document">
      {/* Step 0: Pick */}
      {step === 0 && (
        <ConvertPickStep onFilePicked={handleFilePicked} />
      )}

      {/* Step 1: Configure */}
      {step === 1 && filePath && (
        <ConvertConfigStep
          filePath={filePath}
          fileName={fileName}
          sourceFormat={sourceFormat}
          onConvertComplete={handleConvertComplete}
          onBack={handleBackFromConfig}
        />
      )}

      {/* Step 2: Compare */}
      {step === 2 && convertResult && (
        <ConvertCompareStep
          result={convertResult}
          sourceFileName={fileName}
          sourceFormat={sourceFormat}
          onSave={handleSave}
          onStartOver={handleStartOver}
        />
      )}

      {/* Step 3: Save */}
      {step === 3 && convertResult && (
        <SaveStep
          processedBytes={convertResult.outputBytes}
          sourceFileName={fileName}
          defaultSaveName={buildSaveName(fileName, convertResult.outputFormat)}
          saveFilters={buildSaveFilters(convertResult.outputFormat)}
          savedFilePath={savedFilePath}
          onDismissSaveConfirmation={() => setSavedFilePath(null)}
          onSaveComplete={(path) => setSavedFilePath(path)}
          onCancel={() => setStep(2)}
          onBack={() => {
            setSavedFilePath(null);
            setStep(2);
          }}
        />
      )}
    </StepErrorBoundary>
  );
}
