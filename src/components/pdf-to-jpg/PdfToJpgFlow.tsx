import { useState, useCallback, useEffect, useRef } from 'react';
import { readFile } from '@tauri-apps/plugin-fs';
import { open } from '@tauri-apps/plugin-dialog';
import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import { FileUp, Loader2 } from 'lucide-react';
import { SaveStep } from '@/components/SaveStep';
import { StepErrorBoundary } from '@/components/ErrorBoundary';
import { Button } from '@/components/ui/button';
import { useToolContext } from '@/context/ToolContext';
import { cn } from '@/lib/utils';
import type { MultiFileOutput } from '@/components/SaveStep';

// Worker setup — must match pdfThumbnail.ts
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

type OutputFormat = 'jpeg' | 'png';
type ScaleOption = { label: string; dpiLabel: string; scale: number };

const SCALE_OPTIONS: ScaleOption[] = [
  { label: '1x', dpiLabel: '72 dpi', scale: 1 },
  { label: '2x', dpiLabel: '150 dpi', scale: 2 },
  { label: '3x', dpiLabel: '300 dpi', scale: 3 },
];

/**
 * Render all pages of a PDF to image blobs in a single document open.
 * CRITICAL: uses pdfBytes.slice() to avoid buffer detachment under StrictMode.
 */
async function renderAllPagesToBlobs(
  pdfBytes: Uint8Array,
  pageCount: number,
  scale: number,
  format: OutputFormat,
  quality: number,
  onProgress?: (current: number, total: number) => void,
): Promise<Uint8Array[]> {
  const loadingTask = pdfjsLib.getDocument({ data: pdfBytes.slice() });
  const doc = await loadingTask.promise;

  try {
    const results: Uint8Array[] = [];

    for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
      onProgress?.(pageNum, pageCount);
      const page = await doc.getPage(pageNum);
      const viewport = page.getViewport({ scale });

      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;

      await page.render({ canvas, viewport }).promise;

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('Canvas to blob failed'))),
          format === 'jpeg' ? 'image/jpeg' : 'image/png',
          format === 'jpeg' ? quality / 100 : undefined,
        );
      });

      results.push(new Uint8Array(await blob.arrayBuffer()));
    }

    return results;
  } finally {
    doc.destroy();
  }
}

function padPageNumber(pageNum: number, totalPages: number): string {
  const digits = String(totalPages).length;
  return String(pageNum).padStart(digits, '0');
}

function buildOutputFileName(
  sourceFileName: string,
  pageNum: number,
  totalPages: number,
  format: OutputFormat,
): string {
  const base = sourceFileName.replace(/\.pdf$/i, '');
  const ext = format === 'jpeg' ? 'jpg' : 'png';
  return `${base}-page-${padPageNumber(pageNum, totalPages)}.${ext}`;
}

interface PdfToJpgFlowProps {
  onStepChange?: (step: number) => void;
}

export function PdfToJpgFlow({ onStepChange }: PdfToJpgFlowProps) {
  const { pendingFiles, setPendingFiles } = useToolContext();
  const [step, setStep] = useState(0);

  const goToStep = useCallback((s: number) => {
    setStep(s);
    onStepChange?.(s);
  }, [onStepChange]);
  const [_filePath, setFilePath] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [outputFormat, setOutputFormat] = useState<OutputFormat>('jpeg');
  const [quality, setQuality] = useState(85);
  const [scaleIndex, setScaleIndex] = useState(1); // default 2x
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processProgress, setProcessProgress] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [processError, setProcessError] = useState<string | null>(null);
  const [multiOutputs, setMultiOutputs] = useState<MultiFileOutput[] | null>(null);
  const [savedFilePath, setSavedFilePath] = useState<string | null>(null);

  // StrictMode guard
  const consumedPending = useRef(false);

  // Consume pending file on mount
  const initialFile = (!consumedPending.current && pendingFiles.length > 0) ? pendingFiles[0] : null;
  if (!consumedPending.current && pendingFiles.length > 0) {
    consumedPending.current = true;
    setPendingFiles([]);
  }

  const loadFile = useCallback(async (path: string) => {
    setIsLoadingFile(true);
    setLoadError(null);
    try {
      const bytes = await readFile(path);
      const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const pages = doc.getPageCount();

      const name = path.split('/').pop() ?? path.split('\\').pop() ?? path;
      setFilePath(path);
      setFileName(name);
      setPdfBytes(new Uint8Array(bytes));
      setPageCount(pages);
      goToStep(1);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load PDF.';
      setLoadError(message);
    } finally {
      setIsLoadingFile(false);
    }
  }, []);

  // Auto-load initial file
  useEffect(() => {
    if (initialFile) {
      loadFile(initialFile);
    }
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

  const handleConvert = useCallback(async () => {
    if (!pdfBytes || pageCount === 0) return;
    setIsProcessing(true);
    setProcessError(null);
    setProcessProgress(null);

    try {
      const scale = SCALE_OPTIONS[scaleIndex].scale;
      const blobs = await renderAllPagesToBlobs(
        pdfBytes,
        pageCount,
        scale,
        outputFormat,
        quality,
        (current, total) => {
          setProcessProgress(`Rendering page ${current} of ${total}...`);
        },
      );

      const outputs: MultiFileOutput[] = blobs.map((bytes, i) => ({
        fileName: buildOutputFileName(fileName, i + 1, pageCount, outputFormat),
        bytes,
      }));

      setMultiOutputs(outputs);
      goToStep(2);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Conversion failed.';
      setProcessError(message);
    } finally {
      setIsProcessing(false);
      setProcessProgress(null);
    }
  }, [pdfBytes, pageCount, scaleIndex, outputFormat, quality, fileName]);

  const showQualitySlider = outputFormat === 'jpeg';

  return (
    <>
      <StepErrorBoundary stepName="PDF to Image">
        {/* Step 0: Pick file */}
        {step === 0 && (
          <div className="flex flex-1 flex-col items-center justify-center p-6">
            <div className="w-full max-w-sm space-y-4 text-center">
              <h2 className="text-lg font-semibold text-foreground">PDF to Image</h2>
              <p className="text-sm text-muted-foreground">Export each page of a PDF as a JPG or PNG image.</p>

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

        {/* Step 1: Configure */}
        {step === 1 && (
          <div className="flex flex-1 flex-col items-center overflow-y-auto p-6">
            <div className="w-full max-w-md space-y-4 my-auto">
              {/* File info */}
              <div className="text-center">
                <p className="text-sm font-medium text-foreground truncate">{fileName}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {pageCount} page{pageCount !== 1 ? 's' : ''}
                </p>
              </div>

              {/* Output format */}
              <div className="rounded-lg border border-border bg-card p-4 space-y-3">
                <p className="text-xs text-muted-foreground">Output format</p>
                <div className="grid grid-cols-2 gap-1">
                  {(['jpeg', 'png'] as OutputFormat[]).map((fmt) => (
                    <button
                      key={fmt}
                      type="button"
                      onClick={() => setOutputFormat(fmt)}
                      disabled={isProcessing}
                      className={cn(
                        'rounded-md border px-3 py-1.5 text-xs font-medium transition-colors',
                        'disabled:cursor-not-allowed disabled:opacity-50',
                        outputFormat === fmt
                          ? 'border-primary bg-primary/5 text-foreground'
                          : 'border-border text-muted-foreground hover:border-primary/50',
                      )}
                    >
                      {fmt === 'jpeg' ? 'JPG' : 'PNG'}
                    </button>
                  ))}
                </div>

                {/* Quality slider (JPG only) */}
                {showQualitySlider && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs text-muted-foreground">Quality</label>
                      <span className="text-xs font-medium text-foreground tabular-nums">{quality}%</span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="100"
                      step="1"
                      value={quality}
                      onChange={(e) => setQuality(Number(e.target.value))}
                      disabled={isProcessing}
                      aria-label="Image quality"
                      className="w-full accent-primary disabled:opacity-50"
                    />
                  </div>
                )}
              </div>

              {/* Scale / DPI */}
              <div className="rounded-lg border border-border bg-card p-4 space-y-3">
                <p className="text-xs text-muted-foreground">Resolution</p>
                <div className="grid grid-cols-3 gap-1">
                  {SCALE_OPTIONS.map((opt, idx) => (
                    <button
                      key={opt.label}
                      type="button"
                      onClick={() => setScaleIndex(idx)}
                      disabled={isProcessing}
                      className={cn(
                        'rounded-md border px-3 py-1.5 text-xs font-medium transition-colors',
                        'disabled:cursor-not-allowed disabled:opacity-50',
                        scaleIndex === idx
                          ? 'border-primary bg-primary/5 text-foreground'
                          : 'border-border text-muted-foreground hover:border-primary/50',
                      )}
                    >
                      <span className="block">{opt.label}</span>
                      <span className="block text-[10px] opacity-60">{opt.dpiLabel}</span>
                    </button>
                  ))}
                </div>
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
                    setPdfBytes(null);
                    setPageCount(0);
                  }}
                  disabled={isProcessing}
                  className="flex-none"
                >
                  Back
                </Button>
                <Button
                  size="sm"
                  onClick={handleConvert}
                  disabled={isProcessing}
                  className="flex-1"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      {processProgress ?? 'Converting...'}
                    </>
                  ) : (
                    'Convert'
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Save */}
        {step === 2 && multiOutputs && (
          <SaveStep
            processedBytes={multiOutputs[0]?.bytes ?? new Uint8Array()}
            sourceFileName={fileName}
            defaultSaveName={fileName.replace(/\.pdf$/i, '') + '-pages'}
            multiFileOutputs={multiOutputs}
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
