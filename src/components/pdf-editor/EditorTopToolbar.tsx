// EditorTopToolbar: fixed top bar for the PDF editor.
// Shows breadcrumb row (Dashboard > filename.pdf) and formatting toolbar row below it.
import { ChevronRight } from 'lucide-react';
import { useEditorContext } from '@/context/EditorContext';
import { useToolContext } from '@/context/ToolContext';
import { FormattingToolbar } from './FormattingToolbar';

export function EditorTopToolbar() {
  const { state } = useEditorContext();
  const { goToDashboard } = useToolContext();

  const handleBackToDashboard = () => {
    if (state.isDirty) {
      const confirmed = window.confirm(
        'You have unsaved changes. Are you sure you want to leave?',
      );
      if (!confirmed) return;
    }
    goToDashboard();
  };

  return (
    <div className="flex flex-col flex-none">
      {/* Row 1: Breadcrumb */}
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

        <div className="flex-1" />
        <div className="text-xs text-muted-foreground">
          Page {state.currentPage + 1} of {state.pageCount}
        </div>
      </div>

      {/* Row 2: Formatting toolbar */}
      <FormattingToolbar />
    </div>
  );
}
