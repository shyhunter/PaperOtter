import { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  listAllOutputFormats,
  canAttemptConversion,
  requirementFor,
  detectConverters,
  getBestEngine,
  hasAnyConverter,
  getCapabilitySummary,
  convertDocument,
} from '@/lib/documentConverter';
import type {
  ConvertFormat,
  ConvertOptions,
  ConvertResult,
  ConverterAvailability,
  EpubLayout,
} from '@/types/converter';
import { t } from '@/i18n';
import { currentPlatform } from '@/lib/platform';
import { OtterSpinner } from '@/components/brand/OtterSpinner';
import { PRIMARY_ACTION } from '@/components/ui/primaryAction';

const FORMAT_LABELS: Record<ConvertFormat, string> = {
  pdf: 'PDF',
  docx: 'DOCX',
  doc: 'DOC',
  odt: 'ODT',
  epub: 'EPUB',
  mobi: 'MOBI',
  azw3: 'AZW3',
  txt: 'TXT',
  rtf: 'RTF',
  md: 'Markdown',
  html: 'HTML',
  json: 'JSON',
};

const FONT_FAMILIES = [
  'Arial',
  'Times New Roman',
  'Courier New',
  'Georgia',
  'Verdana',
];

const LINE_SPACING_OPTIONS = [
  { label: '1.0', value: 1.0 },
  { label: '1.15', value: 1.15 },
  { label: '1.5', value: 1.5 },
  { label: '2.0', value: 2.0 },
];

interface ConvertConfigStepProps {
  filePath: string;
  fileName: string;
  sourceFormat: ConvertFormat;
  onConvertComplete: (result: ConvertResult) => void;
  onBack: () => void;
}

export function ConvertConfigStep({
  filePath,
  fileName,
  sourceFormat,
  onConvertComplete,
  onBack,
}: ConvertConfigStepProps) {
  const [fontFamily, setFontFamily] = useState('Arial');
  const [fontSize, setFontSize] = useState(12);
  const [marginTop, setMarginTop] = useState(25);
  const [marginRight, setMarginRight] = useState(25);
  const [marginBottom, setMarginBottom] = useState(25);
  const [marginLeft, setMarginLeft] = useState(25);
  const [linkMargins, setLinkMargins] = useState(true);
  const [lineSpacing, setLineSpacing] = useState(1.15);
  const [epubLayout, setEpubLayout] = useState<EpubLayout>('reflowable');
  const [splitByChapter, setSplitByChapter] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processError, setProcessError] = useState<string | null>(null);

  // Converter availability detection
  const [availability, setAvailability] = useState<ConverterAvailability | null>(null);
  const [isDetecting, setIsDetecting] = useState(true);

  useEffect(() => {
    setIsDetecting(true);
    detectConverters()
      .then(setAvailability)
      .finally(() => setIsDetecting(false));
  }, []);

  // Every format worth offering, each marked with whether this machine could be
  // verified as able to produce it. Deliberately not filtered: detection can be
  // wrong (Calibre via Flatpak or Snap is invisible to a PATH lookup), and an
  // optional tool is something the user can act on. Removing the option denies a
  // capability they may have; marking it does not.
  const formatOptions = availability
    ? listAllOutputFormats(sourceFormat, availability)
    : listAllOutputFormats(sourceFormat, {
        builtin: true, textutil: false, word: false,
        libreoffice: false, calibre: false, pandoc: false, webview: false,
      });
  const availableFormats = formatOptions.map((o) => o.format);

  /** Names the kind of program a format would need, with examples to choose from. */
  const mayNeedHint = (fmt: ConvertFormat): string | undefined => {
    const req = requirementFor(fmt, sourceFormat, currentPlatform());
    if (!req) return undefined;
    const tools = req.examples.join(' / ');
    const requirement = t(
      req.kind === 'ebookConverter' ? 'convertDoc.kindEbookConverter' : 'convertDoc.kindWordProcessor',
      { tools },
    );
    return t('convertDoc.formatMayNeed', { requirement });
  };
  const verified = formatOptions.filter((o) => o.available).map((o) => o.format);

  const [outputFormat, setOutputFormat] = useState<ConvertFormat>(verified[0] ?? availableFormats[0] ?? 'pdf');

  // Update output format if current selection becomes unavailable after detection
  useEffect(() => {
    // Only correct a selection that is not offered at all. An unverified format
    // the user picked on purpose is left alone — that is the whole point.
    if (availability && !availableFormats.includes(outputFormat) && availableFormats.length > 0) {
      setOutputFormat(verified[0] ?? availableFormats[0]);
    }
  }, [availability, availableFormats, verified, outputFormat]);

  // Which engine will handle the current format
  const currentEngine = availability ? getBestEngine(outputFormat, availability, sourceFormat) : null;
  const showTypographyControls = currentEngine === 'calibre';
  const showEpubLayoutToggle = outputFormat === 'epub';
  // Splitting operates on the built-in engine's document model (per top-level heading).
  const showSplitToggle = currentEngine === 'builtin';
  // Any offered format may be attempted, including one detection could not
  // verify. Requiring currentEngine !== null here is what made the dimmed
  // formats unattemptable: getBestEngine returns null exactly when detection says
  // the tool is missing, so marking a format then disabling Convert moved the
  // dead end one step later instead of removing it.
  const canConvert = !isDetecting && !!availability && canAttemptConversion(outputFormat, formatOptions);

  // When link margins is on, propagate changes from any margin to all
  const handleMarginChange = useCallback((setter: (v: number) => void, value: number) => {
    if (linkMargins) {
      setMarginTop(value);
      setMarginRight(value);
      setMarginBottom(value);
      setMarginLeft(value);
    } else {
      setter(value);
    }
  }, [linkMargins]);

  const handleConvert = useCallback(async () => {
    setIsProcessing(true);
    setProcessError(null);
    try {
      const options: ConvertOptions = {
        outputFormat,
        fontFamily,
        fontSize,
        marginTop,
        marginRight,
        marginBottom,
        marginLeft,
        lineSpacing,
        epubLayout: outputFormat === 'epub' ? epubLayout : undefined,
        splitByChapter: showSplitToggle ? splitByChapter : undefined,
      };
      const result = await convertDocument(filePath, sourceFormat, options);
      onConvertComplete(result);
    } catch (err: unknown) {
      const message = typeof err === 'string' ? err : err instanceof Error ? err.message : t('pdfToJpgFlow.conversionFailed');
      setProcessError(message);
    } finally {
      setIsProcessing(false);
    }
  }, [filePath, sourceFormat, outputFormat, fontFamily, fontSize, marginTop, marginRight, marginBottom, marginLeft, lineSpacing, epubLayout, showSplitToggle, splitByChapter, onConvertComplete]);

  return (
    <div className="flex flex-1 flex-col min-h-0">
      <div className="flex-1 overflow-y-auto p-6 flex flex-col items-center">
      <div className="w-full max-w-md space-y-4 my-auto">
        {/* File info */}
        <div className="text-center">
          <p className="text-sm font-medium text-foreground truncate">{fileName}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t('convertConfigStep.formatNamed', { format: FORMAT_LABELS[sourceFormat] })}
          </p>
        </div>

        {/* Output format selector — only shows formats this system can produce */}
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <p className="text-xs font-medium text-muted-foreground">{t('imageConfigure.outputFormat')}</p>
          {availableFormats.length > 0 ? (
            <div className="grid grid-cols-3 gap-1.5">
              {formatOptions.map(({ format: fmt, available }) => (
                <button
                  key={fmt}
                  type="button"
                  onClick={() => setOutputFormat(fmt)}
                  disabled={isProcessing}
                  title={available ? undefined : mayNeedHint(fmt)}
                  className={cn(
                    'rounded-md border px-3 py-1.5 text-xs font-medium transition-colors',
                    'disabled:cursor-not-allowed disabled:opacity-50',
                    outputFormat === fmt
                      ? 'border-primary bg-primary/5 text-foreground'
                      : 'border-border text-muted-foreground hover:border-primary/50',
                    // Dimmed, not removed: still selectable, because detection
                    // can be wrong and only an attempt settles it.
                    !available && outputFormat !== fmt && 'opacity-60 border-dashed',
                  )}
                >
                  {FORMAT_LABELS[fmt]}
                </button>
              ))}
            </div>
          ) : (
            !isDetecting && (
              <p className="text-xs text-muted-foreground">
                {t('convertDoc.noOutputFormatsAvailableFor')}
              </p>
            )
          )}
        </div>

        {/* EPUB layout toggle */}
        {showEpubLayoutToggle && (
          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <p className="text-xs font-medium text-muted-foreground">{t('convertDoc.epubLayout')}</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setEpubLayout('reflowable')}
                disabled={isProcessing}
                className={cn(
                  'rounded-md border px-3 py-2 text-xs transition-colors',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                  epubLayout === 'reflowable'
                    ? 'border-primary bg-primary/5 text-foreground'
                    : 'border-border text-muted-foreground hover:border-primary/50',
                )}
              >
                <span className="font-medium block">{t('convertDoc.reflowable')}</span>
                <span className="text-[10px] text-muted-foreground mt-0.5 block">{t('convertDoc.textReflowsToFitScreen')}</span>
              </button>
              <button
                type="button"
                onClick={() => setEpubLayout('fixed')}
                disabled={isProcessing}
                className={cn(
                  'rounded-md border px-3 py-2 text-xs transition-colors',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                  epubLayout === 'fixed'
                    ? 'border-primary bg-primary/5 text-foreground'
                    : 'border-border text-muted-foreground hover:border-primary/50',
                )}
              >
                <span className="font-medium block">{t('convertDoc.fixedLayout')}</span>
                <span className="text-[10px] text-muted-foreground mt-0.5 block">{t('convertDoc.preservesExactPageLayout')}</span>
              </button>
            </div>
          </div>
        )}

        {/* Split option -- built-in engine only (splits at top-level headings) */}
        {showSplitToggle && (
          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <p className="text-xs font-medium text-muted-foreground">{t('convertDoc.output')}</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setSplitByChapter(false)}
                disabled={isProcessing}
                className={cn(
                  'rounded-md border px-3 py-2 text-xs transition-colors',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                  !splitByChapter
                    ? 'border-primary bg-primary/5 text-foreground'
                    : 'border-border text-muted-foreground hover:border-primary/50',
                )}
              >
                <span className="font-medium block">{t('convertDoc.wholeDocument')}</span>
                <span className="text-[10px] text-muted-foreground mt-0.5 block">{t('convertDoc.oneFile')}</span>
              </button>
              <button
                type="button"
                onClick={() => setSplitByChapter(true)}
                disabled={isProcessing}
                className={cn(
                  'rounded-md border px-3 py-2 text-xs transition-colors',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                  splitByChapter
                    ? 'border-primary bg-primary/5 text-foreground'
                    : 'border-border text-muted-foreground hover:border-primary/50',
                )}
              >
                <span className="font-medium block">{t('convertDoc.byChapter')}</span>
                <span className="text-[10px] text-muted-foreground mt-0.5 block">{t('convertConfigStep.zipOneFilePerHeading')}</span>
              </button>
            </div>
          </div>
        )}

        {/* Typography controls -- shown for Calibre-routed conversions */}
        {showTypographyControls && (
          <div className="rounded-lg border border-border bg-card p-4 space-y-4">
            <p className="text-xs font-medium text-muted-foreground">{t('convertDoc.typography')}</p>

            {/* Font family */}
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">{t('convertDoc.font')}</label>
              <select
                value={fontFamily}
                onChange={(e) => setFontFamily(e.target.value)}
                disabled={isProcessing}
                className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs text-foreground disabled:opacity-50"
              >
                {FONT_FAMILIES.map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </div>

            {/* Font size */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-xs text-muted-foreground">{t('common.fontSize')}</label>
                <span className="text-xs font-medium text-foreground tabular-nums">{fontSize}pt</span>
              </div>
              <input
                type="range"
                min="8"
                max="72"
                step="1"
                value={fontSize}
                onChange={(e) => setFontSize(Number(e.target.value))}
                disabled={isProcessing}
                className="w-full accent-primary disabled:opacity-50"
              />
            </div>

            {/* Line spacing */}
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">{t('convertDoc.lineSpacing')}</label>
              <div className="grid grid-cols-4 gap-1">
                {LINE_SPACING_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setLineSpacing(opt.value)}
                    disabled={isProcessing}
                    className={cn(
                      'rounded-md border px-2 py-1 text-xs transition-colors',
                      'disabled:cursor-not-allowed disabled:opacity-50',
                      lineSpacing === opt.value
                        ? 'border-primary bg-primary/5 text-foreground font-medium'
                        : 'border-border text-muted-foreground hover:border-primary/50',
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Margin controls -- shown for Calibre-routed conversions */}
        {showTypographyControls && (
          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground">{t('convertDoc.marginsMm')}</p>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={linkMargins}
                  onChange={(e) => setLinkMargins(e.target.checked)}
                  disabled={isProcessing}
                  className="accent-primary"
                />
                <span className="text-[10px] text-muted-foreground">{t('convertDoc.linkAll')}</span>
              </label>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: t('convertConfigStep.top'), value: marginTop, setter: setMarginTop },
                { label: t('rotate.right'), value: marginRight, setter: setMarginRight },
                { label: t('convertConfigStep.bottom'), value: marginBottom, setter: setMarginBottom },
                { label: t('rotate.left'), value: marginLeft, setter: setMarginLeft },
              ].map(({ label, value, setter }) => (
                <div key={label} className="space-y-0.5">
                  <label className="text-[10px] text-muted-foreground">{label}</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={value}
                    onChange={(e) => handleMarginChange(setter, Number(e.target.value))}
                    disabled={isProcessing}
                    className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground tabular-nums disabled:opacity-50"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Info badge showing which tool is being used (subtle, not a warning) */}
        {!isDetecting && availability && currentEngine && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted/50">
            <Info className="h-3.5 w-3.5 text-muted-foreground flex-none" />
            <span className="text-[11px] text-muted-foreground">
              {getCapabilitySummary(availability)}
            </span>
          </div>
        )}

        {/* No converter available — generic, non-pushy message */}
        {!isDetecting && availability && !hasAnyConverter(availability) && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 flex-none mt-0.5" />
            <div className="text-xs text-amber-700 dark:text-amber-400">
              <p className="font-medium">{t('convertDoc.noDocumentConverterFound')}</p>
              <p className="mt-1">
                {t('convertDoc.documentConversionRequiresACompatible')}
              </p>
            </div>
          </div>
        )}

        {/* Error */}
        {processError && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3">
            <p className="text-xs text-destructive">{processError}</p>
          </div>
        )}

      </div>
      </div>

      {/* Sticky bottom action bar */}
      <div className="border-t bg-background px-6 py-3 flex items-center gap-3 flex-none">
        <Button
          variant="outline"
          size="sm"
          onClick={onBack}
          disabled={isProcessing}
          className="flex-none"
        >
          {t('common.back')}
        </Button>
        <Button
          size="sm"
          data-testid="apply-btn"
          onClick={handleConvert}
          disabled={isProcessing || !canConvert || availableFormats.length === 0}
          className={PRIMARY_ACTION}
        >
          {isProcessing ? (
            <>
              <OtterSpinner className="size-4" />
              {t('convertImage.converting')}
            </>
          ) : isDetecting ? (
            <>
              <OtterSpinner className="size-4" />
              {t('convertDoc.detectingTools')}
            </>
          ) : (
            t('convertImageFlow.convertToFormat', { format: FORMAT_LABELS[outputFormat] })
          )}
        </Button>
      </div>
    </div>
  );
}
