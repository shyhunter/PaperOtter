// EditorLayout: three-panel layout for the PDF editor.
// Left: ThumbnailSidebar (collapsible)
// Center: PageCanvas (main editing area, scrollable)
// Right: Controls panel (placeholder for text/image editing controls in Plans 04/05)
import { ThumbnailSidebar } from './ThumbnailSidebar';
import { PageCanvas } from './PageCanvas';
import type { EditorState } from '@/types/editor';

interface EditorLayoutProps {
  /** PDF file bytes */
  pdfBytes: Uint8Array;
  /** Total number of pages */
  pageCount: number;
  /** Current page (zero-based) */
  currentPage: number;
  /** Called when navigating to a different page */
  onPageChange: (pageIndex: number) => void;
  /** Editor state for future editing controls */
  editorState: EditorState;
  /** Called when editor state changes */
  onEditorStateChange: (state: EditorState) => void;
}

export function EditorLayout({
  pdfBytes,
  pageCount,
  currentPage,
  onPageChange,
}: EditorLayoutProps) {
  return (
    <div className="flex h-full overflow-hidden">
      {/* Left: Thumbnail sidebar */}
      <ThumbnailSidebar
        pdfBytes={pdfBytes}
        pageCount={pageCount}
        currentPage={currentPage}
        onPageSelect={onPageChange}
      />

      {/* Center: Main canvas area (scrollable) */}
      <div className="flex-1 overflow-auto bg-muted/10 flex justify-center p-4">
        <div className="max-w-4xl w-full">
          <PageCanvas pdfBytes={pdfBytes} pageIndex={currentPage} />
        </div>
      </div>

      {/* Right: Controls panel (placeholder) */}
      <div
        className="border-l border-border bg-muted/20 flex flex-col"
        style={{ width: 280 }}
      >
        <div className="px-4 py-3 border-b border-border">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Properties
          </h3>
        </div>
        <div className="flex-1 flex items-center justify-center p-4">
          <p className="text-xs text-muted-foreground text-center">
            Select text or an image to edit its properties.
          </p>
        </div>
      </div>
    </div>
  );
}
