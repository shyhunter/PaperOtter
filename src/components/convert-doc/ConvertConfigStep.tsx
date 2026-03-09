import { useState, useEffect, useCallback } from 'react';
import { Loader2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getAvailableOutputFormats, checkSidecarAvailability, getEngineForFormat, convertDocument } from '@/lib/documentConverter';
import type { ConvertFormat, ConvertOptions, ConvertResult, EpubLayout } from '@/types/converter';

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
  const availableFormats = getAvailableOutputFormats(sourceFormat);
  const [outputFormat, setOutputFormat] = useState<ConvertFormat>(availableFormats[0] ?? 'pdf');
  const [fontFamily, setFontFamily] = useState('Arial');
  const [fontSize, setFontSize] = useState(12);
  const [marginTop, setMarginTop] = useState(25);
  const [marginRight, setMarginRight] = useState(25);
  const [marginBottom, setMarginBottom] = useState(25);
  const [marginLeft, setMarginLeft] = useState(25);
  const [linkMargins, setLinkMargins] = useState(true);
  const [lineSpacing, setLineSpacing] = useState(1.15);
  const [epubLayout, setEpubLayout] = useState<EpubLayout>('reflowable');
  const [isProcessing, setIsProcessing] = useState(false);
  const [processError, setProcessError] = useState<string | null>(null);

  // Sidecar availability
  const [sidecarStatus, setSidecarStatus] = useState<{ libreoffice: boolean; calibre: boolean } | null>(null);
  const [sidecarChecking, setSidecarChecking] = useState(true);

  useEffect(() => {
    setSidecarChecking(true);
    checkSidecarAvailability()
      .then(setSidecarStatus)
      .catch(() => setSidecarStatus({ libreoffice: false, calibre: false }))
      .finally(() => setSidecarChecking(false));
  }, []);

  const engine = getEngineForFormat(outputFormat);
  const engineAvailable = sidecarStatus
    ? (engine === 'libreoffice' ? sidecarStatus.libreoffice : sidecarStatus.calibre)
    : true;

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
      };
      const result = await convertDocument(filePath, sourceFormat, options);
      onConvertComplete(result);
    } catch (err: unknown) {
      const message = typeof err === 'string' ? err : err instanceof Error ? err.message : 'Conversion failed.';
      setProcessError(message);
    } finally {
      setIsProcessing(false);
    }
  }, [filePath, sourceFormat, outputFormat, fontFamily, fontSize, marginTop, marginRight, marginBottom, marginLeft, lineSpacing, epubLayout, onConvertComplete]);

  const showEpubLayoutToggle = outputFormat === 'epub';
  const showTypographyControls = engine === 'calibre';

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex-1 overflow-y-auto p-6 flex flex-col items-center">
      <div className="w-full max-w-md space-y-4 my-auto">
        {/* File info */}
        <div className="text-center">
          <p className="text-sm font-medium text-foreground truncate">{fileName}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {FORMAT_LABELS[sourceFormat]} format
          </p>
        </div>

        {/* Output format selector */}
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <p className="text-xs font-medium text-muted-foreground">Output format</p>
          <div className="grid grid-cols-3 gap-1.5">
            {availableFormats.map((fmt) => (
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
                {FORMAT_LABELS[fmt]}
              </button>
            ))}
          </div>
        </div>

        {/* EPUB layout toggle */}
        {showEpubLayoutToggle && (
          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <p className="text-xs font-medium text-muted-foreground">EPUB Layout</p>
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
                <span className="font-medium block">Reflowable</span>
                <span className="text-[10px] text-muted-foreground mt-0.5 block">Text reflows to fit screen</span>
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
                <span className="font-medium block">Fixed Layout</span>
                <span className="text-[10px] text-muted-foreground mt-0.5 block">Preserves exact page layout</span>
              </button>
            </div>
          </div>
        )}

        {/* Typography controls -- shown for Calibre-routed conversions */}
        {showTypographyControls && (
          <div className="rounded-lg border border-border bg-card p-4 space-y-4">
            <p className="text-xs font-medium text-muted-foreground">Typography</p>

            {/* Font family */}
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Font</label>
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
                <label className="text-xs text-muted-foreground">Font size</label>
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
              <label className="text-xs text-muted-foreground">Line spacing</label>
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
              <p className="text-xs font-medium text-muted-foreground">Margins (mm)</p>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={linkMargins}
                  onChange={(e) => setLinkMargins(e.target.checked)}
                  disabled={isProcessing}
                  className="accent-primary"
                />
                <span className="text-[10px] text-muted-foreground">Link all</span>
              </label>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'Top', value: marginTop, setter: setMarginTop },
                { label: 'Right', value: marginRight, setter: setMarginRight },
                { label: 'Bottom', value: marginBottom, setter: setMarginBottom },
                { label: 'Left', value: marginLeft, setter: setMarginLeft },
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

        {/* Sidecar availability warning */}
        {!sidecarChecking && !engineAvailable && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 flex-none mt-0.5" />
            <div className="text-xs text-amber-700 dark:text-amber-400">
              <p className="font-medium">
                {engine === 'libreoffice' ? 'LibreOffice' : 'Calibre'} is required
              </p>
              <p className="mt-1">
                {engine === 'libreoffice'
                  ? 'Install LibreOffice from libreoffice.org to enable this conversion.'
                  : 'Install Calibre from calibre-ebook.com to enable ebook conversion.'}
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
          Back
        </Button>
        <div className="flex-1" />
        <Button
          size="sm"
          onClick={handleConvert}
          disabled={isProcessing || sidecarChecking || !engineAvailable}
        >
          {isProcessing ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Converting...
            </>
          ) : sidecarChecking ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Checking tools...
            </>
          ) : (
            `Convert to ${FORMAT_LABELS[outputFormat]}`
          )}
        </Button>
      </div>
    </div>
  );
}
