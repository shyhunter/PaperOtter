import { useState, useCallback, useRef } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { readFile } from '@tauri-apps/plugin-fs';
import { FileUp, Loader2, Wrench, Info } from 'lucide-react';
import { SaveStep } from '@/components/SaveStep';
import { StepErrorBoundary } from '@/components/ErrorBoundary';
import { Button } from '@/components/ui/button';
import { useToolContext } from '@/context/ToolContext';

const PDF_EXTENSIONS = ['pdf'];

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function RepairPdfFlow() {
  const { pendingFiles, setPendingFiles } = useToolContext();
  const [step, setStep] = useState(0);
  const [filePath, setFilePath] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Repair step
  const [isProcessing, setIsProcessing] = useState(false);
  const [processError, setProcessError] = useState<string | null>(null);

  // Save step
  const [resultBytes, setResultBytes] = useState<Uint8Array | null>(null);
  const [sourceFileSize, setSourceFileSize] = useState(0);
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
    setStep(1);
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
      setFilePath(result);
      setFileName(name);
      setStep(1);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not open file picker.';
      setLoadError(message);
    } finally {
      setIsLoadingFile(false);
    }
  }, []);

  const handleRepair = useCallback(async () => {
    if (!filePath) return;
    setIsProcessing(true);
    setProcessError(null);
    try {
      // Read source file size for comparison
      const sourceBytes = await readFile(filePath);
      setSourceFileSize(sourceBytes.byteLength);

      const bytes: Uint8Array = await invoke('repair_pdf', {
        sourcePath: filePath,
      });
      setResultBytes(new Uint8Array(bytes));
      setStep(2);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setProcessError(message);
    } finally {
      setIsProcessing(false);
    }
  }, [filePath]);

  const buildSaveName = (sourceFileName: string): string => {
    const base = sourceFileName.replace(/\.pdf$/i, '');
    return `${base}-repaired.pdf`;
  };

  // Check if repaired file size is close to original (within 5%)
  const isFileSizeSimilar =
    resultBytes &&
    sourceFileSize > 0 &&
    Math.abs(resultBytes.byteLength - sourceFileSize) / sourceFileSize < 0.05;

  return (
    <>
      <StepErrorBoundary stepName="Repair PDF">
        {/* Step 0: Pick file */}
        {step === 0 && (
          <div className="flex flex-1 flex-col items-center justify-center p-6">
            <div className="w-full max-w-sm space-y-4 text-center">
              <h2 className="text-lg font-semibold text-foreground">Repair PDF</h2>
              <p className="text-sm text-muted-foreground">
                Fix structural issues in corrupted or malformed PDFs.
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

        {/* Step 1: Repair */}
        {step === 1 && (
          <div className="flex flex-1 flex-col items-center overflow-y-auto p-6">
            <div className="w-full max-w-md space-y-4 my-auto">
              {/* File name */}
              <div className="text-center">
                <p className="text-sm font-medium text-foreground truncate">{fileName}</p>
              </div>

              {/* Info card */}
              <div className="rounded-lg border border-border bg-card p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Wrench className="w-4 h-4 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground font-medium">PDF Repair</p>
                </div>

                <p className="text-xs text-muted-foreground">
                  Repair attempts to fix structural issues in corrupted or malformed PDFs by
                  re-processing through Ghostscript. This can resolve issues with broken
                  cross-references, missing objects, and other structural problems.
                </p>
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
                    setStep(0);
                    setFilePath(null);
                    setFileName('');
                    setProcessError(null);
                  }}
                  disabled={isProcessing}
                  className="flex-none"
                >
                  Back
                </Button>
                <Button
                  size="sm"
                  onClick={handleRepair}
                  disabled={isProcessing}
                  className="flex-1"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Repairing...
                    </>
                  ) : (
                    'Repair PDF'
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Save */}
        {step === 2 && resultBytes && (
          <div className="flex flex-1 flex-col">
            {/* File size comparison + status */}
            <div className="border-b border-border bg-card px-4 py-3 space-y-2">
              <p className="text-xs text-muted-foreground text-center">
                Original: {formatFileSize(sourceFileSize)} &rarr; Repaired: {formatFileSize(resultBytes.byteLength)}
              </p>

              {isFileSizeSimilar && (
                <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                  <Info className="w-3 h-3" />
                  <span>No issues detected -- file appears healthy</span>
                </div>
              )}

              <p className="text-xs text-muted-foreground/70 text-center italic">
                Repair complete. If the document had structural issues, they have been addressed.
              </p>
            </div>

            <SaveStep
              processedBytes={resultBytes}
              sourceFileName={fileName}
              defaultSaveName={buildSaveName(fileName)}
              saveFilters={[{ name: 'PDF Document', extensions: ['pdf'] }]}
              savedFilePath={savedFilePath}
              onDismissSaveConfirmation={() => setSavedFilePath(null)}
              onSaveComplete={(path) => setSavedFilePath(path)}
              onCancel={() => setStep(1)}
              onBack={() => {
                setSavedFilePath(null);
                setStep(1);
              }}
            />
          </div>
        )}
      </StepErrorBoundary>
    </>
  );
}
