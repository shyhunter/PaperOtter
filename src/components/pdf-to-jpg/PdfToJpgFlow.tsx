import { useState, useCallback, useEffect, useRef } from 'react';
import { getFileName } from '@/lib/fileValidation';
import { readFile, writeFile } from '@tauri-apps/plugin-fs';
import { encryptedPdfRefusal } from '@/lib/pdfEncryption';
import { tempDir, join } from '@tauri-apps/api/path';
import { open } from '@/lib/dialog';
import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import { FileUp, Loader2, CheckSquare, Square } from 'lucide-react';
import { SaveStep } from '@/components/SaveStep';
import { StepErrorBoundary } from '@/components/ErrorBoundary';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToolContext } from '@/context/ToolContext';
import { cn } from '@/lib/utils';
import { friendlyPdfError } from '@/lib/pdfUtils';
import { LazyPageThumbnail } from '@/components/shared/LazyPageThumbnail';
import { convertDocument, checkSidecarAvailability } from '@/lib/documentConverter';
import type { MultiFileOutput } from '@/components/SaveStep';
import type { ConvertFormat } from '@/types/converter';
import { plural, t } from '@/i18n';
import { usePdfDocument } from '@/hooks/usePdfDocument';

// Worker setup — must match pdfThumbnail.ts
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

type ImageFormat = 'jpeg' | 'png';
type OutputFormat = ImageFormat | 'docx' | 'epub' | 'mobi' | 'azw3';

interface FormatOption {
  value: OutputFormat;
  label: string;
  group: 'image' | 'document' | 'ebook';
  engine?: 'libreoffice' | 'calibre';
}

/**
 * A function, not a constant: these labels are translated, and a module-level
 * constant resolves them once at import -- before the locale is known.
 */
function formatOptions(): FormatOption[] {
  return [
    { value: 'jpeg', label: 'JPG', group: 'image' },
    { value: 'png', label: 'PNG', group: 'image' },
    { value: 'docx', label: t('pdfToJpgFlow.word'), group: 'document', engine: 'libreoffice' },
    { value: 'epub', label: 'EPUB', group: 'ebook', engine: 'calibre' },
    { value: 'mobi', label: 'MOBI', group: 'ebook', engine: 'calibre' },
    { value: 'azw3', label: t('pdfToJpgFlow.kindle'), group: 'ebook', engine: 'calibre' },
  ];
}

type ScaleOption = { label: string; dpiLabel: string; scale: number };

const SCALE_OPTIONS: ScaleOption[] = [
  { label: '1x', dpiLabel: '72 dpi', scale: 1 },
  { label: '2x', dpiLabel: '150 dpi', scale: 2 },
  { label: '3x', dpiLabel: '300 dpi', scale: 3 },
];

function isImageFormat(fmt: OutputFormat): fmt is ImageFormat {
  return fmt === 'jpeg' || fmt === 'png';
}

/**
 * Render selected pages of a PDF to image blobs.
 * CRITICAL: uses pdfBytes.slice() to avoid buffer detachment under StrictMode.
 */
async function renderSelectedPagesToBlobs(
  pdfBytes: Uint8Array,
  pageIndices: number[],
  scale: number,
  format: ImageFormat,
  quality: number,
  onProgress?: (current: number, total: number) => void,
): Promise<Uint8Array[]> {
  const loadingTask = pdfjsLib.getDocument({ data: pdfBytes.slice() });
  const doc = await loadingTask.promise;

  try {
    const results: Uint8Array[] = [];

    for (let i = 0; i < pageIndices.length; i++) {
      const pageNum = pageIndices[i] + 1; // pdf.js is 1-indexed
      onProgress?.(i + 1, pageIndices.length);
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

/**
 * Extract selected pages from a PDF into a new PDF document.
 * Returns the bytes of the new document.
 */
async function extractPages(
  pdfBytes: Uint8Array,
  pageIndices: number[],
): Promise<Uint8Array> {
  const srcDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const newDoc = await PDFDocument.create();

  const copiedPages = await newDoc.copyPages(srcDoc, pageIndices);
  for (const page of copiedPages) {
    newDoc.addPage(page);
  }

  return newDoc.save({ useObjectStreams: false });
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
  const ext = format === 'jpeg' ? 'jpg' : format;
  if (totalPages === 1) return `${base}.${ext}`;
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
  // One document for the whole grid. Each tile used to parse the file itself.
  const pdfDoc = usePdfDocument(pdfBytes);
  const [pageCount, setPageCount] = useState(0);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Page selection
  const [selectedPages, setSelectedPages] = useState<Set<number>>(new Set());

  // Output options
  const [outputFormat, setOutputFormat] = useState<OutputFormat>('jpeg');
  const [quality, setQuality] = useState(85);
  const [scaleIndex, setScaleIndex] = useState(1); // default 2x

  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processProgress, setProcessProgress] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [processError, setProcessError] = useState<string | null>(null);
  const [multiOutputs, setMultiOutputs] = useState<MultiFileOutput[] | null>(null);
  const [singleOutput, setSingleOutput] = useState<Uint8Array | null>(null);
  const [savedFilePath, setSavedFilePath] = useState<string | null>(null);

  // Sidecar availability
  const [sidecarAvail, setSidecarAvail] = useState<{ libreoffice: boolean; calibre: boolean } | null>(null);

  // StrictMode guard
  const consumedPending = useRef(false);

  // Consume pending file on mount
  // Captured into a ref on the first render, never recomputed. StrictMode renders
  // twice; deriving this from `consumedPending` — which the first pass flips —
  // left the second pass with null, and the mount effect closes over the second
  // pass. That is how a dropped file reached the flow and was still never opened.
  const capturedPending = useRef<string | null>(null);
  if (capturedPending.current === null && pendingFiles.length > 0) {
    capturedPending.current = pendingFiles[0];
  }
  const initialFile = capturedPending.current;
  if (!consumedPending.current && pendingFiles.length > 0) {
    consumedPending.current = true;
    setPendingFiles([]);
  }

  // Check sidecar availability once
  useEffect(() => {
    checkSidecarAvailability().then(setSidecarAvail).catch(() => {
      setSidecarAvail({ libreoffice: false, calibre: false });
    });
  }, []);

  const loadFile = useCallback(async (path: string) => {
    setIsLoadingFile(true);
    setLoadError(null);
    try {
      const bytes = await readFile(path);
      // A locked PDF loads fine under `ignoreEncryption` and reports its real
      // page count, so without this the tool opens and then renders nothing.
      const refusal = await encryptedPdfRefusal(bytes);
      if (refusal) { setLoadError(refusal); return; }
      const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const pages = doc.getPageCount();

      const name = getFileName(path);
      setFilePath(path);
      setFileName(name);
      const pdfBytesArray = new Uint8Array(bytes);
      setPdfBytes(pdfBytesArray);
      setPageCount(pages);

      // Select all pages by default
      const allPages = new Set<number>();
      for (let i = 0; i < pages; i++) allPages.add(i);
      setSelectedPages(allPages);

      goToStep(1);
    } catch (err) {
      setLoadError(friendlyPdfError(err));
    } finally {
      setIsLoadingFile(false);
    }
  }, [goToStep]);

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
        filters: [{ name: t('filter.pdfFiles'), extensions: ['pdf'] }],
      });
      if (!result) return;
      await loadFile(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : t('app.couldNotOpenFilePicker');
      setLoadError(message);
    }
  }, [loadFile]);

  // Page selection handlers
  const handleTogglePage = useCallback((index: number) => {
    setSelectedPages((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    if (selectedPages.size === pageCount) {
      setSelectedPages(new Set());
    } else {
      const all = new Set<number>();
      for (let i = 0; i < pageCount; i++) all.add(i);
      setSelectedPages(all);
    }
  }, [selectedPages.size, pageCount]);

  const sortedSelectedPages = Array.from(selectedPages).sort((a, b) => a - b);

  const handleConvert = useCallback(async () => {
    if (!pdfBytes || sortedSelectedPages.length === 0) return;
    setIsProcessing(true);
    setProcessError(null);
    setProcessProgress(null);
    setSingleOutput(null);
    setMultiOutputs(null);

    try {
      if (isImageFormat(outputFormat)) {
        // Image conversion: render selected pages
        const scale = SCALE_OPTIONS[scaleIndex].scale;
        const blobs = await renderSelectedPagesToBlobs(
          pdfBytes,
          sortedSelectedPages,
          scale,
          outputFormat,
          quality,
          (current, total) => {
            setProcessProgress(t('pdfToJpgFlow.renderingPageOf', { current, total }));
          },
        );

        const outputs: MultiFileOutput[] = blobs.map((bytes, i) => ({
          fileName: buildOutputFileName(fileName, sortedSelectedPages[i] + 1, pageCount, outputFormat),
          bytes,
        }));

        setMultiOutputs(outputs);
        goToStep(2);
      } else {
        // Document/ebook conversion: extract selected pages → temp PDF → convert
        setProcessProgress(t('pdfToJpgFlow.extractingSelectedPages'));
        const extractedPdf = await extractPages(pdfBytes, sortedSelectedPages);

        // Write to temp file for converter
        const tmpBase = await tempDir();
        const ts = Date.now();
        const tempPath = await join(tmpBase, `papercut_convert_${ts}.pdf`);
        await writeFile(tempPath, extractedPdf);

        setProcessProgress(t('pdfToJpgFlow.convertingTo', { format: outputFormat.toUpperCase() }));
        const result = await convertDocument(tempPath, 'pdf', { outputFormat: outputFormat as ConvertFormat });

        // Clean up temp file
        import('@tauri-apps/plugin-fs').then(m => m.remove(tempPath).catch(() => {}));

        setSingleOutput(result.outputBytes);
        goToStep(2);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : t('pdfToJpgFlow.conversionFailed');
      setProcessError(message);
    } finally {
      setIsProcessing(false);
      setProcessProgress(null);
    }
  }, [pdfBytes, sortedSelectedPages, outputFormat, scaleIndex, quality, fileName, pageCount, goToStep]);

  const showQualitySlider = outputFormat === 'jpeg';
  const showScaleOptions = isImageFormat(outputFormat);
  const allSelected = selectedPages.size === pageCount;

  // Check if selected format's engine is available
  const selectedFormatOption = formatOptions().find(f => f.value === outputFormat);
  const engineUnavailable = selectedFormatOption?.engine
    ? sidecarAvail && !sidecarAvail[selectedFormatOption.engine]
    : false;

  const defaultSaveName = isImageFormat(outputFormat)
    ? fileName.replace(/\.pdf$/i, '') + '-pages'
    : fileName.replace(/\.pdf$/i, '') + '.' + outputFormat;

  return (
    <>
      <StepErrorBoundary stepName="PDF to Image">
        {/* Step 0: Pick file */}
        {step === 0 && (
          <div className="flex flex-1 flex-col items-center justify-center p-6">
            <div className="w-full max-w-sm space-y-4 text-center">
              <h2 className="text-lg font-semibold text-foreground">{t('pdfToJpg.convertPdf')}</h2>
              <p className="text-sm text-muted-foreground">{t('pdfToJpg.convertPdfPagesToImages')}</p>

              {loadError && (
                <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3">
                  <p className="text-xs text-destructive">{loadError}</p>
                </div>
              )}

              <Button data-testid="open-file-btn" onClick={handleSelectFile} disabled={isLoadingFile} className="w-full">
                {isLoadingFile ? (
                  <>
                    <Loader2 className="w-4 h-4 me-2 animate-spin" />
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

        {/* Step 1: Configure */}
        {step === 1 && pdfBytes && (
          <div ref={scrollContainerRef} className="flex flex-1 flex-col overflow-y-auto p-6 min-h-0">
            <div className="w-full max-w-2xl mx-auto space-y-4">
              {/* File info */}
              <div className="text-center">
                <p className="text-sm font-medium text-foreground truncate">{fileName}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {plural('count.page', pageCount)}
                  {selectedPages.size < pageCount && (
                    <span className="ms-1 text-primary font-medium">
                      {t('pdfToJpgFlow.nSelectedParens', { count: selectedPages.size })}
                    </span>
                  )}
                </p>
              </div>

              {/* Output format */}
              <div className="rounded-lg border border-border bg-card p-4 space-y-3">
                <p className="text-xs text-muted-foreground">{t('imageConfigure.outputFormat')}</p>
                <div className="flex flex-wrap gap-1">
                  {formatOptions().map((fmt) => {
                    const unavailable = fmt.engine && sidecarAvail && !sidecarAvail[fmt.engine];
                    return (
                      <button
                        key={fmt.value}
                        type="button"
                        onClick={() => setOutputFormat(fmt.value)}
                        disabled={isProcessing || !!unavailable}
                        title={unavailable ? t('pdfToJpgFlow.engineNotInstalled', { engine: fmt.engine === 'libreoffice' ? t('pdfToJpgFlow.libreoffice') : t('pdfToJpgFlow.calibre') }) : fmt.label}
                        className={cn(
                          'rounded-md border px-3 py-1.5 text-xs font-medium transition-colors',
                          'disabled:cursor-not-allowed disabled:opacity-40',
                          outputFormat === fmt.value
                            ? 'border-primary bg-primary/5 text-foreground'
                            : 'border-border text-muted-foreground hover:border-primary/50',
                        )}
                      >
                        {fmt.label}
                      </button>
                    );
                  })}
                </div>

                {engineUnavailable && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    {t('pdfToJpgFlow.engineNotInstalledHint', { engine: selectedFormatOption?.engine === 'libreoffice' ? t('pdfToJpgFlow.libreoffice') : t('pdfToJpgFlow.calibre') })}
                  </p>
                )}

                {/* Quality slider (JPG only) */}
                {showQualitySlider && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs text-muted-foreground">{t('common.quality')}</label>
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
                      aria-label={t('imageConfigure.quality')}
                      className="w-full accent-primary disabled:opacity-50"
                    />
                  </div>
                )}

                {/* Scale / DPI (image formats only) */}
                {showScaleOptions && (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">{t('pdfToJpg.resolution')}</p>
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
                )}
              </div>

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
                    setSelectedPages(new Set());
                  }}
                  disabled={isProcessing}
                  className="flex-none"
                >
                  {t('common.back')}
                </Button>
                <Button
                  size="sm"
                  data-testid="apply-btn"
                  onClick={handleConvert}
                  disabled={isProcessing || selectedPages.size === 0 || !!engineUnavailable}
                  className="flex-1"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-4 h-4 me-2 animate-spin" />
                      {processProgress ?? t('convertImage.converting')}
                    </>
                  ) : (
                    selectedPages.size < pageCount
                      ? t('pdfToJpgFlow.convertNPages', { pages: selectedPages.size })
                      : t('pdfToJpg.convertPdf')
                  )}
                </Button>
              </div>

              {/* Error */}
              {processError && (
                <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {processError}
                </p>
              )}

              {/* Page selection thumbnails */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t('pdfToJpg.selectPages')}</p>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={handleSelectAll} className="h-7 text-xs">
                      {allSelected ? (
                        <><Square className="w-3 h-3 me-1" /> {t('pdfToJpg.deselectAll')}</>
                      ) : (
                        <><CheckSquare className="w-3 h-3 me-1" /> {t('pdfToJpg.selectAll')}</>
                      )}
                    </Button>
                    {selectedPages.size > 0 && selectedPages.size < pageCount && (
                      <Badge variant="secondary" className="text-xs">
                        {t('pdfToJpgFlow.nSelected', { count: selectedPages.size })}
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Each thumbnail renders lazily as it scrolls into view */}
                <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-2">
                  {Array.from({ length: pageCount }, (_, i) => {
                    const isSelected = selectedPages.has(i);
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => handleTogglePage(i)}
                        className={cn(
                          'relative aspect-[3/4] rounded-md border overflow-hidden cursor-pointer transition-all',
                          isSelected
                            ? 'border-primary ring-2 ring-primary/30'
                            : 'border-border hover:border-primary/50 opacity-50',
                        )}
                      >
                        <LazyPageThumbnail
                          doc={pdfDoc}
                          pageIndex={i}
                          scale={0.25}
                          scrollContainerRef={scrollContainerRef}
                          className="w-full h-full bg-muted/30"
                          canvasClassName="w-full h-full object-contain"
                        />
                        <span className="absolute bottom-0 start-0 end-0 bg-black/60 text-white text-[9px] text-center py-0.5">
                          {i + 1}
                        </span>
                        {/* Selection indicator */}
                        <span className={cn(
                          'absolute top-0.5 start-0.5 w-3.5 h-3.5 rounded-sm border flex items-center justify-center text-[9px] transition-colors',
                          isSelected
                            ? 'bg-primary border-primary text-primary-foreground'
                            : 'bg-background/70 border-border text-transparent',
                        )}>
                          {isSelected && '✓'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Save */}
        {step === 2 && (multiOutputs || singleOutput) && (
          <SaveStep
            processedBytes={singleOutput ?? multiOutputs?.[0]?.bytes ?? new Uint8Array()}
            sourceFileName={fileName}
            defaultSaveName={defaultSaveName}
            multiFileOutputs={multiOutputs ?? undefined}
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
