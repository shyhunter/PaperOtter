// EditorLayout: three-panel layout for the PDF editor.
// Left: ThumbnailSidebar (collapsible)
// Center: PageCanvas with TextOverlay (main editing area, scrollable)
// Right: EditorToolbar (text formatting controls)
import { useState, useCallback, useEffect, useRef } from 'react';
import {
  ChevronUp,
  ChevronDown,
  ZoomIn,
  ZoomOut,
  Maximize2,
} from 'lucide-react';
import { ThumbnailSidebar } from './ThumbnailSidebar';
import { PageCanvas, type CanvasDimensions } from './PageCanvas';
import { TextOverlay } from './TextOverlay';
import { ImageOverlay } from './ImageOverlay';
import { EditorToolbar } from './EditorToolbar';
import { ExportPanel } from './ExportPanel';
import { extractPageText, type ExtractedTextItem } from '@/lib/pdfTextExtract';
import { extractPageImages } from '@/lib/pdfImageExtract';
import { useUndoRedo } from '@/hooks/useUndoRedo';
import type { EditorState, TextBlock, ImageBlock, EditorMode } from '@/types/editor';

interface EditorLayoutProps {
  /** PDF file bytes */
  pdfBytes: Uint8Array;
  /** Original file path */
  filePath: string;
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
    bold: false,
    italic: false,
    underline: false,
    isNew: false,
  };
}

export function EditorLayout({
  pdfBytes,
  filePath,
  pageCount,
  currentPage,
  onPageChange,
  editorState,
  onEditorStateChange,
}: EditorLayoutProps) {
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [editorMode, setEditorMode] = useState<EditorMode>('select');
  const [canvasDims, setCanvasDims] = useState<CanvasDimensions | null>(null);
  const [rightPanelTab, setRightPanelTab] = useState<'edit' | 'export'>('edit');
  const [zoomLevel, setZoomLevel] = useState<number | null>(null); // null = fit to width
  const [pageInputValue, setPageInputValue] = useState(String(currentPage + 1));

  // Undo/redo for editor state
  const { pushState, undo, redo, canUndo, canRedo } = useUndoRedo<EditorState>();

  // Track which pages have been extracted to avoid re-extracting
  const extractedTextPagesRef = useRef<Set<number>>(new Set());
  const extractedImagePagesRef = useRef<Set<number>>(new Set());

  // Keep page input synced
  useEffect(() => {
    setPageInputValue(String(currentPage + 1));
  }, [currentPage]);

  // Extract text for the current page when it changes
  useEffect(() => {
    let cancelled = false;

    async function loadTextForPage() {
      if (extractedTextPagesRef.current.has(currentPage)) return;
      const existingPage = editorState.pages[currentPage];
      if (existingPage && existingPage.textBlocks.length > 0) {
        extractedTextPagesRef.current.add(currentPage);
        return;
      }

      try {
        const items = await extractPageText(pdfBytes, currentPage);
        if (cancelled) return;

        const blocks = items.map((item) => textItemToBlock(item, currentPage));
        extractedTextPagesRef.current.add(currentPage);

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

  // Extract images for the current page when it changes
  useEffect(() => {
    let cancelled = false;

    async function loadImagesForPage() {
      if (extractedImagePagesRef.current.has(currentPage)) return;
      const existingPage = editorState.pages[currentPage];
      if (existingPage && existingPage.imageBlocks.length > 0) {
        extractedImagePagesRef.current.add(currentPage);
        return;
      }

      try {
        const images = await extractPageImages(pdfBytes, currentPage);
        if (cancelled) return;

        extractedImagePagesRef.current.add(currentPage);

        onEditorStateChange({
          ...editorState,
          pages: editorState.pages.map((page, i) =>
            i === currentPage ? { ...page, imageBlocks: images } : page,
          ),
        });
      } catch (err) {
        console.error('Image extraction failed for page', currentPage, err);
      }
    }

    loadImagesForPage();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, pdfBytes]);

  /** Wrap state changes with undo tracking */
  const updateEditorState = useCallback(
    (newState: EditorState) => {
      if (newState.isDirty) pushState(editorState);
      onEditorStateChange(newState);
    },
    [editorState, onEditorStateChange, pushState],
  );

  const handleUndo = useCallback(() => {
    const prev = undo(editorState);
    if (prev) onEditorStateChange(prev);
  }, [editorState, undo, onEditorStateChange]);

  const handleRedo = useCallback(() => {
    const next = redo(editorState);
    if (next) onEditorStateChange(next);
  }, [editorState, redo, onEditorStateChange]);

  // Zoom handlers
  const handleZoomIn = useCallback(() => {
    setZoomLevel((prev) => {
      const base = prev ?? (canvasDims?.scale ?? 1.5);
      return Math.min(base + 0.25, 5);
    });
  }, [canvasDims]);

  const handleZoomOut = useCallback(() => {
    setZoomLevel((prev) => {
      const base = prev ?? (canvasDims?.scale ?? 1.5);
      return Math.max(base - 0.25, 0.25);
    });
  }, [canvasDims]);

  const handleFitToWidth = useCallback(() => {
    setZoomLevel(null);
  }, []);

  const handlePageInput = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        const val = parseInt(pageInputValue, 10);
        if (val >= 1 && val <= pageCount) {
          onPageChange(val - 1);
        } else {
          setPageInputValue(String(currentPage + 1));
        }
      }
    },
    [pageInputValue, pageCount, currentPage, onPageChange],
  );

  const zoomPercent = zoomLevel
    ? Math.round(zoomLevel * 100)
    : canvasDims
      ? Math.round(canvasDims.scale * 100)
      : 100;

  const currentPageBlocks = editorState.pages[currentPage]?.textBlocks ?? [];
  const currentPageImages = editorState.pages[currentPage]?.imageBlocks ?? [];
  const selectedBlock = currentPageBlocks.find((b) => b.id === selectedBlockId) ?? null;
  const selectedImageBlock = currentPageImages.find((b) => b.id === selectedBlockId) ?? null;

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
            b.id === id ? { ...b, text: newText, ...newProps, isModified: true } : b,
          ),
        };
      });
      updateEditorState({ ...editorState, pages: updatedPages, isDirty: true });
    },
    [editorState, currentPage, updateEditorState],
  );

  const handleTextDelete = useCallback(
    (id: string) => {
      const block = currentPageBlocks.find((b) => b.id === id);
      const updatedPages = editorState.pages.map((page, i) => {
        if (i !== currentPage) return page;
        return {
          ...page,
          textBlocks: page.textBlocks.filter((b) => b.id !== id),
          deletedTextIds: block && !block.isNew
            ? [...page.deletedTextIds, id]
            : page.deletedTextIds,
          // Store original bounds so save engine can white-rect cover the deleted text
          deletedTextBlocks: block && !block.isNew
            ? [...page.deletedTextBlocks, { id: block.id, x: block.x, y: block.y, width: block.width, height: block.height }]
            : page.deletedTextBlocks,
        };
      });
      setSelectedBlockId(null);
      updateEditorState({ ...editorState, pages: updatedPages, isDirty: true });
    },
    [editorState, currentPage, currentPageBlocks, updateEditorState],
  );

  const handleTextAdd = useCallback(
    (block: TextBlock) => {
      const blockWithPage = { ...block, pageIndex: currentPage };
      const updatedPages = editorState.pages.map((page, i) => {
        if (i !== currentPage) return page;
        return { ...page, textBlocks: [...page.textBlocks, blockWithPage] };
      });
      updateEditorState({ ...editorState, pages: updatedPages, isDirty: true });
      setSelectedBlockId(blockWithPage.id);
      // Switch back to select mode after adding
      setEditorMode('select');
    },
    [editorState, currentPage, updateEditorState],
  );

  const handleTextMove = useCallback(
    (id: string, x: number, y: number) => {
      const updatedPages = editorState.pages.map((page, i) => {
        if (i !== currentPage) return page;
        return {
          ...page,
          textBlocks: page.textBlocks.map((b) =>
            b.id === id ? { ...b, x, y, isModified: true } : b,
          ),
        };
      });
      updateEditorState({ ...editorState, pages: updatedPages, isDirty: true });
    },
    [editorState, currentPage, updateEditorState],
  );

  const handleTextResize = useCallback(
    (id: string, width: number, height: number) => {
      const updatedPages = editorState.pages.map((page, i) => {
        if (i !== currentPage) return page;
        return {
          ...page,
          textBlocks: page.textBlocks.map((b) =>
            b.id === id ? { ...b, width, height, isModified: true } : b,
          ),
        };
      });
      updateEditorState({ ...editorState, pages: updatedPages, isDirty: true });
    },
    [editorState, currentPage, updateEditorState],
  );

  const handleBlockUpdate = useCallback(
    (id: string, props: Partial<TextBlock>) => {
      const updatedPages = editorState.pages.map((page, i) => {
        if (i !== currentPage) return page;
        return {
          ...page,
          textBlocks: page.textBlocks.map((b) =>
            b.id === id ? { ...b, ...props, isModified: true } : b,
          ),
        };
      });
      updateEditorState({ ...editorState, pages: updatedPages, isDirty: true });
    },
    [editorState, currentPage, updateEditorState],
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

  // ── Image event handlers ─────────────────────────────────────────────

  const handleImageChange = useCallback(
    (id: string, updates: Partial<ImageBlock>) => {
      const updatedPages = editorState.pages.map((page, i) => {
        if (i !== currentPage) return page;
        return {
          ...page,
          imageBlocks: page.imageBlocks.map((b) =>
            b.id === id ? { ...b, ...updates } : b,
          ),
        };
      });
      updateEditorState({ ...editorState, pages: updatedPages, isDirty: true });
    },
    [editorState, currentPage, updateEditorState],
  );

  const handleImageDelete = useCallback(
    (id: string) => {
      const block = currentPageImages.find((b) => b.id === id);
      const updatedPages = editorState.pages.map((page, i) => {
        if (i !== currentPage) return page;
        return {
          ...page,
          imageBlocks: page.imageBlocks.filter((b) => b.id !== id),
          deletedImageIds: block && !block.isNew
            ? [...page.deletedImageIds, id]
            : page.deletedImageIds,
          deletedImageBlocks: block && !block.isNew
            ? [...page.deletedImageBlocks, { id: block.id, x: block.x, y: block.y, width: block.width, height: block.height }]
            : page.deletedImageBlocks,
        };
      });
      setSelectedBlockId(null);
      updateEditorState({ ...editorState, pages: updatedPages, isDirty: true });
    },
    [editorState, currentPage, currentPageImages, updateEditorState],
  );

  const handleImageInsert = useCallback(
    (block: ImageBlock) => {
      const blockWithPage = { ...block, pageIndex: currentPage };
      const updatedPages = editorState.pages.map((page, i) => {
        if (i !== currentPage) return page;
        return { ...page, imageBlocks: [...page.imageBlocks, blockWithPage] };
      });
      updateEditorState({ ...editorState, pages: updatedPages, isDirty: true });
      setSelectedBlockId(blockWithPage.id);
      setEditorMode('select');
    },
    [editorState, currentPage, updateEditorState],
  );

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left: Thumbnail sidebar */}
      <ThumbnailSidebar
        pdfBytes={pdfBytes}
        pageCount={pageCount}
        currentPage={currentPage}
        onPageSelect={onPageChange}
      />

      {/* Center: Main canvas + bottom nav */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Scrollable canvas area */}
        <div className="flex-1 overflow-auto bg-muted/10 flex justify-center p-4">
          <div className={zoomLevel ? '' : 'max-w-4xl w-full'}>
            <PageCanvas
              pdfBytes={pdfBytes}
              pageIndex={currentPage}
              scale={zoomLevel ?? undefined}
              onDimensions={handleDimensions}
            >
              {canvasDims && (
                <>
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
                    onTextMove={handleTextMove}
                    onTextResize={handleTextResize}
                  />
                  <ImageOverlay
                    imageBlocks={currentPageImages}
                    scale={canvasDims.scale}
                    pageHeight={canvasDims.pdfHeight}
                    selectedId={selectedBlockId}
                    onSelect={handleSelect}
                    onImageChange={handleImageChange}
                    onImageDelete={handleImageDelete}
                  />
                </>
              )}
            </PageCanvas>
          </div>
        </div>

        {/* Bottom navigation bar */}
        <div className="border-t border-border bg-background px-4 py-1.5 flex items-center justify-center gap-3 flex-none text-sm">
          {/* Page navigation */}
          <button
            type="button"
            onClick={() => onPageChange(Math.max(0, currentPage - 1))}
            disabled={currentPage === 0}
            className="p-1 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
            title="Previous page"
          >
            <ChevronUp className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => onPageChange(Math.min(pageCount - 1, currentPage + 1))}
            disabled={currentPage === pageCount - 1}
            className="p-1 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
            title="Next page"
          >
            <ChevronDown className="w-4 h-4" />
          </button>
          <input
            type="text"
            value={pageInputValue}
            onChange={(e) => setPageInputValue(e.target.value)}
            onKeyDown={handlePageInput}
            onBlur={() => setPageInputValue(String(currentPage + 1))}
            className="w-10 text-center rounded border border-input bg-background px-1 py-0.5 text-xs"
            title="Page number"
          />
          <span className="text-xs text-muted-foreground">/ {pageCount}</span>

          <div className="w-px h-4 bg-border mx-1" />

          {/* Zoom controls */}
          <button
            type="button"
            onClick={handleZoomOut}
            className="p-1 rounded hover:bg-muted"
            title="Zoom out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handleZoomIn}
            className="p-1 rounded hover:bg-muted"
            title="Zoom in"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <span className="text-xs text-muted-foreground min-w-[3rem] text-center">{zoomPercent}%</span>
          <button
            type="button"
            onClick={handleFitToWidth}
            className="p-1 rounded hover:bg-muted"
            title="Fit to width"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Right: Controls panel */}
      <div
        className="border-l border-border bg-muted/20 flex flex-col overflow-y-auto"
        style={{ width: 280 }}
      >
        {/* Tab toggle: Edit | Export */}
        <div className="flex border-b border-border">
          <button
            onClick={() => setRightPanelTab('edit')}
            className={[
              'flex-1 px-4 py-2.5 text-xs font-medium uppercase tracking-wider transition-colors',
              rightPanelTab === 'edit'
                ? 'text-foreground border-b-2 border-primary'
                : 'text-muted-foreground hover:text-foreground',
            ].join(' ')}
          >
            Edit
          </button>
          <button
            onClick={() => setRightPanelTab('export')}
            className={[
              'flex-1 px-4 py-2.5 text-xs font-medium uppercase tracking-wider transition-colors',
              rightPanelTab === 'export'
                ? 'text-foreground border-b-2 border-primary'
                : 'text-muted-foreground hover:text-foreground',
            ].join(' ')}
          >
            Export
          </button>
        </div>

        {rightPanelTab === 'edit' && (
          <EditorToolbar
            selectedBlock={selectedBlock}
            selectedImageBlock={selectedImageBlock}
            editorMode={editorMode}
            onBlockUpdate={handleBlockUpdate}
            onBlockDelete={handleBlockDelete}
            onImageUpdate={handleImageChange}
            onImageDelete={handleImageDelete}
            onImageInsert={handleImageInsert}
            onModeChange={setEditorMode}
            pageWidth={canvasDims?.pdfWidth ?? 612}
            pageHeight={canvasDims?.pdfHeight ?? 792}
            canUndo={canUndo}
            canRedo={canRedo}
            onUndo={handleUndo}
            onRedo={handleRedo}
          />
        )}

        {rightPanelTab === 'export' && (
          <ExportPanel
            pdfBytes={pdfBytes}
            filePath={filePath}
            pageEdits={editorState.pages}
            isDirty={editorState.isDirty}
          />
        )}
      </div>
    </div>
  );
}
