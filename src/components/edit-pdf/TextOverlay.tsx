// TextOverlay: Renders editable text divs positioned over the PDF canvas.
// Each text item is absolutely positioned using PDF coordinates converted to CSS.
// PDF y=0 is bottom, CSS y=0 is top — conversion uses pageHeight.

import { useCallback, useRef, type MouseEvent } from 'react';
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
}

function TextBlockDiv({
  block,
  scale,
  pageHeight,
  isSelected,
  onSelect,
  onTextChange,
}: TextBlockDivProps) {
  const divRef = useRef<HTMLDivElement>(null);

  // PDF y=0 is bottom-left; CSS y=0 is top-left
  // top = (pageHeight - y - height) * scale  (y is baseline, height is ascent)
  const top = (pageHeight - block.y - block.height) * scale;
  const left = block.x * scale;
  const minHeight = block.height * scale;
  const fontSize = block.fontSize * scale;

  const handleClick = useCallback(
    (e: MouseEvent) => {
      e.stopPropagation();
      onSelect(block.id);
      // Focus the div for editing when selected
      setTimeout(() => divRef.current?.focus(), 0);
    },
    [block.id, onSelect],
  );

  const handleBlur = useCallback(() => {
    const newText = divRef.current?.innerText ?? block.text;
    if (newText !== block.text) {
      onTextChange(block.id, newText);
    }
  }, [block.id, block.text, onTextChange]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Enter without shift commits the edit
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        divRef.current?.blur();
      }
      // Escape deselects
      if (e.key === 'Escape') {
        e.preventDefault();
        onSelect(null);
        divRef.current?.blur();
      }
    },
    [onSelect],
  );

  const alignmentMap: Record<string, string> = {
    left: 'left',
    center: 'center',
    right: 'right',
  };

  return (
    <div
      ref={divRef}
      contentEditable={isSelected}
      suppressContentEditableWarning
      onClick={handleClick}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      className={[
        'absolute whitespace-pre-wrap outline-none transition-shadow',
        isSelected
          ? 'ring-2 ring-blue-500 bg-blue-50/20'
          : 'hover:bg-yellow-100/30 cursor-text',
      ].join(' ')}
      style={{
        top,
        left,
        minHeight,
        fontSize,
        fontFamily: mapFontToCSS(block.fontName),
        color: block.color,
        textAlign: alignmentMap[block.alignment] as React.CSSProperties['textAlign'],
        lineHeight: 1.2,
        padding: '0 1px',
        // Ensure text blocks are interactive
        pointerEvents: 'auto',
      }}
    >
      {block.text}
    </div>
  );
}
