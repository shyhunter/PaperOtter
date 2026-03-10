// TextOverlay: Renders editable text divs positioned over the PDF canvas.
// Each text block has an opaque white background covering the canvas text beneath.
// Single click → select + show textarea for editing. Double click → select all.
// "+T" mode → click empty area to add new text.

import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react';
import type { TextBlock, EditorMode } from '@/types/editor';

/** Map PDF font names to web-safe CSS font stacks */
function mapFontToCSS(fontName: string): string {
  const lower = fontName.toLowerCase();
  if (lower.includes('courier')) return '"Courier New", Courier, monospace';
  if (lower.includes('times')) return '"Times New Roman", Times, serif';
  return 'Helvetica, Arial, sans-serif';
}

interface TextOverlayProps {
  textBlocks: TextBlock[];
  scale: number;
  pageHeight: number;
  selectedId: string | null;
  editorMode: EditorMode;
  onSelect: (id: string | null) => void;
  onTextChange: (id: string, newText: string, newProps?: Partial<TextBlock>) => void;
  onTextDelete: (id: string) => void;
  onTextAdd: (block: TextBlock) => void;
  onTextMove?: (id: string, x: number, y: number) => void;
  onTextResize?: (id: string, width: number, height: number) => void;
}

export function TextOverlay({
  textBlocks,
  scale,
  pageHeight,
  selectedId,
  editorMode,
  onSelect,
  onTextChange,
  onTextDelete,
  onTextAdd,
  onTextMove,
  onTextResize,
}: TextOverlayProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  const handleOverlayClick = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      if (e.target !== overlayRef.current) return;

      if (editorMode === 'text') {
        const rect = overlayRef.current!.getBoundingClientRect();
        const pdfX = (e.clientX - rect.left) / scale;
        const pdfY = pageHeight - (e.clientY - rect.top) / scale;

        onTextAdd({
          id: crypto.randomUUID(),
          pageIndex: 0,
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
        });
      } else {
        onSelect(null);
      }
    },
    [editorMode, scale, pageHeight, onTextAdd, onSelect],
  );

  return (
    <div
      ref={overlayRef}
      className="absolute inset-0 pointer-events-auto"
      style={{ cursor: editorMode === 'text' ? 'crosshair' : 'default' }}
      onClick={handleOverlayClick}
    >
      {textBlocks.map((block) => (
        <TextBlockDiv
          key={block.id}
          block={block}
          scale={scale}
          pageHeight={pageHeight}
          isSelected={block.id === selectedId}
          onSelect={onSelect}
          onTextChange={onTextChange}
          onDelete={onTextDelete}
          onMove={onTextMove}
          onResize={onTextResize}
        />
      ))}
    </div>
  );
}

// --- Individual text block ---

interface TextBlockDivProps {
  block: TextBlock;
  scale: number;
  pageHeight: number;
  isSelected: boolean;
  onSelect: (id: string | null) => void;
  onTextChange: (id: string, newText: string, newProps?: Partial<TextBlock>) => void;
  onDelete: (id: string) => void;
  onMove?: (id: string, x: number, y: number) => void;
  onResize?: (id: string, width: number, height: number) => void;
}

function TextBlockDiv({
  block,
  scale,
  pageHeight,
  isSelected,
  onSelect,
  onTextChange,
  onDelete,
  onMove,
  onResize,
}: TextBlockDivProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [localText, setLocalText] = useState(block.text);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{
    mouseX: number; mouseY: number; blockX: number; blockY: number;
  } | null>(null);

  // Keep local text in sync when block.text changes from outside (undo/redo)
  useEffect(() => {
    if (!isSelected) {
      setLocalText(block.text);
    }
  }, [block.text, isSelected]);

  // Auto-focus textarea when selected
  useEffect(() => {
    if (isSelected && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isSelected]);

  // PDF → CSS coordinate conversion
  const top = (pageHeight - block.y - block.height) * scale;
  const left = block.x * scale;
  const cssWidth = block.width * scale;
  const cssHeight = block.height * scale;
  const fontSize = block.fontSize * scale;

  // Click: select this block
  const handleClick = useCallback(
    (e: MouseEvent) => {
      e.stopPropagation();
      if (isDragging) return;
      onSelect(block.id);
    },
    [block.id, onSelect, isDragging],
  );

  // Double-click: select all text in the textarea
  const handleDoubleClick = useCallback(
    (e: MouseEvent) => {
      e.stopPropagation();
      onSelect(block.id);
      setTimeout(() => textareaRef.current?.select(), 0);
    },
    [block.id, onSelect],
  );

  // Drag: only on the container border area or when not focused in textarea
  const handleMouseDown = useCallback(
    (e: MouseEvent) => {
      // Don't drag when clicking inside the textarea
      if (e.target === textareaRef.current) return;
      if (!onMove || e.button !== 0) return;

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
          onMove(block.id,
            dragStartRef.current.blockX + dx / scale,
            dragStartRef.current.blockY - dy / scale,
          );
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
    [onMove, block.id, block.x, block.y, scale],
  );

  // Resize handle
  const handleResizeMouseDown = useCallback(
    (e: MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      if (!onResize) return;
      const startX = e.clientX;
      const startY = e.clientY;
      const startW = block.width;
      const startH = block.height;
      const handleMouseMove = (ev: globalThis.MouseEvent) => {
        onResize(block.id,
          Math.max(30, startW + (ev.clientX - startX) / scale),
          Math.max(12, startH + (ev.clientY - startY) / scale),
        );
      };
      const handleMouseUp = () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [onResize, block.id, block.width, block.height, scale],
  );

  // Commit text changes on blur
  const handleBlur = useCallback(() => {
    if (localText !== block.text) {
      onTextChange(block.id, localText);
    }
  }, [block.id, block.text, localText, onTextChange]);

  // Keyboard shortcuts in the textarea
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        // Revert local text and deselect
        setLocalText(block.text);
        onSelect(null);
      }
      // Delete block when empty and pressing Backspace/Delete
      if ((e.key === 'Backspace' || e.key === 'Delete') && localText === '') {
        e.preventDefault();
        onDelete(block.id);
      }
    },
    [block.id, block.text, localText, onSelect, onDelete],
  );

  // Border styling
  const borderStyle = isSelected
    ? '2px solid #3b82f6'
    : '1px solid transparent';
  const hoverBorder = !isSelected ? '1px solid #93c5fd' : undefined;

  return (
    <div
      ref={containerRef}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onMouseDown={handleMouseDown}
      style={{
        position: 'absolute',
        top,
        left,
        width: cssWidth,
        minHeight: cssHeight,
        // Opaque white background covers the canvas text
        backgroundColor: 'white',
        border: borderStyle,
        cursor: isSelected ? 'text' : 'pointer',
        pointerEvents: 'auto',
        zIndex: isSelected ? 10 : 1,
        // Padding matches the border difference so text doesn't shift
        padding: isSelected ? 0 : 0.5,
        boxSizing: 'border-box',
      }}
      onMouseEnter={(e) => {
        if (!isSelected) (e.currentTarget.style.border = hoverBorder ?? '');
      }}
      onMouseLeave={(e) => {
        if (!isSelected) (e.currentTarget.style.border = borderStyle);
      }}
    >
      {isSelected ? (
        // Editable textarea — real input, no contentEditable hacks
        <textarea
          ref={textareaRef}
          value={localText}
          onChange={(e) => setLocalText(e.target.value)}
          aria-label="Edit text block"
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          spellCheck={false}
          style={{
            width: '100%',
            height: '100%',
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
            border: 'none',
            outline: 'none',
            background: 'transparent',
            resize: 'none',
            overflow: 'hidden',
            display: 'block',
          }}
        />
      ) : (
        // Static display — shows text with matching styling
        <div
          style={{
            fontSize,
            fontFamily: mapFontToCSS(block.fontName),
            fontWeight: block.bold ? 'bold' : 'normal',
            fontStyle: block.italic ? 'italic' : 'normal',
            textDecoration: block.underline ? 'underline' : 'none',
            color: block.color,
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

      {/* Resize handle — bottom-right */}
      {isSelected && onResize && (
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
      )}
    </div>
  );
}
