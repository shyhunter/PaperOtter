// TextOverlay: Renders editable text divs positioned over the PDF canvas.
// Each text item is absolutely positioned using PDF coordinates converted to CSS.
// PDF y=0 is bottom, CSS y=0 is top — conversion uses pageHeight.

import { useCallback, useRef, useState, type MouseEvent } from 'react';
import type { TextBlock, EditorMode } from '@/types/editor';

/** Map PDF font names to web-safe CSS font stacks */
function mapFontToCSS(fontName: string): string {
  const lower = fontName.toLowerCase();
  if (lower.includes('courier')) return '"Courier New", Courier, monospace';
  if (lower.includes('times')) return '"Times New Roman", Times, serif';
  // Default: Helvetica / sans-serif (covers Helvetica, Arial, and unknown fonts)
  return 'Helvetica, Arial, sans-serif';
}

interface TextOverlayProps {
  /** Text blocks to render */
  textBlocks: TextBlock[];
  /** Canvas scale factor (CSS pixels per PDF point) */
  scale: number;
  /** Page height in PDF points (for y-coordinate conversion) */
  pageHeight: number;
  /** Currently selected block ID */
  selectedId: string | null;
  /** Current editor mode */
  editorMode: EditorMode;
  /** Called when a block is selected */
  onSelect: (id: string | null) => void;
  /** Called when text or props change */
  onTextChange: (id: string, newText: string, newProps?: Partial<TextBlock>) => void;
  /** Called when a text block is deleted */
  onTextDelete: (id: string) => void;
  /** Called when a new text block is added */
  onTextAdd: (block: TextBlock) => void;
  /** Called when a text block is repositioned via drag */
  onTextMove?: (id: string, x: number, y: number) => void;
  /** Called when a text block is resized */
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

  // Handle click on empty canvas area — creates new text block in 'text' mode
  const handleOverlayClick = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      // Only create new text blocks in text mode and when clicking the overlay itself
      if (editorMode !== 'text' || e.target !== overlayRef.current) {
        // Clicked on empty area in select mode — deselect
        if (e.target === overlayRef.current) {
          onSelect(null);
        }
        return;
      }

      const rect = overlayRef.current!.getBoundingClientRect();
      const cssX = e.clientX - rect.left;
      const cssY = e.clientY - rect.top;

      // Convert CSS coordinates back to PDF points
      const pdfX = cssX / scale;
      // CSS top -> PDF bottom: y = pageHeight - cssTop/scale
      const pdfY = pageHeight - cssY / scale;

      const newBlock: TextBlock = {
        id: crypto.randomUUID(),
        pageIndex: 0, // will be set by parent
        x: pdfX,
        y: pdfY,
        width: 150,
        height: 16,
        text: 'New text',
        fontSize: 12,
        fontName: 'Helvetica',
        color: '#000000',
        alignment: 'left',
        bold: false,
        italic: false,
        underline: false,
        isNew: true,
      };

      onTextAdd(newBlock);
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

// --- Individual text block overlay div ---

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
  onMove,
  onResize,
}: TextBlockDivProps) {
  const divRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const dragStartRef = useRef<{ mouseX: number; mouseY: number; blockX: number; blockY: number } | null>(null);

  // PDF y=0 is bottom-left; CSS y=0 is top-left
  const top = (pageHeight - block.y - block.height) * scale;
  const left = block.x * scale;
  const minHeight = block.height * scale;
  const fontSize = block.fontSize * scale;

  const handleClick = useCallback(
    (e: MouseEvent) => {
      e.stopPropagation();
      if (isDragging) return;
      if (!isSelected) {
        // First click: select the block
        onSelect(block.id);
        setTimeout(() => divRef.current?.focus(), 0);
      }
      // If already selected, click places cursor inside (contentEditable handles it)
    },
    [block.id, onSelect, isDragging, isSelected],
  );

  // Double-click enters full edit mode (shows text cursor, disables drag)
  const handleDoubleClick = useCallback(
    (e: MouseEvent) => {
      e.stopPropagation();
      if (!isSelected) {
        onSelect(block.id);
      }
      setIsEditing(true);
      setTimeout(() => divRef.current?.focus(), 0);
    },
    [block.id, isSelected, onSelect],
  );

  // Drag support: mousedown on selected block starts drag (only when not in edit mode)
  const handleMouseDown = useCallback(
    (e: MouseEvent) => {
      if (!isSelected || !onMove || isEditing) return;
      if (e.button !== 0) return;
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0 && sel.toString().length > 0) return;

      dragStartRef.current = {
        mouseX: e.clientX,
        mouseY: e.clientY,
        blockX: block.x,
        blockY: block.y,
      };

      const handleMouseMove = (ev: globalThis.MouseEvent) => {
        if (!dragStartRef.current) return;
        const dx = ev.clientX - dragStartRef.current.mouseX;
        const dy = ev.clientY - dragStartRef.current.mouseY;
        // Only start actual drag if moved > 3px to avoid accidental drags
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
          setIsDragging(true);
          const newX = dragStartRef.current.blockX + dx / scale;
          // CSS y is inverted from PDF y
          const newY = dragStartRef.current.blockY - dy / scale;
          onMove(block.id, newX, newY);
        }
      };

      const handleMouseUp = () => {
        dragStartRef.current = null;
        // Reset dragging flag after a tick so click handler can check it
        setTimeout(() => setIsDragging(false), 0);
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [isSelected, isEditing, onMove, block.id, block.x, block.y, scale],
  );

  // Resize support: drag bottom-right handle
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
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        const newW = Math.max(20, startW + dx / scale);
        // Height grows downward in CSS but upward in PDF
        const newH = Math.max(10, startH + dy / scale);
        onResize(block.id, newW, newH);
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

  const handleBlur = useCallback(() => {
    const newText = divRef.current?.innerText ?? block.text;
    if (newText !== block.text) {
      onTextChange(block.id, newText);
    }
    setIsEditing(false);
  }, [block.id, block.text, onTextChange]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        divRef.current?.blur();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        onSelect(null);
        divRef.current?.blur();
      }
    },
    [onSelect],
  );

  return (
    <div
      ref={divRef}
      contentEditable={isSelected && !isDragging}
      suppressContentEditableWarning
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onMouseDown={handleMouseDown}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      className={[
        'absolute whitespace-pre-wrap outline-none transition-shadow duration-150',
        isSelected && isEditing
          ? 'ring-2 ring-blue-500 bg-blue-50/20 shadow-sm cursor-text'
          : isSelected
            ? 'ring-2 ring-blue-500 bg-blue-50/10 shadow-sm cursor-move'
            : 'hover:ring-1 hover:ring-blue-300 hover:bg-blue-50/10 cursor-text',
      ].join(' ')}
      style={{
        top,
        left,
        width: block.width * scale,
        minHeight,
        fontSize,
        fontFamily: mapFontToCSS(block.fontName),
        fontWeight: block.bold ? 'bold' : 'normal',
        fontStyle: block.italic ? 'italic' : 'normal',
        textDecoration: block.underline ? 'underline' : 'none',
        color: block.color,
        textAlign: block.alignment as React.CSSProperties['textAlign'],
        lineHeight: 1.2,
        padding: '0 1px',
        pointerEvents: 'auto',
        userSelect: isDragging ? 'none' : 'auto',
      }}
    >
      {block.text}
      {/* Resize handle — bottom-right corner */}
      {isSelected && onResize && (
        <div
          onMouseDown={handleResizeMouseDown}
          className="absolute bottom-0 right-0 w-3 h-3 bg-blue-500 cursor-se-resize rounded-tl-sm"
          style={{ pointerEvents: 'auto', transform: 'translate(50%, 50%)' }}
        />
      )}
    </div>
  );
}
