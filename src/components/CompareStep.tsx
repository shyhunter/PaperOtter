import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { renderPdfThumbnail } from '@/lib/pdfThumbnail';
import type { PdfProcessingResult } from '@/types/file';

export interface CompareStepProps {
  result: PdfProcessingResult;
  onSave: () => void;
  onBack: () => void;
  onStartOver: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(2)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

export function CompareStep({ result, onSave, onBack, onStartOver }: CompareStepProps) {
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [thumbnailError, setThumbnailError] = useState(false);

  const savingsBytes = result.inputSizeBytes - result.outputSizeBytes;
  const savingsPct = result.inputSizeBytes > 0
    ? Math.round((savingsBytes / result.inputSizeBytes) * 100)
    : 0;
  const grew = savingsBytes < 0;

  // Render thumbnail when result arrives
  useEffect(() => {
    setThumbnailUrl(null);
    setThumbnailError(false);

    renderPdfThumbnail(result.bytes, 0.5)
      .then(setThumbnailUrl)
      .catch(() => setThumbnailError(true));
  }, [result.bytes]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center p-6">
      <div className="w-full max-w-lg space-y-5">

        {/* Target not met warning — visible but Save not blocked */}
        {!result.targetMet && result.bestAchievableSizeBytes != null && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3">
            <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
              Target size not achievable
            </p>
            <p className="text-xs text-amber-600 dark:text-amber-300 mt-1">
              Best result: {formatBytes(result.bestAchievableSizeBytes)}. PDF optimisation is structural
              only — image-heavy PDFs cannot be compressed beyond their embedded content.
              You can still save this result.
            </p>
          </div>
        )}

        <div className="flex gap-4">
          {/* Thumbnail */}
          <div className="flex-none w-28 h-36 rounded-md border border-border bg-muted/30 flex items-center justify-center overflow-hidden">
            {thumbnailUrl ? (
              <img
                src={thumbnailUrl}
                alt="First page preview"
                className="object-contain w-full h-full"
              />
            ) : thumbnailError ? (
              <span className="text-xs text-muted-foreground text-center px-1">Preview unavailable</span>
            ) : (
              <span className="text-xs text-muted-foreground">Rendering…</span>
            )}
          </div>

          {/* Stats panel */}
          <div className="flex-1 space-y-2">
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
              <span className="text-muted-foreground">Before</span>
              <span className="font-medium text-foreground">{formatBytes(result.inputSizeBytes)}</span>

              <span className="text-muted-foreground">After</span>
              <span className="font-medium text-foreground">{formatBytes(result.outputSizeBytes)}</span>

              <span className="text-muted-foreground">{grew ? 'Increase' : 'Savings'}</span>
              <span className={`font-medium ${grew ? 'text-amber-600 dark:text-amber-400' : 'text-green-600 dark:text-green-400'}`}>
                {grew ? '+' : '-'}{formatBytes(Math.abs(savingsBytes))} ({Math.abs(savingsPct)}%)
              </span>

              <span className="text-muted-foreground">Pages</span>
              <span className="font-medium text-foreground">{result.pageCount}</span>

              {result.outputPageDimensions && (
                <>
                  <span className="text-muted-foreground">Dimensions</span>
                  <span className="font-medium text-foreground">
                    {/* Convert from PDF points to mm: 1 pt = 25.4/72 mm */}
                    {Math.round(result.outputPageDimensions.widthPt * 25.4 / 72)} × {Math.round(result.outputPageDimensions.heightPt * 25.4 / 72)} mm
                  </span>
                </>
              )}
            </div>

            {grew && (
              <p className="text-xs text-muted-foreground">
                File grew after re-save — this PDF was already structurally optimised.
              </p>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <Button variant="outline" size="sm" onClick={onBack} className="flex-none">
            Back
          </Button>
          <Button size="sm" onClick={onSave} className="flex-1">
            Save…
          </Button>
        </div>

        <div className="text-center">
          <button
            type="button"
            onClick={onStartOver}
            className="text-xs text-muted-foreground underline hover:text-foreground transition-colors"
          >
            Process another file
          </button>
        </div>

      </div>
    </div>
  );
}
