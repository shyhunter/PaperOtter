// WatermarkOverlay: the watermark as something you grab, drawn over the page
// canvas while the watermark tool is open.
//
// The sidebar's number fields still work and stay in step -- both edit the same
// draft in EditorContext -- but a watermark is a thing with a place on a page,
// and typing coordinates at it is the wrong way round.
import { useCallback, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { useEditorContext } from '@/context/EditorContext';
import {
  WATERMARK_FONT_SIZE_MAX,
  WATERMARK_FONT_SIZE_MIN,
  type WatermarkOptions,
} from '@/lib/pdfWatermark';

interface WatermarkOverlayProps {
  pageWidth: number;   // PDF points
  pageHeight: number;  // PDF points
  zoom: number;
}

/** Movement below this many screen pixels is a click, not a drag. */
const DRAG_THRESHOLD_PX = 3;

/** How far down-and-right of the centre the resize handle sits. */
const HANDLE_OFFSET_PX = 40;

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

export function WatermarkOverlay({ pageWidth, pageHeight, zoom }: WatermarkOverlayProps) {
  const { state, setWatermarkDraft } = useEditorContext();
  const draft = state.watermarkDraft;

  const [isDragging, setIsDragging] = useState(false);
  // The draft as it was when the gesture began. Every move is measured from
  // there rather than from the last frame, so rounding cannot accumulate and
  // the watermark cannot drift away from the cursor over a long drag.
  const gestureStartRef = useRef<{ mouseX: number; mouseY: number; draft: WatermarkOptions } | null>(null);

  const beginGesture = useCallback(
    (
      e: ReactMouseEvent,
      onMove: (dx: number, dy: number, start: WatermarkOptions) => Partial<WatermarkOptions>,
    ) => {
      if (e.button !== 0 || !draft) return;
      e.preventDefault();
      e.stopPropagation();

      gestureStartRef.current = { mouseX: e.clientX, mouseY: e.clientY, draft };

      const handleMouseMove = (ev: globalThis.MouseEvent) => {
        const start = gestureStartRef.current;
        if (!start) return;

        const dx = ev.clientX - start.mouseX;
        const dy = ev.clientY - start.mouseY;
        if (Math.abs(dx) < DRAG_THRESHOLD_PX && Math.abs(dy) < DRAG_THRESHOLD_PX) return;

        setIsDragging(true);
        setWatermarkDraft({ ...start.draft, ...onMove(dx, dy, start.draft) });
      };

      const handleMouseUp = () => {
        gestureStartRef.current = null;
        setIsDragging(false);
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [draft, setWatermarkDraft],
  );

  const handleMoveMouseDown = useCallback(
    (e: ReactMouseEvent) =>
      beginGesture(e, (dx, dy, start) => ({
        // Screen pixels are page points times zoom; the page is the unit the
        // fraction is expressed in, so divide by both.
        centerX: clamp(start.centerX + dx / (pageWidth * zoom), 0, 1),
        // Down on screen is down the page, which is *less* Y in PDF coordinates.
        centerY: clamp(start.centerY - dy / (pageHeight * zoom), 0, 1),
      })),
    [beginGesture, pageWidth, pageHeight, zoom],
  );

  const handleResizeMouseDown = useCallback(
    (e: ReactMouseEvent) =>
      beginGesture(e, (dx, dy, start) => {
        // Pull away from the centre to grow, toward it to shrink. Using the
        // diagonal rather than one axis means the handle responds the same way
        // whichever direction it is dragged, which is what a corner implies.
        const along = (dx + dy) / 2;
        return {
          fontSize: Math.round(
            clamp(start.fontSize + along / zoom, WATERMARK_FONT_SIZE_MIN, WATERMARK_FONT_SIZE_MAX),
          ),
        };
      }),
    [beginGesture, zoom],
  );

  // Nothing to grab until there is a watermark, and an empty one draws nothing
  // in the output either -- an invisible box would just be in the way.
  if (!draft || !draft.text.trim()) return null;

  const left = draft.centerX * pageWidth * zoom;
  // centerY runs from the bottom as PDF coordinates do; CSS top runs the other way.
  const top = (1 - draft.centerY) * pageHeight * zoom;

  return (
    // Full-page layer so both children can be placed in page coordinates. It
    // ignores pointer events itself, or it would swallow every click meant for
    // the text layer underneath.
    <div className="absolute inset-0" style={{ pointerEvents: 'none' }}>
      <div
        data-testid="watermark-overlay"
        title="Drag to move"
        onMouseDown={handleMoveMouseDown}
        style={{
          position: 'absolute',
          left,
          top,
          // CSS rotates clockwise, PDF counter-clockwise.
          transform: `translate(-50%, -50%) rotate(${-draft.rotation}deg)`,
          fontFamily: 'Helvetica, Arial, sans-serif',
          fontSize: draft.fontSize * zoom,
          lineHeight: 1,
          color: draft.color,
          opacity: draft.opacity,
          whiteSpace: 'nowrap',
          userSelect: 'none',
          cursor: isDragging ? 'grabbing' : 'grab',
          pointerEvents: 'auto',
          padding: '2px 4px',
          outline: '1px dashed rgba(59, 130, 246, 0.9)',
        }}
      >
        {draft.text}
      </div>

      {/* Offset from the centre rather than pinned to the rotated text's corner:
          a handle that swings around as the rotation changes is hard to find,
          and this one is always down-and-right of the thing it resizes. */}
      <div
        data-testid="watermark-resize-handle"
        title="Drag to resize"
        onMouseDown={handleResizeMouseDown}
        style={{
          position: 'absolute',
          left: left + HANDLE_OFFSET_PX,
          top: top + HANDLE_OFFSET_PX,
          width: 12,
          height: 12,
          marginLeft: -6,
          marginTop: -6,
          borderRadius: 2,
          background: 'rgb(59, 130, 246)',
          border: '1px solid white',
          cursor: 'nwse-resize',
          pointerEvents: 'auto',
        }}
      />
    </div>
  );
}
