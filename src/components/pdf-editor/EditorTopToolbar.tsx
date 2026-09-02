// EditorTopToolbar: fixed top bar for the PDF editor.
// Shows breadcrumb row (Dashboard > filename.pdf) with save button and formatting toolbar row below it.
import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronRight, Save, Columns2, Undo2 } from 'lucide-react';
import { useEditorContext } from '@/context/EditorContext';
import { useToolContext } from '@/context/ToolContext';
import { useSaveActions } from './SaveController';
import { FormattingToolbar } from './FormattingToolbar';
import { UnsavedChangesDialog } from './UnsavedChangesDialog';
import { diagLog } from '@/lib/diagLog';
import { t } from '@/i18n';

export function EditorTopToolbar() {
  const { state, setCompareMode, revertToOriginal } = useEditorContext();
  const { goToDashboard, setNavigationGuard } = useToolContext();
  const { save, isSaving } = useSaveActions();
  const [showSavedFeedback, setShowSavedFeedback] = useState(false);
  // The navigation this prompt is holding up, or null when nothing is pending.
  const [pendingNav, setPendingNav] = useState<(() => void) | null>(null);

  // Read inside the guard, which is registered once and must not capture a
  // stale isDirty.
  const isDirtyRef = useRef(state.isDirty);
  isDirtyRef.current = state.isDirty;

  // Every route out of the editor tears down its unsaved state, so all of them
  // go through here rather than each growing its own prompt.
  useEffect(() => {
    setNavigationGuard((proceed) => {
      if (!isDirtyRef.current) return true;
      setPendingNav(() => proceed);
      return false;
    });
    return () => setNavigationGuard(null);
  }, [setNavigationGuard]);

  const handleSaveClick = useCallback(async () => {
    const success = await save();
    if (success) {
      setShowSavedFeedback(true);
      setTimeout(() => setShowSavedFeedback(false), 1500);
    }
  }, [save]);

  const handleBackToDashboard = useCallback(() => {
    diagLog(`dashboard.click isDirty=${state.isDirty}`);
    // The guard turns this into a prompt when there are unsaved changes.
    goToDashboard();
  }, [state.isDirty, goToDashboard]);

  const handlePromptSave = useCallback(async () => {
    diagLog('prompt.save');
    const saved = await save();
    // Backing out of the OS save dialog must leave the document untouched.
    if (!saved) return;
    const proceed = pendingNav;
    setPendingNav(null);
    proceed?.();
  }, [save, pendingNav]);

  const handlePromptDiscard = useCallback(() => {
    diagLog('prompt.discard');
    const proceed = pendingNav;
    setPendingNav(null);
    proceed?.();
  }, [pendingNav]);

  const handlePromptCancel = useCallback(() => {
    diagLog('prompt.cancel');
    setPendingNav(null);
  }, []);

  const handleRevert = useCallback(() => {
    // Offered even when the document is clean: the case this exists for is
    // realising the wrong file was edited *after* saving over it.
    const confirmed = window.confirm(t('editorToolbar.discardAllChangesAndRestore'));
    diagLog(`revert.confirm confirmed=${confirmed}`);
    if (confirmed) revertToOriginal();
  }, [revertToOriginal]);

  return (
    <div className="flex flex-col flex-none">
      {/* Row 1: Breadcrumb + Save */}
      <div className="flex items-center h-10 px-4 border-b border-border bg-background">
        <nav className="flex items-center gap-1 text-xs">
          <button
            type="button"
            onClick={handleBackToDashboard}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            {t('pdfEditor.dashboard')}
          </button>
          <ChevronRight className="w-3 h-3 text-muted-foreground" />
          <span className="text-foreground font-medium truncate max-w-[200px]">
            {state.fileName || t('pdfEditor.untitledPdf')}
          </span>
          {state.isDirty && (
            <span className="text-muted-foreground ms-1" title={t('common.unsavedChanges')}>
              *
            </span>
          )}
        </nav>

        {/* Save button */}
        <div className="ms-3 flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleSaveClick}
            disabled={!state.isDirty || isSaving}
            className="flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors disabled:opacity-40 disabled:cursor-default hover:bg-muted"
            title={t('pdfEditor.saveCmdS')}
          >
            <Save className="w-3.5 h-3.5" />
            {showSavedFeedback ? (
              <span className="text-green-600">{t('pdfEditor.saved')}</span>
            ) : (
              <span>{t('common.save')}</span>
            )}
          </button>
        </div>


        {/* Revert */}
        <div className="ms-2">
          <button
            type="button"
            onClick={handleRevert}
            className="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted"
            title={t('pdfEditor.discardAllChangesAndRestore')}
          >
            <Undo2 className="w-3.5 h-3.5" />
            <span>{t('pdfEditor.revert')}</span>
          </button>
        </div>

        {/* Compare toggle */}
        <div className="ms-2">
          <button
            type="button"
            onClick={() => setCompareMode(state.compareMode === 'off' ? 'floating' : 'off')}
            className={`flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors ${
              state.compareMode !== 'off'
                ? 'bg-primary/10 text-primary font-medium'
                : 'hover:bg-muted text-muted-foreground'
            }`}
            title={t('pdfEditor.toggleCompareViewOriginalVs')}
          >
            <Columns2 className="w-3.5 h-3.5" />
            <span>{t('pdfEditor.compare')}</span>
          </button>
        </div>

        <div className="flex-1" />
        <div className="text-xs text-muted-foreground">
          {t('common.pageOf', { page: state.currentPage + 1, total: state.pageCount })}
        </div>
      </div>

      {/* Row 2: Formatting toolbar */}
      <FormattingToolbar />

      <UnsavedChangesDialog
        open={pendingNav !== null}
        fileName={state.fileName}
        isSaving={isSaving}
        onSave={handlePromptSave}
        onDiscard={handlePromptDiscard}
        onCancel={handlePromptCancel}
      />
    </div>
  );
}
