import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ConvertFormat, ConvertResult } from '@/types/converter';
import { t } from '@/i18n';
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

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(2)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

interface ConvertCompareStepProps {
  result: ConvertResult;
  sourceFileName: string;
  sourceFormat: ConvertFormat;
  onSave: () => void;
  onStartOver: () => void;
  /** Back to Configure, keeping the file, the way the other Compare steps do. */
  onBack: () => void;
}

function getConvertedFileName(sourceFileName: string, outputFormat: ConvertFormat, archive?: boolean): string {
  // Remove original extension and add new one (or .zip for a per-chapter archive)
  const base = sourceFileName.replace(/\.[^.]+$/, '');
  return archive ? `${base}-chapters.zip` : `${base}-converted.${outputFormat}`;
}

export function ConvertCompareStep({
  result,
  sourceFileName,
  sourceFormat,
  onSave,
  onStartOver,
  onBack,
}: ConvertCompareStepProps) {
  const sizeChange = result.originalSize - result.outputSize;
  const sizeChangePct = result.originalSize > 0
    ? Math.round(Math.abs(sizeChange) / result.originalSize * 100)
    : 0;
  const grew = sizeChange < 0;
  const convertedFileName = getConvertedFileName(sourceFileName, result.outputFormat, result.archive);

  return (
    /* min-h-0 is load-bearing. A flex child will not shrink below its content
       by default, so without it this column keeps its natural height, the
       action bar underneath is pushed past the bottom of the window, and the
       Save button simply is not there. #116 fixed exactly this in
       ConvertConfigStep and ImageConfigureStep; this sibling was missed, and
       it is the step that owns Save. */
    <div className="flex flex-1 flex-col min-h-0 overflow-hidden">
      {/* Stats bar */}
      <div className="flex items-center gap-4 px-4 py-3 text-xs border-b border-border bg-muted/30 flex-none">
        <span className="font-medium text-foreground tabular-nums whitespace-nowrap">
          {formatBytes(result.originalSize)}
        </span>
        <ArrowRight className="h-3 w-3 text-muted-foreground flex-none" />
        <span className="font-medium text-foreground tabular-nums whitespace-nowrap">
          {formatBytes(result.outputSize)}
        </span>
        {result.originalSize > 0 && (
          <span className={cn(
            'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
            grew
              ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
              : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
          )}>
            {grew
              ? t('common.percentLarger', { percent: sizeChangePct })
              : t('common.percentSmaller', { percent: sizeChangePct })}
          </span>
        )}
      </div>

      {/* Comparison cards */}
      <div className="flex flex-1 min-h-0 items-center justify-center overflow-y-auto p-6">
        <div className="w-full max-w-lg space-y-4">
          {/* Original card */}
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">{t('imageCompare.original')}</p>
                <p className="text-sm font-medium text-foreground mt-0.5 truncate">{sourceFileName}</p>
              </div>
              <div className="text-end">
                <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  {FORMAT_LABELS[sourceFormat]}
                </span>
                <p className="text-xs text-muted-foreground mt-1 tabular-nums">{formatBytes(result.originalSize)}</p>
              </div>
            </div>
          </div>

          {/* Arrow */}
          <div className="flex justify-center">
            <ArrowRight className="h-5 w-5 text-muted-foreground rotate-90" />
          </div>

          {/* Converted card */}
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">{t('convertDoc.converted')}</p>
                <p className="text-sm font-medium text-foreground mt-0.5 truncate">{convertedFileName}</p>
              </div>
              <div className="text-end">
                <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                  {FORMAT_LABELS[result.outputFormat]}
                </span>
                <p className="text-xs text-muted-foreground mt-1 tabular-nums">{formatBytes(result.outputSize)}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom strip -- Back | spacer | Process another | Save, the same shape
          and the same order as the other two Compare steps. This one had no
          Back at all, so the only way out of a conversion you wanted to adjust
          was to throw it away and start from the file picker. */}
      <div className="border-t bg-background px-4 py-3 flex items-center gap-3 flex-none">
        <Button variant="outline" size="sm" data-testid="back-btn" onClick={onBack} className="flex-none">
          {t('common.back')}
        </Button>

        <button
          type="button"
          data-testid="process-another-btn"
          onClick={onStartOver}
          className="text-xs text-muted-foreground underline hover:text-foreground transition-colors flex-none"
        >
          {t('convertDoc.processAnother')}
        </button>

        <Button size="sm" data-testid="save-btn" onClick={onSave} className={PRIMARY_ACTION}>
          {t('common.saveEllipsis')}
        </Button>
      </div>
    </div>
  );
}
