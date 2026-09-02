import { useState, useCallback, useRef, useEffect } from 'react';
import { open } from '@/lib/dialog';
import { listen } from '@tauri-apps/api/event';
import { FileUp, Loader2, ScanText, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { SaveStep } from '@/components/SaveStep';
import { StepErrorBoundary } from '@/components/ErrorBoundary';
import { Button } from '@/components/ui/button';
import { useToolContext } from '@/context/ToolContext';
import { ocrPdf, type OcrResult } from '@/lib/ocrProcessor';
import { getFileName, isHeicDecodable } from '@/lib/fileValidation';
import { plural, t } from '@/i18n';
import { useLocale } from '@/i18n/context';
import { listOcrLanguages, type OcrLanguage } from '@/lib/ocrLanguages';

const PDF_EXTENSIONS = ['pdf'];

interface OcrPdfFlowProps {
  onStepChange?: (step: number) => void;
}

export function OcrPdfFlow({ onStepChange }: OcrPdfFlowProps) {
  const { pendingFiles, setPendingFiles } = useToolContext();
  const locale = useLocale();
  const [step, setStep] = useState(0);

  const goToStep = useCallback((s: number) => {
    setStep(s);
    onStepChange?.(s);
  }, [onStepChange]);

  const [filePath, setFilePath] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [language, setLanguage] = useState<string>('en-US');
  // Asked of the OS rather than hardcoded: Vision reads 30 languages today and
  // the set grows between macOS releases, so a fixed list would either offer
  // something this machine cannot do or hide something it can.
  const [languages, setLanguages] = useState<OcrLanguage[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [processError, setProcessError] = useState<string | null>(null);
  const [result, setResult] = useState<OcrResult | null>(null);
  const [savedFilePath, setSavedFilePath] = useState<string | null>(null);

  const consumedPending = useRef(false);

  if (!consumedPending.current && pendingFiles.length > 0) {
    const file = pendingFiles[0];
    consumedPending.current = true;
    setPendingFiles([]);
    setFilePath(file);
    setFileName(getFileName(file));
    goToStep(1);
  }

  // Recognition can take seconds per page, so the Rust side reports which page
  // it is on. Without this a long document is indistinguishable from a hang.
  useEffect(() => {
    let cancelled = false;
    listOcrLanguages(locale).then((list) => {
      if (cancelled) return;
      setLanguages(list);
      // Prefer the language the interface is already in — someone reading a
      // German UI is far more likely to be scanning a German document.
      const match = list.find((l) => l.tag.split('-')[0] === locale.split('-')[0]);
      if (match) setLanguage(match.tag);
    });
    return () => { cancelled = true; };
  }, [locale]);

  useEffect(() => {
    const unlisten = listen<[number, number]>('ocr-progress', (event) => {
      const [index, total] = event.payload;
      setProgress({ current: index + 1, total });
    });
    return () => { void unlisten.then((fn) => fn()); };
  }, []);

  const handleSelectFile = useCallback(async () => {
    setLoadError(null);
    try {
      const picked = await open({
        multiple: false,
        filters: [{ name: t('filter.pdfFiles'), extensions: PDF_EXTENSIONS }],
      });
      if (!picked) return;
      setFilePath(picked);
      setFileName(getFileName(picked));
      goToStep(1);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    }
  }, [goToStep]);

  const handleRecognise = useCallback(async () => {
    if (!filePath) return;
    setIsProcessing(true);
    setProcessError(null);
    setProgress(null);
    try {
      setResult(await ocrPdf(filePath, { languages: [language] }));
      goToStep(2);
    } catch (err) {
      setProcessError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsProcessing(false);
      setProgress(null);
    }
  }, [filePath, language, goToStep]);

  const summary = result?.summary;

  return (
    <StepErrorBoundary stepName="Make Searchable">
      {/* Step 0 — pick */}
      {step === 0 && (
        <div className="flex flex-1 flex-col items-center justify-center p-6">
          <div className="w-full max-w-sm space-y-4 text-center">
            <h2 className="text-lg font-semibold text-foreground">{t('ocr.title')}</h2>
            <p className="text-sm text-muted-foreground">{t('ocr.intro')}</p>

            {!isHeicDecodable() && (
              <div className="rounded-md border border-amber-500/50 bg-amber-500/10 px-4 py-3">
                <p className="text-xs text-amber-700 dark:text-amber-400">{t('ocr.needsMacos')}</p>
              </div>
            )}

            {loadError && (
              <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3">
                <p className="text-xs text-destructive">{loadError}</p>
              </div>
            )}

            <Button data-testid="open-file-btn" onClick={handleSelectFile} className="w-full">
              <FileUp className="w-4 h-4 me-2" />
              {t('ocr.selectPdf')}
            </Button>
          </div>
        </div>
      )}

      {/* Step 1 — choose language and run */}
      {step === 1 && (
        <div className="flex flex-1 flex-col items-center justify-center p-6">
          <div className="w-full max-w-sm space-y-4">
            <p className="text-sm font-medium text-foreground truncate text-center">{fileName}</p>

            <div className="space-y-1.5">
              <label htmlFor="ocr-language" className="text-sm text-foreground">
                {t('ocr.language')}
              </label>
              <select
                id="ocr-language"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                disabled={isProcessing}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                {languages.map((l) => (
                  <option key={l.tag} value={l.tag}>{l.name}</option>
                ))}
              </select>
            </div>

            {processError && (
              <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3">
                <p className="text-xs text-destructive">{processError}</p>
              </div>
            )}

            {isProcessing ? (
              <div className="space-y-2 text-center">
                <Loader2 className="w-5 h-5 mx-auto animate-spin text-muted-foreground" />
                <p className="text-xs text-muted-foreground">
                  {progress
                    ? t('ocr.readingPage', { current: progress.current, total: progress.total })
                    : t('common.processing')}
                </p>
              </div>
            ) : (
              <Button data-testid="apply-btn" onClick={handleRecognise} className="w-full">
                <ScanText className="w-4 h-4 me-2" />
                {t('ocr.start')}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Step 2 — what was found. Its own step because SaveStep opens the OS
          dialog the moment it mounts, and the user needs to see how well the
          scan read *before* committing to a file. */}
      {step === 2 && result && summary && (
        <div className="flex flex-1 flex-col items-center justify-center p-6">
          <div className="w-full max-w-sm space-y-4">
            {summary.foundText ? (
              <>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600 flex-none mt-0.5" />
                  <p className="text-sm text-foreground">
                    {t('ocr.foundWords', {
                      words: plural('count.word', summary.wordCount),
                      pages: plural('count.page', summary.pageCount),
                    })}
                  </p>
                </div>

                {summary.lowConfidence && (
                  <div className="rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 space-y-1">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-600 flex-none" />
                      <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
                        {t('ocr.lowConfidence')}
                      </p>
                    </div>
                    <p className="text-xs text-amber-700/80 dark:text-amber-400/80">
                      {t('ocr.lowConfidenceHint')}
                    </p>
                  </div>
                )}

                <div className="flex gap-3">
                  <Button variant="outline" onClick={() => goToStep(1)} className="flex-none">
                    {t('common.back')}
                  </Button>
                  <Button onClick={() => goToStep(3)} className="flex-1">
                    {t('ocr.saveSearchable')}
                  </Button>
                </div>
              </>
            ) : (
              // Nothing readable is a different answer from a poor read, and
              // saying so beats handing back a "searchable" PDF with nothing in
              // it. No save is offered, because there is nothing worth saving.
              <>
                <div className="rounded-md border border-amber-500/50 bg-amber-500/10 px-4 py-3 space-y-1">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-600 flex-none" />
                    <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
                      {t('ocr.nothingFound')}
                    </p>
                  </div>
                  <p className="text-xs text-amber-700/80 dark:text-amber-400/80">
                    {t('ocr.nothingFoundHint')}
                  </p>
                </div>
                <Button variant="outline" onClick={() => goToStep(1)} className="w-full">
                  {t('common.back')}
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Step 3 — save */}
      {step === 3 && result && (
        <SaveStep
          sourcePath={filePath}
          processedBytes={result.bytes}
          sourceFileName={fileName}
          defaultSaveName={`${fileName.replace(/\.pdf$/i, '')}-searchable.pdf`}
          saveFilters={[{ name: t('filter.pdfDocument'), extensions: ['pdf'] }]}
          savedFilePath={savedFilePath}
          onDismissSaveConfirmation={() => setSavedFilePath(null)}
          onSaveComplete={setSavedFilePath}
          onCancel={() => goToStep(2)}
          onBack={() => { setSavedFilePath(null); goToStep(2); }}
        />
      )}
    </StepErrorBoundary>
  );
}
