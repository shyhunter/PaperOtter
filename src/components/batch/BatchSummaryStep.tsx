import { CheckCircle2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatBytes } from '@/lib/pdfUtils';
import { getFileName } from '@/lib/fileValidation';
import { plural, t } from '@/i18n';

export interface BatchSuccessSummary {
  path: string;
  fileName: string;
  inputSizeBytes: number;
  outputSizeBytes: number;
}

export interface BatchSummaryStepProps {
  succeeded: BatchSuccessSummary[];
  failed: Array<{ path: string; message: string }>;
  /** True when the run was stopped part-way rather than finishing. */
  cancelled: boolean;
  onSave: () => void;
  onBack: () => void;
}

/**
 * What happened to each file in the batch.
 *
 * The persona handed over a stack of scans for an application and needs to know,
 * before uploading anything, which ones came back. So failures are listed by
 * name with their reason rather than counted: "3 failed" leaves them guessing
 * which scan to redo.
 */
export function BatchSummaryStep({
  succeeded, failed, cancelled, onSave, onBack,
}: BatchSummaryStepProps) {
  const inputTotal = succeeded.reduce((sum, s) => sum + s.inputSizeBytes, 0);
  const outputTotal = succeeded.reduce((sum, s) => sum + s.outputSizeBytes, 0);
  const savedBytes = inputTotal - outputTotal;

  return (
    <div
      data-testid="batch-summary-step"
      data-cancelled={cancelled ? 'true' : 'false'}
      data-succeeded={succeeded.length}
      data-failed={failed.length}
      className="flex flex-1 flex-col overflow-hidden"
    >
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto w-full max-w-lg space-y-4">

          {cancelled && (
            <div className="rounded-md border border-amber-500/50 bg-amber-500/10 px-4 py-3">
              <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
                {t('batch.stoppedEarly')}
              </p>
            </div>
          )}

          {succeeded.length > 0 && (
            <div className="rounded-lg border border-border p-4 space-y-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <p className="text-sm font-semibold text-foreground">
                  {t('batch.filesReady', { files: plural('count.file', succeeded.length) })}
                </p>
              </div>

              {savedBytes > 0 && (
                <p className="text-xs text-muted-foreground">
                  {t('batch.totalSaving', {
                    saved: formatBytes(savedBytes),
                    output: formatBytes(outputTotal),
                  })}
                </p>
              )}

              <ul className="space-y-1">
                {succeeded.map((s) => (
                  <li key={s.path} className="flex items-baseline justify-between gap-3 text-xs">
                    <span className="truncate text-foreground">{s.fileName}</span>
                    <span className="flex-none text-muted-foreground">
                      {formatBytes(s.inputSizeBytes)} → {formatBytes(s.outputSizeBytes)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {failed.length > 0 && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                <p className="text-sm font-semibold text-destructive">
                  {t('batch.couldNotBeProcessed', { files: plural('count.file', failed.length) })}
                </p>
              </div>
              <ul className="space-y-2">
                {failed.map((f) => (
                  <li key={f.path} className="text-xs">
                    <p className="truncate font-medium text-foreground">{getFileName(f.path)}</p>
                    <p className="text-destructive/80">{f.message}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}

        </div>
      </div>

      <div className="border-t bg-background px-4 py-3 flex items-center gap-3 flex-none">
        <Button variant="outline" size="sm" onClick={onBack} className="flex-none">
          {t('common.back')}
        </Button>
        <div className="flex-1" />
        {succeeded.length > 0 && (
          <Button size="sm" onClick={onSave}>
            {t('save.saveNFiles', { files: plural('count.file', succeeded.length) })}
          </Button>
        )}
      </div>
    </div>
  );
}
