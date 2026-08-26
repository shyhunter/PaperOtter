// ImageBlockLayer: renders, moves and resizes image blocks over a PDF page.
//
// The editor's types and its PDF export both handled image blocks already --
// nothing could put one on a page or move it once there. That gap is why a
// script signature had nowhere to live: it cannot be PDF text, so it has to be
// an image, and images were a write-only part of the model.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { useEditorContext } from '@/context/EditorContext';
import type { ImageBlock } from '@/types/editor';
import { resizeFromCorner, type Corner } from '@/lib/blockResize';
import { t } from '@/i18n';

interface ImageBlockLayerProps {
  pageIndex: number;
  pageHeight: number;  // PDF points
  zoom: number;
}

/** Movement below this many screen pixels is a click, not a drag. */
const DRAG_THRESHOLD_PX = 3;

const RESIZE_LIMITS = { minWidth: 12, minHeight: 8 };

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

const CORNERS: { corner: Corner; style: React.CSSProperties; cursor: string }[] = [
  { corner: 'top-left', style: { top: -5, left: -5 }, cursor: 'nwse-resize' },
  { corner: 'top-right', style: { top: -5, right: -5 }, cursor: 'nesw-resize' },
  { corner: 'bottom-left', style: { bottom: -5, left: -5 }, cursor: 'nesw-resize' },
  { corner: 'bottom-right', style: { bottom: -5, right: -5 }, cursor: 'nwse-resize' },
];

export function ImageBlockLayer({ pageIndex, pageHeight, zoom }: ImageBlockLayerProps) {
  const { state, selectBlock, updateImageBlock, deleteImageBlock, markDirty } = useEditorContext();
  const blocks = state.pages[pageIndex]?.imageBlocks ?? [];

  const selectedId = state.selectedBlockId;
  const selectedOnThisPage = blocks.some((b) => b.id === selectedId);

  // Delete removes the selected stamp. Without it a misplaced signature can
  // only be undone by reverting the whole document.
  useEffect(() => {
    if (!selectedId || !selectedOnThisPage) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      const target = e.target as HTMLElement | null;
      // Never steal the key from somewhere the user is typing.
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA)$/.test(target.tagName))) return;
      e.preventDefault();
      deleteImageBlock(pageIndex, selectedId!);
      markDirty();
    }

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [selectedId, selectedOnThisPage, pageIndex, deleteImageBlock, markDirty]);

  if (blocks.length === 0) return null;

  return (
    // Ignores pointer events itself so clicks meant for the text layer beneath
    // are not swallowed by the empty space around a stamp.
    <div className="absolute inset-0" style={{ pointerEvents: 'none' }}>
      {blocks.map((block) => (
        <ImageBlockView
          key={block.id}
          block={block}
          pageIndex={pageIndex}
          pageHeight={pageHeight}
          zoom={zoom}
          isSelected={block.id === selectedId}
          onSelect={selectBlock}
          onUpdate={updateImageBlock}
          onDirty={markDirty}
        />
      ))}
    </div>
  );
}

interface ImageBlockViewProps {
  block: ImageBlock;
  pageIndex: number;
  pageHeight: number;
  zoom: number;
  isSelected: boolean;
  onSelect: (id: string | null) => void;
  onUpdate: (pageIdx: number, block: ImageBlock) => void;
  onDirty: () => void;
}

function ImageBlockView({
  block, pageIndex, pageHeight, zoom, isSelected, onSelect, onUpdate, onDirty,
}: ImageBlockViewProps) {
  const [isDragging, setIsDragging] = useState(false);
  const startRef = useRef<{ mouseX: number; mouseY: number; block: ImageBlock } | null>(null);

  // Revoked on unmount and whenever the bytes change; a stamp that outlives its
  // URL would render as a broken image.
  const src = useMemo(() => {
    const blob = new Blob([block.imageBytes.slice().buffer as ArrayBuffer], { type: 'image/png' });
    return URL.createObjectURL(blob);
  }, [block.imageBytes]);

  useEffect(() => () => URL.revokeObjectURL(src), [src]);

  const beginGesture = useCallback(
    (e: ReactMouseEvent, onMove: (dx: number, dy: number, start: ImageBlock) => Partial<ImageBlock>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      startRef.current = { mouseX: e.clientX, mouseY: e.clientY, block };

      const handleMouseMove = (ev: globalThis.MouseEvent) => {
        const start = startRef.current;
        if (!start) return;
        const dx = ev.clientX - start.mouseX;
        const dy = ev.clientY - start.mouseY;
        if (Math.abs(dx) < DRAG_THRESHOLD_PX && Math.abs(dy) < DRAG_THRESHOLD_PX) return;

        setIsDragging(true);
        onUpdate(pageIndex, { ...start.block, ...onMove(dx, dy, start.block) });
        onDirty();
      };

      const handleMouseUp = () => {
        startRef.current = null;
        setTimeout(() => setIsDragging(false), 0);
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [block, pageIndex, onUpdate, onDirty],
  );

  const handleMoveMouseDown = useCallback(
    (e: ReactMouseEvent) =>
      beginGesture(e, (dx, dy, start) => ({
        x: start.x + dx / zoom,
        // Screen down is down the page, which is less Y in PDF coordinates.
        y: start.y - dy / zoom,
      })),
    [beginGesture, zoom],
  );

  const handleResizeMouseDown = useCallback(
    (e: ReactMouseEvent, corner: Corner) =>
      beginGesture(e, (dx, dy, start) =>
        resizeFromCorner(start, corner, dx / zoom, -dy / zoom, RESIZE_LIMITS),
      ),
    [beginGesture, zoom],
  );

  // PDF y is the bottom edge; CSS top runs from the other end of the page.
  const top = (pageHeight - block.y - block.height) * zoom;
  const left = block.x * zoom;

  return (
    <div
      data-testid={`image-block-${block.id}`}
      onMouseDown={handleMoveMouseDown}
      onClick={(e) => {
        e.stopPropagation();
        if (!isDragging) onSelect(block.id);
      }}
      style={{
        position: 'absolute',
        left,
        top,
        width: block.width * zoom,
        height: block.height * zoom,
        cursor: isDragging ? 'grabbing' : 'grab',
        pointerEvents: 'auto',
        outline: isSelected ? '2px dashed #3b82f6' : 'none',
      }}
    >
      <img
        src={src}
        alt={t('pdfEditor.placedSignature')}
        draggable={false}
        style={{ width: '100%', height: '100%', display: 'block', pointerEvents: 'none' }}
      />

      {isSelected && CORNERS.map(({ corner, style, cursor }) => (
        <div
          key={corner}
          data-testid={`image-resize-${corner}`}
          title={t('imageBlockLayer.resizeFromCorner', { corner: cornerLabel(corner) })}
          onMouseDown={(e) => handleResizeMouseDown(e, corner)}
          style={{
            position: 'absolute',
            ...style,
            width: 10,
            height: 10,
            background: '#3b82f6',
            border: '1px solid white',
            borderRadius: 2,
            cursor,
            pointerEvents: 'auto',
          }}
        />
      ))}
    </div>
  );
}
