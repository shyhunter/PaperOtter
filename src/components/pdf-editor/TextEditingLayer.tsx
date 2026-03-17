// TextEditingLayer: overlay that renders selectable/editable text blocks on each PDF page.
// Extracts text from PDF via pdfTextExtract, positions each block over the canvas.
// Click to select, double-click to edit inline, drag to reposition, Escape to deselect.
//
// CRITICAL: Uses pdfBytes.slice() for React StrictMode safety.

import { useEffect, useRef, useState, useCallback } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { extractPageText, type ExtractedTextItem } from '@/lib/pdfTextExtract';
import { useEditorContext } from '@/context/EditorContext';
import type { TextBlock } from '@/types/editor';

/** Map PDF font names to web-safe CSS font stacks */
function mapFontToCSS(fontName: string): string {
  const lower = fontName.toLowerCase();
  if (lower.includes('courier')) return '"Courier New", Courier, monospace';
  if (lower.includes('times')) return '"Times New Roman", Times, serif';
  return 'Helvetica, Arial, sans-serif';
}

/** Convert ExtractedTextItem to TextBlock */
function extractedToBlock(item: ExtractedTextItem, pageIndex: number): TextBlock {
  return {
    id: item.id,
    pageIndex,
    x: item.x,
    y: item.y,
    width: Math.max(item.width, 20),
    height: Math.max(item.height, 10),
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

interface TextEditingLayerProps {
  pageIndex: number;
  pageWidth: number;   // PDF points
  pageHeight: number;  // PDF points
  zoom: number;
}

// Cache extracted text per page to avoid repeated extraction
const extractionCache = new Map<string, TextBlock[]>();

export function TextEditingLayer({ pageIndex, pageWidth: _pageWidth, pageHeight, zoom }: TextEditingLayerProps) {
  void _pageWidth; // reserved for future use (e.g., centering new text blocks)
  const {
    state,
    selectBlock,
    startEditing,
    stopEditing,
    setPageTextBlocks,
    updateTextBlock,
    addTextBlock,
    deleteTextBlock,
    markDirty,
  } = useEditorContext();

  const { pdfBytes, selectedBlockId, editingBlockId, editorMode, pages } = state;
  const pageState = pages[pageIndex];
  const textBlocks = pageState?.textBlocks ?? [];

  const overlayRef = useRef<HTMLDivElement>(null);
  const [isExtracted, setIsExtracted] = useState(false);

  // Extract text blocks on mount (lazy, cached by pdfBytes identity + pageIndex)
  useEffect(() => {
    if (pdfBytes.byteLength === 0 || !pageState) return;
    // If blocks already populated, skip extraction
    if (textBlocks.length > 0 || isExtracted) return;

    let cancelled = false;

    async function extract() {
      // Cache key: simplified from bytes hash
      const cacheKey = `${pdfBytes.byteLength}-${pageIndex}`;
      const cached = extractionCache.get(cacheKey);
      if (cached) {
        if (!cancelled) {
          setPageTextBlocks(pageIndex, cached);
          setIsExtracted(true);
        }
        return;
      }

      try {
        const items = await extractPageText(pdfBytes, pageIndex);
        const blocks = items.map((item) => extractedToBlock(item, pageIndex));
        extractionCache.set(cacheKey, blocks);
        if (!cancelled) {
          setPageTextBlocks(pageIndex, blocks);
          setIsExtracted(true);
        }
      } catch {
        // Text extraction failed — non-fatal, page just has no editable text
        if (!cancelled) setIsExtracted(true);
      }
    }

    extract();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfBytes, pageIndex]);

  // Click on empty area: deselect or add new text block
  const handleOverlayClick = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>) => {
      if (e.target !== overlayRef.current) return;

      if (editorMode === 'text') {
        const rect = overlayRef.current!.getBoundingClientRect();
        const pdfX = (e.clientX - rect.left) / zoom;
        const pdfY = pageHeight - (e.clientY - rect.top) / zoom;

        const newBlock: TextBlock = {
          id: crypto.randomUUID(),
          pageIndex,
          x: pdfX,
          y: pdfY,
          width: 200,
          height: 18,
          text: '',
          fontSize: 12,
          fontName: 'Helvetica',
          color: '#000000',
          alignment: 'left',
          bold: false,
          italic: false,
          underline: false,
          isNew: true,
        };
        addTextBlock(pageIndex, newBlock);
        startEditing(newBlock.id);
      } else {
        selectBlock(null);
      }
    },
    [editorMode, zoom, pageHeight, pageIndex, addTextBlock, startEditing, selectBlock],
  );

  // Handle right-click context menu
  const handleContextMenu = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>, blockId: string) => {
      e.preventDefault();
      e.stopPropagation();

      // Simple confirm-to-delete for now
      const block = textBlocks.find((b) => b.id === blockId);
      if (!block) return;

      const action = window.confirm(`Delete text block "${block.text.slice(0, 30)}..."?`);
      if (action) {
        deleteTextBlock(pageIndex, blockId);
      }
    },
    [textBlocks, deleteTextBlock, pageIndex],
  );

  return (
    <div
      ref={overlayRef}
      className="absolute inset-0"
      style={{
        cursor: editorMode === 'text' ? 'crosshair' : 'default',
        pointerEvents: 'auto',
      }}
      onClick={handleOverlayClick}
    >
      {textBlocks.map((block) => (
        <TextBlockOverlay
          key={block.id}
          block={block}
          pageIndex={pageIndex}
          pageHeight={pageHeight}
          zoom={zoom}
          isSelected={block.id === selectedBlockId}
          isEditing={block.id === editingBlockId}
          onSelect={selectBlock}
          onStartEditing={startEditing}
          onStopEditing={stopEditing}
          onUpdate={(updated) => updateTextBlock(pageIndex, updated)}
          onDelete={() => deleteTextBlock(pageIndex, block.id)}
          onContextMenu={(e) => handleContextMenu(e, block.id)}
          onDirty={markDirty}
        />
      ))}
    </div>
  );
}

// ── Individual text block overlay ──────────────────────────────────────

interface TextBlockOverlayProps {
  block: TextBlock;
  pageIndex: number;
  pageHeight: number;
  zoom: number;
  isSelected: boolean;
  isEditing: boolean;
  onSelect: (id: string | null) => void;
  onStartEditing: (id: string) => void;
  onStopEditing: () => void;
  onUpdate: (block: TextBlock) => void;
  onDelete: () => void;
  onContextMenu: (e: ReactMouseEvent<HTMLDivElement>) => void;
  onDirty: () => void;
}

function TextBlockOverlay({
  block,
  pageHeight,
  zoom,
  isSelected,
  isEditing,
  onSelect,
  onStartEditing,
  onStopEditing,
  onUpdate,
  onDelete,
  onContextMenu,
  onDirty,
}: TextBlockOverlayProps) {
  const editableRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{
    mouseX: number; mouseY: number; blockX: number; blockY: number;
  } | null>(null);

  // Focus the editable div when entering edit mode
  useEffect(() => {
    if (isEditing && editableRef.current) {
      editableRef.current.focus();
      // Place cursor at end
      const range = document.createRange();
      const sel = window.getSelection();
      range.selectNodeContents(editableRef.current);
      range.collapse(false);
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
  }, [isEditing]);

  // PDF -> CSS coordinate conversion (PDF origin is bottom-left, CSS is top-left)
  const top = (pageHeight - block.y - block.height) * zoom;
  const left = block.x * zoom;
  const cssWidth = block.width * zoom;
  const cssHeight = block.height * zoom;
  const fontSize = block.fontSize * zoom;

  // Single click: select
  const handleClick = useCallback(
    (e: ReactMouseEvent) => {
      e.stopPropagation();
      if (isDragging) return;
      onSelect(block.id);
    },
    [block.id, onSelect, isDragging],
  );

  // Double click: enter editing mode
  const handleDoubleClick = useCallback(
    (e: ReactMouseEvent) => {
      e.stopPropagation();
      onStartEditing(block.id);
    },
    [block.id, onStartEditing],
  );

  // Drag to reposition
  const handleMouseDown = useCallback(
    (e: ReactMouseEvent) => {
      // Don't start drag when inside editable area
      if (isEditing && editableRef.current?.contains(e.target as Node)) return;
      if (e.button !== 0) return;

      e.preventDefault();
      dragStartRef.current = {
        mouseX: e.clientX, mouseY: e.clientY,
        blockX: block.x, blockY: block.y,
      };

      const handleMouseMove = (ev: globalThis.MouseEvent) => {
        if (!dragStartRef.current) return;
        const dx = ev.clientX - dragStartRef.current.mouseX;
        const dy = ev.clientY - dragStartRef.current.mouseY;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
          setIsDragging(true);
          const newX = dragStartRef.current.blockX + dx / zoom;
          const newY = dragStartRef.current.blockY - dy / zoom; // invert Y for PDF coords
          onUpdate({ ...block, x: newX, y: newY, isModified: true });
          onDirty();
        }
      };

      const handleMouseUp = () => {
        dragStartRef.current = null;
        setTimeout(() => setIsDragging(false), 0);
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [block, isEditing, zoom, onUpdate, onDirty],
  );

  // Commit text on blur or Escape
  const handleBlur = useCallback(() => {
    if (!editableRef.current) return;
    const newText = editableRef.current.innerText;
    if (newText !== block.text) {
      onUpdate({ ...block, text: newText, isModified: true });
      onDirty();
    }
    onStopEditing();
  }, [block, onUpdate, onStopEditing, onDirty]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        // Revert and exit editing
        if (editableRef.current) {
          editableRef.current.innerText = block.text;
        }
        onStopEditing();
        return;
      }
      // Delete block if empty and backspace/delete pressed
      if ((e.key === 'Backspace' || e.key === 'Delete') && editableRef.current?.innerText === '') {
        e.preventDefault();
        onDelete();
      }
    },
    [block.text, onStopEditing, onDelete],
  );

  // Resize handle
  const handleResizeMouseDown = useCallback(
    (e: ReactMouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      const startX = e.clientX;
      const startY = e.clientY;
      const startW = block.width;
      const startH = block.height;

      const handleMouseMove = (ev: globalThis.MouseEvent) => {
        const newW = Math.max(30, startW + (ev.clientX - startX) / zoom);
        const newH = Math.max(12, startH + (ev.clientY - startY) / zoom);
        onUpdate({ ...block, width: newW, height: newH, isModified: true });
        onDirty();
      };

      const handleMouseUp = () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [block, zoom, onUpdate, onDirty],
  );

  // Border styling — only show borders on hover/selection, not by default
  const borderStyle = isSelected
    ? '2px dashed #3b82f6'
    : 'none';

  return (
    <div
      ref={containerRef}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onMouseDown={handleMouseDown}
      onContextMenu={onContextMenu}
      style={{
        position: 'absolute',
        top,
        left,
        width: cssWidth,
        minHeight: cssHeight,
        border: borderStyle,
        cursor: isEditing ? 'text' : isSelected ? 'move' : 'pointer',
        pointerEvents: 'auto',
        zIndex: isSelected ? 10 : 1,
        boxSizing: 'border-box',
        backgroundColor: isSelected ? 'rgba(255,255,255,0.9)' : 'transparent',
        borderRadius: 2,
      }}
      onMouseEnter={(e) => {
        if (!isSelected) e.currentTarget.style.border = '1px dashed #93c5fd';
      }}
      onMouseLeave={(e) => {
        if (!isSelected) e.currentTarget.style.border = 'none';
      }}
    >
      {isEditing ? (
        <div
          ref={editableRef}
          contentEditable
          suppressContentEditableWarning
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          spellCheck={false}
          style={{
            width: '100%',
            minHeight: cssHeight,
            fontSize,
            fontFamily: mapFontToCSS(block.fontName),
            fontWeight: block.bold ? 'bold' : 'normal',
            fontStyle: block.italic ? 'italic' : 'normal',
            textDecoration: block.underline ? 'underline' : 'none',
            color: block.color,
            textAlign: block.alignment as React.CSSProperties['textAlign'],
            lineHeight: 1.2,
            padding: 0,
            margin: 0,
            outline: 'none',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {block.text}
        </div>
      ) : (
        <div
          style={{
            fontSize,
            fontFamily: mapFontToCSS(block.fontName),
            fontWeight: block.bold ? 'bold' : 'normal',
            fontStyle: block.italic ? 'italic' : 'normal',
            textDecoration: block.underline ? 'underline' : 'none',
            // Transparent text in non-editing mode — canvas already renders the text.
            // This div acts as a click target; text becomes visible only when selected.
            color: isSelected ? block.color : 'transparent',
            textAlign: block.alignment as React.CSSProperties['textAlign'],
            lineHeight: 1.2,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            userSelect: 'none',
          }}
        >
          {block.text}
        </div>
      )}

      {/* Resize handles at corners — shown when selected */}
      {isSelected && !isEditing && (
        <>
          {/* Bottom-right resize handle */}
          <div
            onMouseDown={handleResizeMouseDown}
            style={{
              position: 'absolute',
              bottom: -4,
              right: -4,
              width: 8,
              height: 8,
              background: '#3b82f6',
              cursor: 'se-resize',
              borderRadius: 2,
              pointerEvents: 'auto',
            }}
          />
          {/* Top-left indicator */}
          <div
            style={{
              position: 'absolute',
              top: -4,
              left: -4,
              width: 8,
              height: 8,
              background: '#3b82f6',
              borderRadius: 2,
              pointerEvents: 'none',
            }}
          />
          {/* Top-right indicator */}
          <div
            style={{
              position: 'absolute',
              top: -4,
              right: -4,
              width: 8,
              height: 8,
              background: '#3b82f6',
              borderRadius: 2,
              pointerEvents: 'none',
            }}
          />
          {/* Bottom-left indicator */}
          <div
            style={{
              position: 'absolute',
              bottom: -4,
              left: -4,
              width: 8,
              height: 8,
              background: '#3b82f6',
              borderRadius: 2,
              pointerEvents: 'none',
            }}
          />
        </>
      )}
    </div>
  );
}
