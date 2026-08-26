// PageNumbersConfigureStep: Configure page number position, format, size, and start number.
import { useState, useCallback, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { renderPdfThumbnail } from '@/lib/pdfThumbnail';
import { addPageNumbersSinglePage, formatNumber } from '@/lib/pdfPageNumbers';
import { cn } from '@/lib/utils';
import type { NumberPosition, NumberFormat, PageNumberOptions } from '@/lib/pdfPageNumbers';
import { DEFAULT_TEXT_COLOR } from '@/lib/colorPresets';
import { ColorPicker } from '@/components/ColorPicker';
import { plural, t } from '@/i18n';

interface PageNumbersConfigureStepProps {
  pdfBytes: Uint8Array;
  pageCount: number;
  onApply: (options: PageNumberOptions) => void;
  onBack: () => void;
  isProcessing: boolean;
  error: string | null;
}

/**
 * A function, not a constant: these labels are translated, and a module-level
 * constant resolves them once at import -- before the locale is known.
 */
function positions(): { label: string; value: NumberPosition }[] {
  return [
    { label: t('pdfEditor.topLeft'), value: 'top-left' },
    { label: t('pdfEditor.topCenter'), value: 'top-center' },
    { label: t('pdfEditor.topRight'), value: 'top-right' },
    { label: t('pdfEditor.bottomLeft'), value: 'bottom-left' },
    { label: t('pdfEditor.bottomCenter'), value: 'bottom-center' },
    { label: t('pdfEditor.bottomRight'), value: 'bottom-right' },
  ];
}

/**
 * A function, not a constant: these labels are translated, and a module-level
 * constant resolves them once at import -- before the locale is known.
 */
function formats(): { label: string; value: NumberFormat; example: string }[] {
  return [
    { label: '1, 2, 3', value: 'numeric', example: '1' },
    { label: t('pageNumbersConfigureStep.iIiIii'), value: 'roman', example: 'i' },
    { label: 'A, B, C', value: 'alphabetic', example: 'A' },
  ];
}

/**
 * A function, not a constant: these labels are translated, and a module-level
 * constant resolves them once at import -- before the locale is known.
 */
function fontSizes(): { label: string; value: number }[] {
  return [
    { label: t('watermarkFlow.small'), value: 10 },
    { label: t('watermarkFlow.medium'), value: 12 },
    { label: t('watermarkFlow.large'), value: 14 },
  ];
}

export function PageNumbersConfigureStep({
  pdfBytes,
  pageCount,
  onApply,
  onBack,
  isProcessing,
  error,
}: PageNumbersConfigureStepProps) {
  const [position, setPosition] = useState<NumberPosition>('bottom-center');
  const [format, setFormat] = useState<NumberFormat>('numeric');
  const [fontSize, setFontSize] = useState(12);
  const [startNumber, setStartNumber] = useState(1);
  const [color, setColor] = useState(DEFAULT_TEXT_COLOR);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  // Generate preview of first page with current settings.
  // Only processes that one page — running the full pass on every option
  // change freezes the UI on large documents (hundreds of pages).
  useEffect(() => {
    let cancelled = false;
    setIsLoadingPreview(true);

    const opts: PageNumberOptions = { position, format, fontSize, startNumber, margin: 30, color };

    addPageNumbersSinglePage(pdfBytes, opts, 0)
      .then((numbered) => renderPdfThumbnail(numbered, 0.5))
      .then((url) => { if (!cancelled) setPreviewUrl(url); })
      .catch(() => { if (!cancelled) setPreviewUrl(null); })
      .finally(() => { if (!cancelled) setIsLoadingPreview(false); });

    return () => { cancelled = true; };
  }, [pdfBytes, position, format, fontSize, startNumber, color]);

  const handleApply = useCallback(() => {
    onApply({ position, format, fontSize, startNumber, margin: 30, color });
  }, [onApply, position, format, fontSize, startNumber, color]);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex flex-1 overflow-hidden">
        {/* Left panel: options */}
        <div className="w-72 flex-none overflow-y-auto border-e border-border p-4 space-y-5">
          <h2 className="text-sm font-semibold text-foreground">{t('pageNumbers.pageNumberOptions')}</h2>

          {/* Position grid: 3x2 */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">{t('pageNumbers.position')}</label>
            <div className="grid grid-cols-3 gap-1.5">
              {positions().map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setPosition(p.value)}
                  className={cn(
                    'rounded-md border px-2 py-2 text-[10px] font-medium transition-colors leading-tight',
                    position === p.value
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border text-muted-foreground hover:bg-accent',
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Format */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">{t('pageNumbers.format')}</label>
            <div className="flex gap-1.5">
              {formats().map((f) => (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => setFormat(f.value)}
                  className={cn(
                    'flex-1 rounded-md border px-2 py-1.5 text-xs font-medium transition-colors',
                    format === f.value
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border text-muted-foreground hover:bg-accent',
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Font size */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">{t('common.fontSize')}</label>
            <div className="flex gap-1.5">
              {fontSizes().map((fs) => (
                <button
                  key={fs.value}
                  type="button"
                  onClick={() => setFontSize(fs.value)}
                  className={cn(
                    'flex-1 rounded-md border px-2 py-1.5 text-xs font-medium transition-colors',
                    fontSize === fs.value
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border text-muted-foreground hover:bg-accent',
                  )}
                >
                  {fs.label}
                </button>
              ))}
            </div>
          </div>

          {/* Colour */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">{t('pageNumbers.colour')}</label>
            <ColorPicker value={color} onChange={setColor} />
          </div>

          {/* Start number */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">{t('pageNumbers.startNumber')}</label>
            <input
              type="number"
              min="1"
              value={startNumber}
              onChange={(e) => setStartNumber(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {/* Info */}
          <p className="text-xs text-muted-foreground">
            {plural('count.page', pageCount)} &middot; numbering: {formatNumber(startNumber, format)}–{formatNumber(startNumber + pageCount - 1, format)}
          </p>

          {error && (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2">
              <p className="text-xs text-destructive">{error}</p>
            </div>
          )}
        </div>

        {/* Right panel: preview */}
        <div className="flex-1 flex flex-col items-center justify-center overflow-auto p-4 bg-muted/30">
          {isLoadingPreview && !previewUrl && (
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <Loader2 className="w-6 h-6 animate-spin" />
              <p className="text-xs">{t('common.generatingPreview')}</p>
            </div>
          )}
          {previewUrl && (
            <div className="relative">
              {isLoadingPreview && (
                <div className="absolute inset-0 flex items-center justify-center bg-background/50 rounded-md">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              )}
              <img
                src={previewUrl}
                alt={t('pageNumbers.pageNumbersPreview')}
                className="max-h-[60vh] rounded-md border border-border shadow-sm"
              />
            </div>
          )}
          {!previewUrl && !isLoadingPreview && (
            <p className="text-xs text-muted-foreground">{t('common.previewWillAppearHere')}</p>
          )}
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-border bg-background px-4 py-3 flex items-center gap-3 flex-none">
        <Button variant="outline" size="sm" onClick={onBack} className="flex-none">
          {t('common.back')}
        </Button>
        <div className="flex-1" />
        <Button size="sm" onClick={handleApply} disabled={isProcessing}>
          {isProcessing ? (
            <>
              <Loader2 className="w-4 h-4 me-2 animate-spin" />
              {t('common.applying')}
            </>
          ) : (
            t('pageNumbersConfigureStep.applyPageNumbers')
          )}
        </Button>
      </div>
    </div>
  );
}
