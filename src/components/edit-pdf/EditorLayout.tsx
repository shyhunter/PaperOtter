// EditorLayout: three-panel layout for the PDF editor.
// Left: ThumbnailSidebar (collapsible)
// Center: PageCanvas with TextOverlay (main editing area, scrollable)
// Right: EditorToolbar (text formatting controls)
import { useState, useCallback, useEffect, useRef } from 'react';
import { ThumbnailSidebar } from './ThumbnailSidebar';
import { PageCanvas, type CanvasDimensions } from './PageCanvas';
import { TextOverlay } from './TextOverlay';
import { EditorToolbar } from './EditorToolbar';
import { extractPageText, type ExtractedTextItem } from '@/lib/pdfTextExtract';
import type { EditorState, TextBlock, EditorMode } from '@/types/editor';

interface EditorLayoutProps {
  /** PDF file bytes */
  pdfBytes: Uint8Array;
  /** Total number of pages */
  pageCount: number;
  /** Current page (zero-based) */
  currentPage: number;
  /** Called when navigating to a different page */
  onPageChange: (pageIndex: number) => void;
  /** Editor state */
  editorState: EditorState;
  /** Called when editor state changes */
  onEditorStateChange: (state: EditorState) => void;
}

/** Convert an ExtractedTextItem to a TextBlock */
function textItemToBlock(item: ExtractedTextItem, pageIndex: number): TextBlock {
  return {
    id: item.id,
    pageIndex,
    x: item.x,
    y: item.y,
    width: item.width,
    height: item.height,
    text: item.text,
    fontSize: item.fontSize,
    fontName: item.fontName,
    color: '#000000',
    alignment: 'left',
    isNew: false,
  };
}

export function EditorLayout({
  pdfBytes,
  pageCount,
  currentPage,
  onPageChange,
  editorState,
  onEditorStateChange,
}: EditorLayoutProps) {
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [editorMode, setEditorMode] = useState<EditorMode>('select');
  const [canvasDims, setCanvasDims] = useState<CanvasDimensions | null>(null);

  // Track which pages have been text-extracted to avoid re-extracting
  const extractedPagesRef = useRef<Set<number>>(new Set());

  // Extract text for the current page when it changes
  useEffect(() => {
    let cancelled = false;

    async function loadTextForPage() {
      // Skip if already extracted for this page
      if (extractedPagesRef.current.has(currentPage)) return;
      // Also skip if page already has text blocks (populated from prior extraction)
      const existingPage = editorState.pages[currentPage];
      if (existingPage && existingPage.textBlocks.length > 0) {
        extractedPagesRef.current.add(currentPage);
        return;
      }

      try {
        const items = await extractPageText(pdfBytes, currentPage);
        if (cancelled) return;

        const blocks = items.map((item) => textItemToBlock(item, currentPage));
        extractedPagesRef.current.add(currentPage);

        onEditorStateChange({
          ...editorState,
          pages: editorState.pages.map((page, i) =>
            i === currentPage ? { ...page, textBlocks: blocks } : page,
          ),
        });
      } catch (err) {
        console.error('Text extraction failed for page', currentPage, err);
      }
    }

    loadTextForPage();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, pdfBytes]);

  const currentPageBlocks = editorState.pages[currentPage]?.textBlocks ?? [];
  const selectedBlock = currentPageBlocks.find((b) => b.id === selectedBlockId) ?? null;

  // Deselect when changing pages
  useEffect(() => {
    setSelectedBlockId(null);
  }, [currentPage]);

  // --- Event handlers ---

  const handleSelect = useCallback((id: string | null) => {
    setSelectedBlockId(id);
  }, []);

  const handleTextChange = useCallback(
    (id: string, newText: string, newProps?: Partial<TextBlock>) => {
      const updatedPages = editorState.pages.map((page, i) => {
        if (i !== currentPage) return page;
        return {
          ...page,
          textBlocks: page.textBlocks.map((b) =>
            b.id === id ? { ...b, text: newText, ...newProps } : b,
          ),
        };
      });
      onEditorStateChange({ ...editorState, pages: updatedPages, isDirty: true });
    },
    [editorState, currentPage, onEditorStateChange],
  );

  const handleTextDelete = useCallback(
    (id: string) => {
      const block = currentPageBlocks.find((b) => b.id === id);
      const updatedPages = editorState.pages.map((page, i) => {
        if (i !== currentPage) return page;
        return {
          ...page,
          textBlocks: page.textBlocks.filter((b) => b.id !== id),
          // Track deleted non-new blocks for save engine
          deletedTextIds: block && !block.isNew
            ? [...page.deletedTextIds, id]
            : page.deletedTextIds,
        };
      });
      setSelectedBlockId(null);
      onEditorStateChange({ ...editorState, pages: updatedPages, isDirty: true });
    },
    [editorState, currentPage, currentPageBlocks, onEditorStateChange],
  );

  const handleTextAdd = useCallback(
    (block: TextBlock) => {
      const blockWithPage = { ...block, pageIndex: currentPage };
      const updatedPages = editorState.pages.map((page, i) => {
        if (i !== currentPage) return page;
        return { ...page, textBlocks: [...page.textBlocks, blockWithPage] };
      });
      onEditorStateChange({ ...editorState, pages: updatedPages, isDirty: true });
      setSelectedBlockId(blockWithPage.id);
      // Switch back to select mode after adding
      setEditorMode('select');
    },
    [editorState, currentPage, onEditorStateChange],
  );

  const handleBlockUpdate = useCallback(
    (id: string, props: Partial<TextBlock>) => {
      const updatedPages = editorState.pages.map((page, i) => {
        if (i !== currentPage) return page;
        return {
          ...page,
          textBlocks: page.textBlocks.map((b) =>
            b.id === id ? { ...b, ...props } : b,
          ),
        };
      });
      onEditorStateChange({ ...editorState, pages: updatedPages, isDirty: true });
    },
    [editorState, currentPage, onEditorStateChange],
  );

  const handleBlockDelete = useCallback(
    (id: string) => {
      handleTextDelete(id);
    },
    [handleTextDelete],
  );

  const handleDimensions = useCallback((dims: CanvasDimensions) => {
    setCanvasDims(dims);
  }, []);

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
          <PageCanvas
            pdfBytes={pdfBytes}
            pageIndex={currentPage}
            onDimensions={handleDimensions}
          >
            {canvasDims && (
              <TextOverlay
                textBlocks={currentPageBlocks}
                scale={canvasDims.scale}
                pageHeight={canvasDims.pdfHeight}
                selectedId={selectedBlockId}
                editorMode={editorMode}
                onSelect={handleSelect}
                onTextChange={handleTextChange}
                onTextDelete={handleTextDelete}
                onTextAdd={handleTextAdd}
              />
            )}
          </PageCanvas>
        </div>
      </div>

      {/* Right: Controls panel */}
      <div
        className="border-l border-border bg-muted/20 flex flex-col overflow-y-auto"
        style={{ width: 280 }}
      >
        <div className="px-4 py-3 border-b border-border">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Properties
          </h3>
        </div>
        <EditorToolbar
          selectedBlock={selectedBlock}
          editorMode={editorMode}
          onBlockUpdate={handleBlockUpdate}
          onBlockDelete={handleBlockDelete}
          onModeChange={setEditorMode}
        />
      </div>
    </div>
  );
}
