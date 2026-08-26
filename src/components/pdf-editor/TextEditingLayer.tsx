// TextEditingLayer: overlay that renders selectable/editable text blocks on each PDF page.
// Extracts text from PDF via pdfTextExtract, positions each block over the canvas.
// Click to select, double-click to edit inline, drag to reposition, Escape to deselect.
//
// CRITICAL: Uses pdfBytes.slice() for React StrictMode safety.

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { extractPageText, type ExtractedTextItem } from '@/lib/pdfTextExtract';
import { useEditorContext } from '@/context/EditorContext';
import type { TextBlock } from '@/types/editor';
import { resizeFromCorner, type Corner } from '@/lib/blockResize';

/** Floors for a resized block, in PDF points. */
const RESIZE_LIMITS = { minWidth: 30, minHeight: 12 };

/** Corner names for the resize handles, so the tooltip is not English-only. */
function cornerLabel(corner: Corner): string {
  const labels: Record<Corner, string> = {
    'top-left': t('pdfEditor.topLeft'),
    'top-right': t('pdfEditor.topRight'),
    'bottom-left': t('pdfEditor.bottomLeft'),
    'bottom-right': t('pdfEditor.bottomRight'),
  };
  return labels[corner];
}

/** Where each corner handle sits, and what the cursor promises it will do. */
const CORNERS: { corner: Corner; style: React.CSSProperties; cursor: string }[] = [
  { corner: 'top-left', style: { top: -5, left: -5 }, cursor: 'nwse-resize' },
  { corner: 'top-right', style: { top: -5, right: -5 }, cursor: 'nesw-resize' },
  { corner: 'bottom-left', style: { bottom: -5, left: -5 }, cursor: 'nesw-resize' },
  { corner: 'bottom-right', style: { bottom: -5, right: -5 }, cursor: 'nwse-resize' },
];
import { diagLog } from '@/lib/diagLog';
import { t } from '@/i18n';

/** Hook to forward pinch-to-zoom from an overlay div to the editor zoom.
 *  Needed because WKWebView gesture events don't always bubble through overlays. */
function usePinchZoomForwarding(
  overlayRef: React.RefObject<HTMLDivElement | null>,
  setZoom: (z: number) => void,
  zoomRef: React.MutableRefObject<number>,
) {
  useEffect(() => {
    const el = overlayRef.current;
    if (!el) return;

    function handleWheel(e: WheelEvent) {
      if (e.ctrlKey) {
        e.preventDefault();
        e.stopPropagation();
        const delta = -e.deltaY * 0.01;
        const newZoom = Math.min(3.0, Math.max(0.25, zoomRef.current + delta));
        setZoom(newZoom);
      }
    }

    let gestureStartZoom = 1.0;
    function handleGestureStart(e: Event) {
      e.preventDefault();
      gestureStartZoom = zoomRef.current;
    }
    function handleGestureChange(e: Event) {
      e.preventDefault();
      const ge = e as unknown as { scale: number };
      const newZoom = Math.min(3.0, Math.max(0.25, gestureStartZoom * ge.scale));
      setZoom(newZoom);
    }

    el.addEventListener('wheel', handleWheel, { passive: false });
    el.addEventListener('gesturestart', handleGestureStart, { passive: false } as AddEventListenerOptions);
    el.addEventListener('gesturechange', handleGestureChange, { passive: false } as AddEventListenerOptions);

    return () => {
      el.removeEventListener('wheel', handleWheel);
      el.removeEventListener('gesturestart', handleGestureStart);
      el.removeEventListener('gesturechange', handleGestureChange);
    };
  }, [overlayRef, setZoom, zoomRef]);
}

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
    lineHeight: 1.2,
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
    setZoom,
  } = useEditorContext();

  const { pdfBytes, selectedBlockId, editingBlockId, editorMode, pages } = state;
  const pageState = pages[pageIndex];
  // Memoised so the `?? []` fallback does not hand out a new array each render.
  const textBlocks = useMemo(() => pageState?.textBlocks ?? [], [pageState]);

  const overlayRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  // Forward pinch-to-zoom gestures from the overlay to editor zoom
  usePinchZoomForwarding(overlayRef, setZoom, zoomRef);
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

      diagLog(`textExtract.start idx=${pageIndex}`);
      const t0 = performance.now();
      try {
        const items = await extractPageText(pdfBytes, pageIndex);
        diagLog(`textExtract.done idx=${pageIndex} ms=${(performance.now() - t0).toFixed(0)} items=${items.length}`);
        const blocks = items.map((item) => extractedToBlock(item, pageIndex));
        extractionCache.set(cacheKey, blocks);
        if (!cancelled) {
          setPageTextBlocks(pageIndex, blocks);
          setIsExtracted(true);
        }
      } catch (err) {
        diagLog(`textExtract.threw idx=${pageIndex} ms=${(performance.now() - t0).toFixed(0)} ${err}`);
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
          lineHeight: 1.2,
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

      const action = window.confirm(t('textEditingLayer.deleteTextBlockConfirm', { text: block.text.slice(0, 30) }));
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
  const fontSize = block.fontSize * zoom;
  // Use auto height — let content determine size so font/spacing changes expand naturally
  // The white background will grow with the content, covering original text below

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
    // Always persist text for new blocks, or when text changed for existing blocks
    if (newText !== block.text || block.isNew) {
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

  // Resize from any corner. Every move is measured against the block as it was
  // when the mouse went down, so a long drag cannot accumulate rounding.
  const handleResizeMouseDown = useCallback(
    (e: ReactMouseEvent, corner: Corner) => {
      e.stopPropagation();
      e.preventDefault();
      const startX = e.clientX;
      const startY = e.clientY;
      const start = { x: block.x, y: block.y, width: block.width, height: block.height };

      const handleMouseMove = (ev: globalThis.MouseEvent) => {
        const resized = resizeFromCorner(
          start,
          corner,
          (ev.clientX - startX) / zoom,
          // Screen down is down the page, which is less Y in PDF coordinates.
          -(ev.clientY - startY) / zoom,
          RESIZE_LIMITS,
        );
        onUpdate({ ...block, ...resized, isModified: true });
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
        border: borderStyle,
        cursor: isEditing ? 'text' : isSelected ? 'move' : 'pointer',
        pointerEvents: 'auto',
        zIndex: isSelected ? 10 : 1,
        boxSizing: 'border-box',
        backgroundColor: (block.isModified || block.isNew || isSelected) ? 'rgba(255,255,255,0.98)' : 'transparent',
        borderRadius: 2,
        // Pad bottom to cover original text that may be below after font/spacing change
        paddingBottom: (block.isModified || block.isNew) ? Math.max(2, fontSize * 0.3) : 0,
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
            fontSize,
            fontFamily: mapFontToCSS(block.fontName),
            fontWeight: block.bold ? 'bold' : 'normal',
            fontStyle: block.italic ? 'italic' : 'normal',
            textDecoration: block.underline ? 'underline' : 'none',
            color: block.color,
            textAlign: block.alignment as React.CSSProperties['textAlign'],
            lineHeight: block.lineHeight ?? 1.2,
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
            // Modified/new blocks must always be visible (with white bg to cover original canvas text).
            // Unmodified blocks stay transparent — canvas already renders the text.
            color: (block.isModified || block.isNew || isSelected) ? block.color : 'transparent',
            textAlign: block.alignment as React.CSSProperties['textAlign'],
            lineHeight: block.lineHeight ?? 1.2,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            userSelect: 'none',
          }}
        >
          {block.text}
        </div>
      )}

      {/* All four corners resize, and each keeps the opposite corner pinned.
          Three of these used to be decoration -- they looked exactly like the
          working one and did nothing, which is worse than not drawing them. */}
      {isSelected && !isEditing && (
        <>
          {CORNERS.map(({ corner, style, cursor }) => (
            <div
              key={corner}
              data-testid={`resize-${corner}`}
              title={t('imageBlockLayer.resizeFromCorner', { corner: cornerLabel(corner) })}
              onMouseDown={(e) => handleResizeMouseDown(e, corner)}
              style={{
                position: 'absolute',
                ...style,
                width: 10,
                height: 10,
                background: '#3b82f6',
                border: '1px solid white',
                cursor,
                borderRadius: 2,
                pointerEvents: 'auto',
              }}
            />
          ))}
        </>
      )}
    </div>
  );
}
