import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { t } from '@/i18n';

interface UnsavedChangesDialogProps {
  open: boolean;
  fileName: string;
  isSaving?: boolean;
  /** Write the file, then leave. */
  onSave: () => void;
  /** Leave without writing anything. */
  onDiscard: () => void;
  /** Stay in the document. Must write nothing and navigate nowhere. */
  onCancel: () => void;
}

/**
 * The three-way prompt every desktop editor shows on the way out: Save,
 * Don't Save, Cancel.
 *
 * A two-choice confirm cannot express this. The previous one asked "OK to save
 * before leaving, or Cancel to stay" and then navigated away on Cancel too, so
 * one button destroyed the file and the other destroyed the work.
 */
export function UnsavedChangesDialog({
  open,
  fileName,
  isSaving = false,
  onSave,
  onDiscard,
  onCancel,
}: UnsavedChangesDialogProps) {
  // Escape is the same promise as Cancel: change nothing.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="unsaved-changes-title"
        data-modal-panel
        className="w-full max-w-sm border-border p-5"
      >
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 flex-none text-amber-500" />
          <div className="min-w-0">
            <h2 id="unsaved-changes-title" className="text-sm font-semibold text-foreground">
              {t('common.unsavedChanges')}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{fileName || t('unsavedChangesDialog.thisDocument')}</span>{' '}
              {t('unsavedChangesDialog.hasUnsavedChanges')}
            </p>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={isSaving}>
            {t('common.cancel')}
          </Button>
          <Button variant="outline" size="sm" onClick={onDiscard} disabled={isSaving}>
            {t('unsavedChangesDialog.dontSave')}
          </Button>
          <Button size="sm" onClick={onSave} disabled={isSaving}>
            {isSaving ? t('pdfEditor.saving') : t('common.save')}
          </Button>
        </div>
      </div>
    </div>
  );
}
