// RedactOverlay: SVG overlay for drawing and displaying redaction rectangles.
// Positioned absolutely over a PagePreview canvas.
import { useState, useCallback, useRef } from 'react';
import { X } from 'lucide-react';

export interface RedactionRect {
  id: string;
  pageIndex: number;
  /** Percentage of page width (0-100) for resolution independence */
  x: number;
  /** Percentage of page height (0-100) */
  y: number;
  /** Percentage of page width */
  width: number;
  /** Percentage of page height */
  height: number;
  source: 'drawn' | 'search';
}

interface RedactOverlayProps {
  /** Redactions for the current page only */
  redactions: RedactionRect[];
  onAddRedaction: (rect: Omit<RedactionRect, 'id' | 'source'>) => void;
  onRemoveRedaction: (id: string) => void;
  width: number;
  height: number;
}

interface DrawingRect {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

function clamp(val: number, min: number, max: number) {
  return Math.min(Math.max(val, min), max);
}

export function RedactOverlay({
  redactions,
  onAddRedaction,
  onRemoveRedaction,
  width,
  height,
}: RedactOverlayProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [drawing, setDrawing] = useState<DrawingRect | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const toPercentCoords = useCallback(
    (clientX: number, clientY: number) => {
      const svg = svgRef.current;
      if (!svg) return { px: 0, py: 0 };
      const rect = svg.getBoundingClientRect();
      const px = clamp(((clientX - rect.left) / rect.width) * 100, 0, 100);
      const py = clamp(((clientY - rect.top) / rect.height) * 100, 0, 100);
      return { px, py };
    },
    [],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return; // left click only
      const { px, py } = toPercentCoords(e.clientX, e.clientY);
      setDrawing({ startX: px, startY: py, currentX: px, currentY: py });
    },
    [toPercentCoords],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!drawing) return;
      const { px, py } = toPercentCoords(e.clientX, e.clientY);
      setDrawing((prev) => (prev ? { ...prev, currentX: px, currentY: py } : null));
    },
    [drawing, toPercentCoords],
  );

  const handleMouseUp = useCallback(() => {
    if (!drawing) return;
    const x = Math.min(drawing.startX, drawing.currentX);
    const y = Math.min(drawing.startY, drawing.currentY);
    const w = Math.abs(drawing.currentX - drawing.startX);
    const h = Math.abs(drawing.currentY - drawing.startY);
    setDrawing(null);

    // Ignore tiny rects (accidental clicks)
    if (w < 1 || h < 1) return;

    onAddRedaction({ pageIndex: 0, x, y, width: w, height: h });
  }, [drawing, onAddRedaction]);

  // Convert percentage rect to SVG pixel coords
  const toSvg = (pct: number, total: number) => (pct / 100) * total;

  return (
    <svg
      ref={svgRef}
      width={width}
      height={height}
      className="absolute inset-0 cursor-crosshair"
      style={{ touchAction: 'none' }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={() => {
        if (drawing) handleMouseUp();
      }}
    >
      {/* Existing redaction rectangles */}
      {redactions.map((r) => (
        <g
          key={r.id}
          onMouseEnter={() => setHoveredId(r.id)}
          onMouseLeave={() => setHoveredId(null)}
        >
          <rect
            x={toSvg(r.x, width)}
            y={toSvg(r.y, height)}
            width={toSvg(r.width, width)}
            height={toSvg(r.height, height)}
            fill="rgba(255, 0, 0, 0.3)"
            stroke="rgba(200, 0, 0, 0.6)"
            strokeWidth={1}
          />
          {/* Remove button on hover */}
          {hoveredId === r.id && (
            <foreignObject
              x={toSvg(r.x + r.width, width) - 18}
              y={toSvg(r.y, height) - 2}
              width={20}
              height={20}
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveRedaction(r.id);
                }}
                className="flex items-center justify-center w-5 h-5 rounded-full bg-destructive text-white hover:bg-destructive/80 transition-colors"
                title="Remove redaction"
              >
                <X className="w-3 h-3" />
              </button>
            </foreignObject>
          )}
        </g>
      ))}

      {/* Currently drawing rectangle */}
      {drawing && (
        <rect
          x={toSvg(Math.min(drawing.startX, drawing.currentX), width)}
          y={toSvg(Math.min(drawing.startY, drawing.currentY), height)}
          width={toSvg(Math.abs(drawing.currentX - drawing.startX), width)}
          height={toSvg(Math.abs(drawing.currentY - drawing.startY), height)}
          fill="rgba(255, 0, 0, 0.15)"
          stroke="rgba(200, 0, 0, 0.8)"
          strokeWidth={1.5}
          strokeDasharray="6 3"
        />
      )}
    </svg>
  );
}
