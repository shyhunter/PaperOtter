// PageNumbersConfigureStep: Configure page number position, format, size, and start number.
import { useState, useCallback, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { renderPdfThumbnail } from '@/lib/pdfThumbnail';
import { addPageNumbers, formatNumber } from '@/lib/pdfPageNumbers';
import { cn } from '@/lib/utils';
import type { NumberPosition, NumberFormat, PageNumberOptions } from '@/lib/pdfPageNumbers';

interface PageNumbersConfigureStepProps {
  pdfBytes: Uint8Array;
  pageCount: number;
  onApply: (options: PageNumberOptions) => void;
  onBack: () => void;
  isProcessing: boolean;
  error: string | null;
}

const POSITIONS: { label: string; value: NumberPosition }[] = [
  { label: 'Top Left', value: 'top-left' },
  { label: 'Top Center', value: 'top-center' },
  { label: 'Top Right', value: 'top-right' },
  { label: 'Bottom Left', value: 'bottom-left' },
  { label: 'Bottom Center', value: 'bottom-center' },
  { label: 'Bottom Right', value: 'bottom-right' },
];

const FORMATS: { label: string; value: NumberFormat; example: string }[] = [
  { label: '1, 2, 3', value: 'numeric', example: '1' },
  { label: 'i, ii, iii', value: 'roman', example: 'i' },
  { label: 'A, B, C', value: 'alphabetic', example: 'A' },
];

const FONT_SIZES: { label: string; value: number }[] = [
  { label: 'Small', value: 10 },
  { label: 'Medium', value: 12 },
  { label: 'Large', value: 14 },
];

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
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  // Generate preview of first page with current settings
  useEffect(() => {
    let cancelled = false;
    setIsLoadingPreview(true);

    const opts: PageNumberOptions = { position, format, fontSize, startNumber, margin: 30 };

    addPageNumbers(pdfBytes, opts)
      .then((numbered) => renderPdfThumbnail(numbered, 0.5))
      .then((url) => { if (!cancelled) setPreviewUrl(url); })
      .catch(() => { if (!cancelled) setPreviewUrl(null); })
      .finally(() => { if (!cancelled) setIsLoadingPreview(false); });

    return () => { cancelled = true; };
  }, [pdfBytes, position, format, fontSize, startNumber]);

  const handleApply = useCallback(() => {
    onApply({ position, format, fontSize, startNumber, margin: 30 });
  }, [onApply, position, format, fontSize, startNumber]);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex flex-1 overflow-hidden">
        {/* Left panel: options */}
        <div className="w-72 flex-none overflow-y-auto border-r border-border p-4 space-y-5">
          <h2 className="text-sm font-semibold text-foreground">Page Number Options</h2>

          {/* Position grid: 3x2 */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Position</label>
            <div className="grid grid-cols-3 gap-1.5">
              {POSITIONS.map((p) => (
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
            <label className="text-xs font-medium text-muted-foreground">Format</label>
            <div className="flex gap-1.5">
              {FORMATS.map((f) => (
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
            <label className="text-xs font-medium text-muted-foreground">Font Size</label>
            <div className="flex gap-1.5">
              {FONT_SIZES.map((fs) => (
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

          {/* Start number */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Start Number</label>
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
            {pageCount} page{pageCount !== 1 ? 's' : ''} &middot; numbering: {formatNumber(startNumber, format)}–{formatNumber(startNumber + pageCount - 1, format)}
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
              <p className="text-xs">Generating preview...</p>
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
                alt="Page numbers preview"
                className="max-h-[60vh] rounded-md border border-border shadow-sm"
              />
            </div>
          )}
          {!previewUrl && !isLoadingPreview && (
            <p className="text-xs text-muted-foreground">Preview will appear here</p>
          )}
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-border bg-background px-4 py-3 flex items-center gap-3 flex-none">
        <Button variant="outline" size="sm" onClick={onBack} className="flex-none">
          Back
        </Button>
        <div className="flex-1" />
        <Button size="sm" onClick={handleApply} disabled={isProcessing}>
          {isProcessing ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Applying...
            </>
          ) : (
            'Apply Page Numbers'
          )}
        </Button>
      </div>
    </div>
  );
}
