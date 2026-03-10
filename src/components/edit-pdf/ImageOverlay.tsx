/**
 * ImageOverlay: Interactive image overlays on the PDF page canvas.
 * Renders each ImageBlock as a draggable, resizable element with rotation/flip support.
 * Position is in PDF coordinates; CSS transforms handle display.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ImageBlock } from '@/types/editor';

interface ImageOverlayProps {
  /** Image blocks to render */
  imageBlocks: ImageBlock[];
  /** Page height in PDF points (for coordinate conversion) */
  pageHeight: number;
  /** Current render scale (PDF points to CSS pixels) */
  scale: number;
  /** Currently selected image ID */
  selectedId: string | null;
  /** Called when an image is selected */
  onSelect: (id: string | null) => void;
  /** Called when an image property changes */
  onImageChange: (id: string, updates: Partial<ImageBlock>) => void;
  /** Called when an image is deleted */
  onImageDelete: (id: string) => void;
}

/** Resize handle positions */
type HandlePosition = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

const HANDLE_SIZE = 8;

export function ImageOverlay({
  imageBlocks,
  pageHeight,
  scale,
  selectedId,
  onSelect,
  onImageChange,
}: ImageOverlayProps) {
  return (
    <div
      className="absolute inset-0 pointer-events-none"
    >
      {imageBlocks.map((block) => (
        <ImageOverlayItem
          key={block.id}
          block={block}
          pageHeight={pageHeight}
          scale={scale}
          isSelected={block.id === selectedId}
          onSelect={onSelect}
          onImageChange={onImageChange}
        />
      ))}
    </div>
  );
}

interface ImageOverlayItemProps {
  block: ImageBlock;
  pageHeight: number;
  scale: number;
  isSelected: boolean;
  onSelect: (id: string | null) => void;
  onImageChange: (id: string, updates: Partial<ImageBlock>) => void;
}

function ImageOverlayItem({
  block,
  pageHeight,
  scale,
  isSelected,
  onSelect,
  onImageChange,
}: ImageOverlayItemProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const dragStartRef = useRef<{ startX: number; startY: number; blockX: number; blockY: number } | null>(null);
  const resizeStartRef = useRef<{
    startX: number;
    startY: number;
    blockX: number;
    blockY: number;
    blockW: number;
    blockH: number;
    handle: HandlePosition;
  } | null>(null);

  // Create object URL for image display
  const imgUrl = useMemo(() => {
    if (block.imageBytes.byteLength === 0) return null;
    const blob = new Blob([block.imageBytes], { type: 'image/png' });
    return URL.createObjectURL(blob);
  }, [block.imageBytes]);

  // Revoke URL on unmount or change
  useEffect(() => {
    return () => {
      if (imgUrl) URL.revokeObjectURL(imgUrl);
    };
  }, [imgUrl]);

  // CSS position: PDF bottom-left origin -> CSS top-left origin
  const cssLeft = block.x * scale;
  const cssTop = (pageHeight - block.y - block.height) * scale;
  const cssWidth = block.width * scale;
  const cssHeight = block.height * scale;

  // CSS transform for rotation and flip
  const transform = [
    `rotate(${block.rotation}deg)`,
    block.flipH ? 'scaleX(-1)' : '',
    block.flipV ? 'scaleY(-1)' : '',
  ]
    .filter(Boolean)
    .join(' ');

  // ── Drag handling ──────────────────────────────────────────────────────

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      onSelect(block.id);

      dragStartRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        blockX: block.x,
        blockY: block.y,
      };
      setIsDragging(true);
    },
    [block.id, block.x, block.y, onSelect],
  );

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragStartRef.current) return;
      const dx = (e.clientX - dragStartRef.current.startX) / scale;
      const dy = (e.clientY - dragStartRef.current.startY) / scale;

      // In PDF coords, moving right increases x, moving down decreases y
      const newX = Math.max(0, dragStartRef.current.blockX + dx);
      const newY = Math.max(0, dragStartRef.current.blockY - dy);

      onImageChange(block.id, { x: newX, y: newY });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      dragStartRef.current = null;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, block.id, scale, onImageChange]);

  // ── Resize handling ────────────────────────────────────────────────────

  const handleResizeStart = useCallback(
    (e: React.MouseEvent, handle: HandlePosition) => {
      e.stopPropagation();
      e.preventDefault();

      resizeStartRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        blockX: block.x,
        blockY: block.y,
        blockW: block.width,
        blockH: block.height,
        handle,
      };
      setIsResizing(true);
    },
    [block.x, block.y, block.width, block.height],
  );

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!resizeStartRef.current) return;
      const ref = resizeStartRef.current;
      const dx = (e.clientX - ref.startX) / scale;
      const dy = (e.clientY - ref.startY) / scale;
      const aspectRatio = ref.blockW / ref.blockH;

      let newX = ref.blockX;
      let newY = ref.blockY;
      let newW = ref.blockW;
      let newH = ref.blockH;

      const handle = ref.handle;

      // Apply resize based on handle position
      if (handle.includes('e')) {
        newW = Math.max(20, ref.blockW + dx);
      }
      if (handle.includes('w')) {
        const dw = Math.min(dx, ref.blockW - 20);
        newW = ref.blockW - dw;
        newX = ref.blockX + dw;
      }
      if (handle.includes('s')) {
        // In CSS, s means down = decrease PDF y
        newH = Math.max(20, ref.blockH + dy);
        newY = ref.blockY - dy;
      }
      if (handle.includes('n')) {
        const dh = Math.min(-dy, ref.blockH - 20);
        newH = ref.blockH + dh;
      }

      // Corner handles maintain aspect ratio (unless Shift is held, but default is locked)
      if (handle.length === 2) {
        // Corner handle — lock aspect ratio
        if (Math.abs(dx) > Math.abs(dy)) {
          newH = newW / aspectRatio;
        } else {
          newW = newH * aspectRatio;
        }
        // Recalculate position for corners that affect origin
        if (handle.includes('w')) {
          newX = ref.blockX + ref.blockW - newW;
        }
        if (handle.includes('s')) {
          newY = ref.blockY + ref.blockH - newH;
        }
      }

      onImageChange(block.id, { x: newX, y: newY, width: newW, height: newH });
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      resizeStartRef.current = null;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, block.id, scale, onImageChange]);

  // ── Render ─────────────────────────────────────────────────────────────

  const handlePositions: { pos: HandlePosition; style: React.CSSProperties }[] = [
    { pos: 'nw', style: { top: -HANDLE_SIZE / 2, left: -HANDLE_SIZE / 2, cursor: 'nw-resize' } },
    { pos: 'n', style: { top: -HANDLE_SIZE / 2, left: '50%', marginLeft: -HANDLE_SIZE / 2, cursor: 'n-resize' } },
    { pos: 'ne', style: { top: -HANDLE_SIZE / 2, right: -HANDLE_SIZE / 2, cursor: 'ne-resize' } },
    { pos: 'e', style: { top: '50%', marginTop: -HANDLE_SIZE / 2, right: -HANDLE_SIZE / 2, cursor: 'e-resize' } },
    { pos: 'se', style: { bottom: -HANDLE_SIZE / 2, right: -HANDLE_SIZE / 2, cursor: 'se-resize' } },
    { pos: 's', style: { bottom: -HANDLE_SIZE / 2, left: '50%', marginLeft: -HANDLE_SIZE / 2, cursor: 's-resize' } },
    { pos: 'sw', style: { bottom: -HANDLE_SIZE / 2, left: -HANDLE_SIZE / 2, cursor: 'sw-resize' } },
    { pos: 'w', style: { top: '50%', marginTop: -HANDLE_SIZE / 2, left: -HANDLE_SIZE / 2, cursor: 'w-resize' } },
  ];

  return (
    <div
      style={{
        position: 'absolute',
        left: cssLeft,
        top: cssTop,
        width: cssWidth,
        height: cssHeight,
        transform,
        cursor: isDragging ? 'grabbing' : 'grab',
        outline: isSelected ? '2px solid #3b82f6' : 'none',
        outlineOffset: 1,
        zIndex: isSelected ? 10 : 1,
        pointerEvents: 'auto',
      }}
      onMouseDown={handleMouseDown}
    >
      {imgUrl ? (
        <img
          src={imgUrl}
          alt=""
          draggable={false}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'fill',
            pointerEvents: 'none',
          }}
        />
      ) : (
        <div
          style={{
            width: '100%',
            height: '100%',
            background: 'rgba(200, 200, 200, 0.3)',
            border: '1px dashed #999',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 10,
            color: '#666',
          }}
        >
          Image
        </div>
      )}

      {/* Resize handles (shown when selected) */}
      {isSelected &&
        handlePositions.map(({ pos, style }) => (
          <div
            key={pos}
            style={{
              position: 'absolute',
              width: HANDLE_SIZE,
              height: HANDLE_SIZE,
              background: '#3b82f6',
              border: '1px solid white',
              borderRadius: 1,
              ...style,
            }}
            onMouseDown={(e) => handleResizeStart(e, pos)}
          />
        ))}
    </div>
  );
}
