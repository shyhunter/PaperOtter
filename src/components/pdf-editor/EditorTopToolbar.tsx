// EditorTopToolbar: fixed top bar for the PDF editor.
// Shows breadcrumb navigation (Dashboard > filename.pdf) and placeholder for text formatting.
import { ChevronRight } from 'lucide-react';
import { useEditorContext } from '@/context/EditorContext';
import { useToolContext } from '@/context/ToolContext';

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
    <div className="flex items-center h-10 px-4 border-b border-border bg-background flex-none">
      {/* Breadcrumb */}
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

      {/* Placeholder for text formatting controls (future plans) */}
      <div className="flex-1" />
      <div className="text-xs text-muted-foreground">
        Page {state.currentPage + 1} of {state.pageCount}
      </div>
    </div>
  );
}
