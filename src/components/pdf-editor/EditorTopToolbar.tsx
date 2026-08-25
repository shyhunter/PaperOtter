// EditorTopToolbar: fixed top bar for the PDF editor.
// Shows breadcrumb row (Dashboard > filename.pdf) with save button and formatting toolbar row below it.
import { useCallback, useState } from 'react';
import { ChevronRight, Save, Columns2, Undo2 } from 'lucide-react';
import { useEditorContext } from '@/context/EditorContext';
import { useToolContext } from '@/context/ToolContext';
import { useSaveActions } from './SaveController';
import { FormattingToolbar } from './FormattingToolbar';
import { UnsavedChangesDialog } from './UnsavedChangesDialog';
import { diagLog } from '@/lib/diagLog';

export function EditorTopToolbar() {
  const { state, setCompareMode, revertToOriginal } = useEditorContext();
  const { goToDashboard } = useToolContext();
  const { save, isSaving } = useSaveActions();
  const [showSavedFeedback, setShowSavedFeedback] = useState(false);
  const [showUnsavedPrompt, setShowUnsavedPrompt] = useState(false);

  const handleSaveClick = useCallback(async () => {
    const success = await save();
    if (success) {
      setShowSavedFeedback(true);
      setTimeout(() => setShowSavedFeedback(false), 1500);
    }
  }, [save]);

  const handleBackToDashboard = useCallback(() => {
    diagLog(`dashboard.click isDirty=${state.isDirty}`);
    if (state.isDirty) {
      // Leaving is the user's decision to make, in a dialog that can express
      // all three answers. Navigating here is what used to lose people's work.
      setShowUnsavedPrompt(true);
      return;
    }
    diagLog('dashboard.goToDashboard');
    goToDashboard();
  }, [state.isDirty, goToDashboard]);

  const handlePromptSave = useCallback(async () => {
    diagLog('dashboard.prompt.save');
    const saved = await save();
    // Backing out of the OS save dialog must leave the document untouched.
    if (!saved) return;
    setShowUnsavedPrompt(false);
    goToDashboard();
  }, [save, goToDashboard]);

  const handlePromptDiscard = useCallback(() => {
    diagLog('dashboard.prompt.discard');
    setShowUnsavedPrompt(false);
    goToDashboard();
  }, [goToDashboard]);

  const handlePromptCancel = useCallback(() => {
    diagLog('dashboard.prompt.cancel');
    setShowUnsavedPrompt(false);
  }, []);

  const handleRevert = useCallback(() => {
    // Offered even when the document is clean: the case this exists for is
    // realising the wrong file was edited *after* saving over it.
    const confirmed = window.confirm(
      'Discard all changes and restore this document as it was opened?',
    );
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
            Dashboard
          </button>
          <ChevronRight className="w-3 h-3 text-muted-foreground" />
          <span className="text-foreground font-medium truncate max-w-[200px]">
            {state.fileName || 'Untitled.pdf'}
          </span>
          {state.isDirty && (
            <span className="text-muted-foreground ml-1" title="Unsaved changes">
              *
            </span>
          )}
        </nav>

        {/* Save button */}
        <div className="ml-3 flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleSaveClick}
            disabled={!state.isDirty || isSaving}
            className="flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors disabled:opacity-40 disabled:cursor-default hover:bg-muted"
            title="Save (Cmd+S)"
          >
            <Save className="w-3.5 h-3.5" />
            {showSavedFeedback ? (
              <span className="text-green-600">Saved</span>
            ) : (
              <span>Save</span>
            )}
          </button>
        </div>

        {/* Revert */}
        <div className="ml-2">
          <button
            type="button"
            onClick={handleRevert}
            className="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted"
            title="Discard all changes and restore the document as it was opened"
          >
            <Undo2 className="w-3.5 h-3.5" />
            <span>Revert</span>
          </button>
        </div>

        {/* Compare toggle */}
        <div className="ml-2">
          <button
            type="button"
            onClick={() => setCompareMode(state.compareMode === 'off' ? 'floating' : 'off')}
            className={`flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors ${
              state.compareMode !== 'off'
                ? 'bg-primary/10 text-primary font-medium'
                : 'hover:bg-muted text-muted-foreground'
            }`}
            title="Toggle compare view (original vs edited)"
          >
            <Columns2 className="w-3.5 h-3.5" />
            <span>Compare</span>
          </button>
        </div>

        <div className="flex-1" />
        <div className="text-xs text-muted-foreground">
          Page {state.currentPage + 1} of {state.pageCount}
        </div>
      </div>

      {/* Row 2: Formatting toolbar */}
      <FormattingToolbar />

      <UnsavedChangesDialog
        open={showUnsavedPrompt}
        fileName={state.fileName}
        isSaving={isSaving}
        onSave={handlePromptSave}
        onDiscard={handlePromptDiscard}
        onCancel={handlePromptCancel}
      />
    </div>
  );
}
