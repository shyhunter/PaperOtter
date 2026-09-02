import { Button } from '@/components/ui/button';
import { getFileName } from '@/lib/fileValidation';
import { t } from '@/i18n';
import type { BatchProgress } from '@/lib/batchRunner';

export interface BatchRunStepProps {
  progress: BatchProgress | null;
  onCancel: () => void;
}

/**
 * Progress across a batch, naming the file being worked on.
 *
 * A bare spinner is the wrong answer for twelve scans: the run is long enough
 * that the user needs to see it advancing, and specific enough that "which one
 * is it stuck on" is a real question.
 */
export function BatchRunStep({ progress, onCancel }: BatchRunStepProps) {
  const current = (progress?.index ?? 0) + 1;
  const total = progress?.total ?? 0;
  const pct = total > 0 ? Math.round(((current - 1) / total) * 100) : 0;

  return (
    <div
      data-testid="batch-run-step"
      data-batch-index={progress?.index ?? -1}
      data-batch-total={total}
      className="flex flex-1 flex-col items-center justify-center p-6"
    >
      <div className="w-full max-w-sm space-y-4">
        <p className="text-sm font-medium text-foreground text-center">
          {progress
            ? t('batch.processingFile', {
                current, total, name: getFileName(progress.path),
              })
            : t('common.processing')}
        </p>

        <div
          className="h-2 w-full overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full bg-primary transition-[width] duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>

        <div className="flex justify-center">
          <Button variant="outline" size="sm" data-testid="batch-cancel-btn" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
        </div>
      </div>
    </div>
  );
}
