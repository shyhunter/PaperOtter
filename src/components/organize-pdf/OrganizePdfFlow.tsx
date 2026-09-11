// OrganizePdfFlow: Pick PDF → Reorder/delete/duplicate pages → Save.
import { useState, useCallback, useEffect, useRef } from 'react';
import { getFileName } from '@/lib/fileValidation';
import { readFile } from '@tauri-apps/plugin-fs';
import { encryptedPdfRefusal } from '@/lib/pdfEncryption';
import { PDFDocument } from 'pdf-lib';
import { open } from '@/lib/dialog';
import { FileUp, ArrowUp, ArrowDown, Trash2, Copy, RotateCcw } from 'lucide-react';
import { SaveStep } from '@/components/SaveStep';
import { StepErrorBoundary } from '@/components/ErrorBoundary';
import { Button } from '@/components/ui/button';
import { useToolContext } from '@/context/ToolContext';
import { friendlyPdfError } from '@/lib/pdfUtils';
import { organizePdf } from '@/lib/pdfOrganize';
import { LazyPageThumbnail } from '@/components/shared/LazyPageThumbnail';
import { cn } from '@/lib/utils';
import { plural, t } from '@/i18n';
import { usePdfDocument } from '@/hooks/usePdfDocument';
import { OtterSpinner } from '@/components/brand/OtterSpinner';
import { PRIMARY_ACTION } from '@/components/ui/primaryAction';

interface PageEntry {
  sourceIndex: number;
  id: string;
}

let entryCounter = 0;
function nextId(): string {
  return String(++entryCounter);
}

interface OrganizePdfFlowProps {
  onStepChange?: (step: number) => void;
}

export function OrganizePdfFlow({ onStepChange }: OrganizePdfFlowProps) {
  const { pendingFiles, setPendingFiles } = useToolContext();
  const [step, setStep] = useState(0);

  const goToStep = useCallback((s: number) => {
    setStep(s);
    onStepChange?.(s);
  }, [onStepChange]);
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  // One document for the whole grid. Each tile used to parse the file itself.
  const pdfDoc = usePdfDocument(pdfBytes);
  const [originalPageCount, setOriginalPageCount] = useState(0);
  const [fileName, setFileName] = useState('');
  // The file this flow opened. Save writes back to it; Save as... writes a copy.
  const [sourcePath, setSourcePath] = useState<string | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [pages, setPages] = useState<PageEntry[]>([]);
  const [savedFilePath, setSavedFilePath] = useState<string | null>(null);
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processedBytes, setProcessedBytes] = useState<Uint8Array | null>(null);
  const [processError, setProcessError] = useState<string | null>(null);

  // StrictMode guard
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
      // A locked PDF loads fine under `ignoreEncryption` and reports its real
      // page count, so without this the tool opens and then renders nothing.
      const refusal = await encryptedPdfRefusal(bytes);
      if (refusal) { setLoadError(refusal); return; }
      const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const count = doc.getPageCount();
      const name = getFileName(filePath);
      setPdfBytes(bytes);
      setOriginalPageCount(count);
      setFileName(name);
      setSourcePath(filePath);
      setPages(Array.from({ length: count }, (_, i) => ({ sourceIndex: i, id: nextId() })));
      goToStep(1);
    } catch (err) {
      setLoadError(friendlyPdfError(err));
    } finally {
      setIsLoadingFile(false);
    }
  }, [goToStep]);

  useEffect(() => {
    if (initialFile) loadFile(initialFile);
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

  const moveUp = useCallback((index: number) => {
    if (index === 0) return;
    setPages((prev) => {
      const next = [...prev];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      return next;
    });
  }, []);

  const moveDown = useCallback((index: number) => {
    setPages((prev) => {
      if (index >= prev.length - 1) return prev;
      const next = [...prev];
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
      return next;
    });
  }, []);

  const deletePage = useCallback((index: number) => {
    setPages((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const duplicatePage = useCallback((index: number) => {
    setPages((prev) => {
      const next = [...prev];
      const entry = prev[index];
      next.splice(index + 1, 0, { sourceIndex: entry.sourceIndex, id: nextId() });
      return next;
    });
  }, []);

  const resetOrder = useCallback(() => {
    setPages(Array.from({ length: originalPageCount }, (_, i) => ({ sourceIndex: i, id: nextId() })));
  }, [originalPageCount]);

  const reverseOrder = useCallback(() => {
    setPages((prev) => [...prev].reverse());
  }, []);

  const handleApply = useCallback(async () => {
    if (!pdfBytes || pages.length === 0) return;
    setIsProcessing(true);
    setProcessError(null);
    try {
      const pageOrder = pages.map((p) => p.sourceIndex);
      const result = await organizePdf(pdfBytes, pageOrder);
      setProcessedBytes(result);
      goToStep(2);
    } catch (err) {
      const message = err instanceof Error ? err.message : t('organizePdfFlow.failedToOrganizePdf');
      setProcessError(message);
    } finally {
      setIsProcessing(false);
    }
  }, [pdfBytes, pages, goToStep]);

  return (
    <>
      <StepErrorBoundary stepName="Organize PDF">
        {/* Step 0: Pick */}
        {step === 0 && (
          <div className="flex flex-1 flex-col items-center justify-center p-6">
            <div className="w-full max-w-sm space-y-4 text-center">
              <h2 className="text-lg font-semibold text-foreground">{t('organizePdf.organizePdf')}</h2>
              <p className="text-sm text-muted-foreground">{t('organizePdf.reorderDeleteOrDuplicatePages')}</p>
              {loadError && (
                <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3">
                  <p className="text-xs text-destructive">{loadError}</p>
                </div>
              )}
              <Button data-testid="open-file-btn" onClick={handleSelectFile} disabled={isLoadingFile} className="w-full">
                {isLoadingFile ? (
                  <><OtterSpinner className="size-4" />{t('common.loading')}</>
                ) : (
                  <><FileUp className="w-4 h-4 me-2" />{t('pdfToJpg.selectPdf')}</>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Step 1: Organize pages */}
        {step === 1 && pdfBytes && (
          <div className="flex flex-1 flex-col overflow-hidden">
            {/* Toolbar */}
            <div className="border-b border-border bg-background px-4 py-2 flex items-center gap-3 flex-none">
              <span className="text-sm font-medium text-foreground">
                {plural('count.page', pages.length)}
              </span>
              <Button variant="outline" size="sm" onClick={reverseOrder} disabled={pages.length < 2}>
                {t('organizePdf.reverse')}
              </Button>
              <Button variant="outline" size="sm" onClick={resetOrder}>
                <RotateCcw className="w-3.5 h-3.5 me-1.5" />
                {t('common.reset')}
              </Button>
            </div>

            {/* Page grid — each thumbnail renders lazily as it scrolls into view */}
            <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-4 min-h-0">
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
                  {pages.map((entry, index) => (
                    <div
                      key={entry.id}
                      className="group rounded-lg border border-border bg-card overflow-hidden"
                    >
                      {/* Thumbnail */}
                      <div className="relative aspect-[3/4] bg-muted">
                        <LazyPageThumbnail
                          doc={pdfDoc}
                          pageIndex={entry.sourceIndex}
                          scale={0.3}
                          scrollContainerRef={scrollContainerRef}
                          className="w-full h-full"
                          canvasClassName="w-full h-full object-cover"
                        />
                        {/* Page number badge */}
                        <div className="absolute bottom-0 start-0 end-0 bg-black/60 px-1.5 py-0.5 text-center">
                          <span className="text-[10px] text-white font-medium">
                            {index + 1}
                            {entry.sourceIndex !== index && (
                              <span className="text-white/60 ms-0.5">(p{entry.sourceIndex + 1})</span>
                            )}
                          </span>
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center justify-center gap-0.5 p-1 bg-card">
                        <button
                          type="button"
                          onClick={() => moveUp(index)}
                          disabled={index === 0}
                          className={cn(
                            'rounded p-1 transition-colors',
                            index === 0
                              ? 'text-muted-foreground/30 cursor-not-allowed'
                              : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                          )}
                          title={t('common.moveUp')}
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveDown(index)}
                          disabled={index === pages.length - 1}
                          className={cn(
                            'rounded p-1 transition-colors',
                            index === pages.length - 1
                              ? 'text-muted-foreground/30 cursor-not-allowed'
                              : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                          )}
                          title={t('common.moveDown')}
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => duplicatePage(index)}
                          className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                          title={t('organizePdf.duplicate')}
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => deletePage(index)}
                          disabled={pages.length <= 1}
                          className={cn(
                            'rounded p-1 transition-colors',
                            pages.length <= 1
                              ? 'text-muted-foreground/30 cursor-not-allowed'
                              : 'text-destructive/70 hover:bg-destructive/10 hover:text-destructive',
                          )}
                          title={t('organizePdf.delete')}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

              {processError && (
                <div className="mt-4 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2">
                  <p className="text-xs text-destructive">{processError}</p>
                </div>
              )}
            </div>

            {/* Bottom bar */}
            <div className="border-t border-border bg-background px-4 py-3 flex items-center gap-3 flex-none">
              <Button variant="outline" size="sm" onClick={() => goToStep(0)} className="flex-none">
                {t('common.back')}
              </Button>
              <Button data-testid="apply-btn" size="sm" onClick={handleApply} disabled={isProcessing || pages.length === 0}
          className={PRIMARY_ACTION}
        >
                {isProcessing ? (
                  <><OtterSpinner className="size-4" />{t('common.processing')}</>
                ) : (
                  t('organizePdfFlow.applyPages', { pages: plural('count.page', pages.length) })
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: Save */}
        {step === 2 && processedBytes && (
          <SaveStep
            sourcePath={sourcePath}
            processedBytes={processedBytes}
            sourceFileName={fileName}
            defaultSaveName={fileName.replace(/\.pdf$/i, '') + '-organized.pdf'}
            savedFilePath={savedFilePath}
            onDismissSaveConfirmation={() => setSavedFilePath(null)}
            onSaveComplete={(path) => setSavedFilePath(path)}
            onCancel={() => goToStep(1)}
            onBack={() => { setSavedFilePath(null); goToStep(1); }}
          />
        )}
      </StepErrorBoundary>
    </>
  );
}
