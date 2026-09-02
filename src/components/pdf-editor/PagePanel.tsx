// PagePanel: collapsible left panel with page thumbnails, multi-select, and page operations.
// Supports click-to-scroll, collapse/expand, and operations (insert, delete, duplicate).
// Uses custom mouse-based drag-to-reorder (HTML5 DnD is unreliable in WKWebView).
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  Plus,
  Trash2,
  Copy,
  FileText,
  File,
} from 'lucide-react';
import { open } from '@/lib/dialog';
import { readFile } from '@tauri-apps/plugin-fs';
import { useEditorContext } from '@/context/EditorContext';
import { PagePanelThumbnail } from './PagePanelThumbnail';
import { plural, t } from '@/i18n';

const PANEL_WIDTH = 180;
const COLLAPSED_WIDTH = 28;

interface PagePanelProps {
  /** Callback to scroll the main canvas to a specific page */
  onScrollToPage: (pageIndex: number) => void;
}

export function PagePanel({ onScrollToPage }: PagePanelProps) {
  const {
    state,
    selectedPages,
    togglePageSelection,
    selectPageRange,
    clearPageSelection,
    addBlankPage,
    addPagesFromPdf,
    deletePages,
    duplicatePages,
    reorderPages,
  } = useEditorContext();

  const { pdfBytes, pageCount, currentPage } = state;
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [showInsertMenu, setShowInsertMenu] = useState(false);
  const insertMenuRef = useRef<HTMLDivElement>(null);
  const activeThumbRef = useRef<HTMLDivElement>(null);
  const lastClickedRef = useRef<number | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Custom drag state (replaces HTML5 DnD for WKWebView reliability)
  const [dragSource, setDragSource] = useState<number | null>(null);
  const [dragOverTarget, setDragOverTarget] = useState<number | null>(null);
  const dragStartYRef = useRef<number>(0);
  const isDraggingRef = useRef(false);

  // Scroll current page thumbnail into view
  useEffect(() => {
    activeThumbRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [currentPage]);

  // Close insert menu on outside click
  useEffect(() => {
    if (!showInsertMenu) return;
    function handleClick(e: MouseEvent) {
      if (insertMenuRef.current && !insertMenuRef.current.contains(e.target as Node)) {
        setShowInsertMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showInsertMenu]);

  const handleThumbnailClick = useCallback(
    (pageIndex: number, e: React.MouseEvent) => {
      // Don't handle click if we were dragging
      if (isDraggingRef.current) return;

      const isMulti = e.metaKey || e.ctrlKey;
      const isRange = e.shiftKey;

      if (isRange && lastClickedRef.current !== null) {
        // Extend from the anchor and LEAVE IT WHERE IT IS. Moving it here walked
        // it forward on every Shift+click, so a third one restarted the range
        // from the previous target: click p1, Shift p3 -> {1,2,3}, Shift p4 ->
        // {3,4} instead of {1,2,3,4}. Finder/VS Code keep the anchor on the last
        // plain click, which is what lets Shift+click both grow and shrink a
        // range.
        selectPageRange(lastClickedRef.current, pageIndex);
        return;
      }

      if (isMulti) {
        togglePageSelection(pageIndex, true);
      } else {
        // Single click: clear selection, select this, scroll to it
        clearPageSelection();
        togglePageSelection(pageIndex, false);
        onScrollToPage(pageIndex);
      }
      lastClickedRef.current = pageIndex;
    },
    [clearPageSelection, onScrollToPage, selectPageRange, togglePageSelection],
  );

  // Insert position: after last selected, or at end
  const insertAfter = useCallback((): number => {
    if (selectedPages.size === 0) return pageCount - 1;
    return Math.max(...Array.from(selectedPages));
  }, [selectedPages, pageCount]);

  const handleInsertBlank = useCallback(() => {
    addBlankPage(insertAfter());
    setShowInsertMenu(false);
  }, [addBlankPage, insertAfter]);

  const handleInsertFromPdf = useCallback(async () => {
    setShowInsertMenu(false);
    try {
      const result = await open({
        multiple: false,
        directory: false,
        filters: [{ name: t('filter.pdfFiles'), extensions: ['pdf'] }],
      });
      if (typeof result === 'string') {
        const bytes = await readFile(result);
        await addPagesFromPdf(insertAfter(), new Uint8Array(bytes));
      }
    } catch (err) {
      // Only show error if not a user cancellation
      if (err instanceof Error && !err.message.includes('cancel')) {
        console.error('Insert from PDF failed:', err);
        alert(t('pagePanel.failedToInsertPages', { error: err.message }));
      }
    }
  }, [addPagesFromPdf, insertAfter]);

  const handleDelete = useCallback(() => {
    if (selectedPages.size === 0 || selectedPages.size >= pageCount) return;
    deletePages(Array.from(selectedPages));
  }, [deletePages, selectedPages, pageCount]);

  const handleDuplicate = useCallback(() => {
    if (selectedPages.size === 0) return;
    duplicatePages(Array.from(selectedPages));
  }, [duplicatePages, selectedPages]);

  // Move selected page up/down (reliable alternative to drag)
  const handleMoveUp = useCallback(() => {
    if (selectedPages.size !== 1) return;
    const idx = Array.from(selectedPages)[0];
    if (idx > 0) {
      reorderPages(idx, idx - 1);
      clearPageSelection();
      togglePageSelection(idx - 1, false);
    }
  }, [selectedPages, reorderPages, clearPageSelection, togglePageSelection]);

  const handleMoveDown = useCallback(() => {
    if (selectedPages.size !== 1) return;
    const idx = Array.from(selectedPages)[0];
    if (idx < pageCount - 1) {
      reorderPages(idx, idx + 1);
      clearPageSelection();
      togglePageSelection(idx + 1, false);
    }
  }, [selectedPages, reorderPages, pageCount, clearPageSelection, togglePageSelection]);

  // We need to track dragOverTarget outside the closure
  const dragOverRef = useRef(dragOverTarget);
  dragOverRef.current = dragOverTarget;

  // Custom mouse-based drag-to-reorder (HTML5 DnD unreliable in WKWebView)
  const handleDragMouseDownFixed = useCallback((pageIndex: number, e: React.MouseEvent) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
    dragStartYRef.current = e.clientY;
    isDraggingRef.current = false;

    // The closest-thumbnail scan below queries every thumbnail element and calls
    // getBoundingClientRect() on each — a layout-forcing operation. Raw mousemove
    // events can fire far more often than the display refresh rate (especially on
    // high-polling-rate trackpads/mice), so without throttling, a large document
    // (hundreds of thumbnails) turns a simple drag into hundreds of full-layout
    // scans per second, pinning the main thread and starving other input handling
    // for as long as the mouse keeps moving — reproduced on a real 688-page PDF.
    let rafId: number | null = null;
    let latestClientY = e.clientY;

    const computeDragOver = () => {
      rafId = null;
      const thumbEls = document.querySelectorAll('[data-page-thumb-idx]');
      let closestIdx = pageIndex;
      let closestDist = Infinity;
      thumbEls.forEach((el) => {
        const rect = el.getBoundingClientRect();
        const centerY = rect.top + rect.height / 2;
        const dist = Math.abs(latestClientY - centerY);
        if (dist < closestDist) {
          closestDist = dist;
          closestIdx = Number(el.getAttribute('data-page-thumb-idx'));
        }
      });
      setDragOverTarget(closestIdx);
      dragOverRef.current = closestIdx;
    };

    const handleMouseMove = (ev: MouseEvent) => {
      latestClientY = ev.clientY;
      const dy = Math.abs(ev.clientY - dragStartYRef.current);
      if (dy > 5 && !isDraggingRef.current) {
        isDraggingRef.current = true;
        setDragSource(pageIndex);
      }
      if (isDraggingRef.current && rafId === null) {
        rafId = requestAnimationFrame(computeDragOver);
      }
    };

    const handleMouseUp = () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      const target = dragOverRef.current;
      if (isDraggingRef.current && target !== null && target !== pageIndex) {
        reorderPages(pageIndex, target);
        clearPageSelection();
        togglePageSelection(target, false);
      }
      setTimeout(() => {
        isDraggingRef.current = false;
      }, 0);
      setDragSource(null);
      setDragOverTarget(null);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [reorderPages, clearPageSelection, togglePageSelection]);

  if (isCollapsed) {
    return (
      <div
        className="flex flex-col items-center border-e border-border bg-muted/30 flex-none transition-all duration-200"
        style={{ width: COLLAPSED_WIDTH }}
      >
        <button
          type="button"
          onClick={() => setIsCollapsed(false)}
          className="p-1.5 mt-1 text-muted-foreground hover:text-foreground transition-colors"
          aria-label={t('pdfEditor.expandPagePanel')}
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  const canDelete = selectedPages.size > 0 && selectedPages.size < pageCount;
  const canDuplicate = selectedPages.size > 0;
  const canMoveUp = selectedPages.size === 1 && !selectedPages.has(0);
  const canMoveDown = selectedPages.size === 1 && !selectedPages.has(pageCount - 1);

  return (
    <div
      className="flex flex-col border-e border-border bg-muted/30 flex-none transition-all duration-200"
      style={{ width: PANEL_WIDTH }}
    >
      {/* Header with collapse button */}
      <div className="flex items-center justify-between px-2 py-1.5 border-b border-border">
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
          {t('common.pages')}
        </span>
        <button
          type="button"
          onClick={() => setIsCollapsed(true)}
          className="p-0.5 text-muted-foreground hover:text-foreground transition-colors"
          aria-label={t('pdfEditor.collapsePagePanel')}
        >
          <ChevronLeft className="h-3 w-3" />
        </button>
      </div>

      {/* Thumbnail list */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-2 space-y-1.5 min-h-0">
        {Array.from({ length: pageCount }, (_, i) => (
          <div
            key={i}
            ref={i === currentPage ? activeThumbRef : undefined}
            data-page-thumb-idx={i}
            onMouseDown={(e) => handleDragMouseDownFixed(i, e)}
          >
            {/* Drop insertion indicator */}
            {dragSource !== null && dragOverTarget === i && dragSource !== i && (
              <div className="h-0.5 bg-blue-500 rounded-full mx-2 mb-1" />
            )}
            <PagePanelThumbnail
              pdfBytes={pdfBytes}
              pageIndex={i}
              isSelected={selectedPages.has(i)}
              isCurrent={i === currentPage}
              isDragSource={dragSource === i}
              onClick={(e) => handleThumbnailClick(i, e)}
              scrollContainerRef={scrollContainerRef}
            />
          </div>
        ))}
      </div>

      {/* Operations bar */}
      <div className="border-t border-border px-2 py-1.5 flex items-center gap-0.5">
        {/* Insert dropdown */}
        <div className="relative" ref={insertMenuRef}>
          <button
            type="button"
            onClick={() => setShowInsertMenu((prev) => !prev)}
            className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            aria-label={t('pdfEditor.insertPage')}
            title={t('pdfEditor.insertPage')}
          >
            <Plus className="h-3.5 w-3.5" />
          </button>

          {showInsertMenu && (
            <div className="absolute bottom-full start-0 mb-1 w-44 rounded-md border border-border bg-popover shadow-lg py-1 z-20">
              <button
                type="button"
                onClick={handleInsertBlank}
                className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-popover-foreground hover:bg-accent transition-colors"
              >
                <File className="h-3.5 w-3.5" />
                {t('pdfEditor.blankPage')}
              </button>
              <button
                type="button"
                onClick={handleInsertFromPdf}
                className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-popover-foreground hover:bg-accent transition-colors"
              >
                <FileText className="h-3.5 w-3.5" />
                {t('pdfEditor.fromPdfFile')}
              </button>
            </div>
          )}
        </div>

        {/* Move up */}
        <button
          type="button"
          onClick={handleMoveUp}
          disabled={!canMoveUp}
          className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          aria-label={t('pdfEditor.movePageUp')}
          title={t('pdfEditor.movePageUp')}
        >
          <ChevronUp className="h-3.5 w-3.5" />
        </button>

        {/* Move down */}
        <button
          type="button"
          onClick={handleMoveDown}
          disabled={!canMoveDown}
          className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          aria-label={t('pdfEditor.movePageDown')}
          title={t('pdfEditor.movePageDown')}
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </button>

        {/* Delete */}
        <button
          type="button"
          onClick={handleDelete}
          disabled={!canDelete}
          className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          aria-label={t('pdfEditor.deleteSelectedPages')}
          title={t('pdfEditor.deleteSelectedPages')}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>

        {/* Duplicate */}
        <button
          type="button"
          onClick={handleDuplicate}
          disabled={!canDuplicate}
          className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          aria-label={t('pdfEditor.duplicateSelectedPages')}
          title={t('pdfEditor.duplicateSelectedPages')}
        >
          <Copy className="h-3.5 w-3.5" />
        </button>

        {/* Page count display */}
        <span className="ms-auto text-[10px] text-muted-foreground">
          {plural('count.page', pageCount)}
        </span>
      </div>
    </div>
  );
}
