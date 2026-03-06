import { useRef, useState, useCallback, useEffect } from 'react';

interface Point {
  x: number;
  y: number;
}

interface SignatureCanvasProps {
  onComplete: (dataUrl: string) => void;
  onClear: () => void;
}

const CANVAS_WIDTH = 600;
const CANVAS_HEIGHT = 200;
const MAX_DPR = 2;
const PEN_WIDTH = 2;
const PEN_COLOR = '#000000';

/**
 * Crop canvas content to the bounding box of drawn pixels,
 * then export as PNG data URL.
 */
function exportCroppedPng(canvas: HTMLCanvasElement): string | null {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const { width, height } = canvas;
  const imageData = ctx.getImageData(0, 0, width, height);
  const { data } = imageData;

  let minX = width, minY = height, maxX = 0, maxY = 0;
  let hasContent = false;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = data[(y * width + x) * 4 + 3];
      if (alpha > 0) {
        hasContent = true;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (!hasContent) return null;

  // Add small padding
  const pad = 4;
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(width - 1, maxX + pad);
  maxY = Math.min(height - 1, maxY + pad);

  const cropW = maxX - minX + 1;
  const cropH = maxY - minY + 1;

  const cropCanvas = document.createElement('canvas');
  cropCanvas.width = cropW;
  cropCanvas.height = cropH;
  const cropCtx = cropCanvas.getContext('2d');
  if (!cropCtx) return null;

  cropCtx.drawImage(canvas, minX, minY, cropW, cropH, 0, 0, cropW, cropH);
  return cropCanvas.toDataURL('image/png');
}

export function SignatureCanvas({ onComplete, onClear }: SignatureCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [paths, setPaths] = useState<Point[][]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const currentPathRef = useRef<Point[]>([]);
  const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);

  // Redraw all paths from state (handles StrictMode remount)
  const redraw = useCallback((allPaths: Point[][]) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw guideline at ~70% height
    ctx.save();
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = '#d1d5db';
    ctx.lineWidth = 1;
    ctx.beginPath();
    const guideY = CANVAS_HEIGHT * 0.7 * dpr;
    ctx.moveTo(0, guideY);
    ctx.lineTo(canvas.width, guideY);
    ctx.stroke();
    ctx.restore();

    // Draw all paths
    ctx.strokeStyle = PEN_COLOR;
    ctx.lineWidth = PEN_WIDTH * dpr;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (const path of allPaths) {
      if (path.length < 2) continue;
      ctx.beginPath();
      ctx.moveTo(path[0].x * dpr, path[0].y * dpr);
      for (let i = 1; i < path.length - 1; i++) {
        const midX = (path[i].x + path[i + 1].x) / 2;
        const midY = (path[i].y + path[i + 1].y) / 2;
        ctx.quadraticCurveTo(path[i].x * dpr, path[i].y * dpr, midX * dpr, midY * dpr);
      }
      // Draw to the last point
      const last = path[path.length - 1];
      ctx.lineTo(last.x * dpr, last.y * dpr);
      ctx.stroke();
    }
  }, [dpr]);

  // Initialize canvas dimensions and draw guideline
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = CANVAS_WIDTH * dpr;
    canvas.height = CANVAS_HEIGHT * dpr;
    redraw(paths);
  }, [dpr, paths, redraw]);

  const getPos = useCallback((e: React.MouseEvent | React.TouchEvent): Point => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    let clientX: number, clientY: number;
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    return {
      x: (clientX - rect.left) * (CANVAS_WIDTH / rect.width),
      y: (clientY - rect.top) * (CANVAS_HEIGHT / rect.height),
    };
  }, []);

  const startDrawing = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const pos = getPos(e);
    currentPathRef.current = [pos];
    setIsDrawing(true);
  }, [getPos]);

  const draw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    e.preventDefault();
    const pos = getPos(e);
    currentPathRef.current.push(pos);

    // Draw in real-time on canvas
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const path = currentPathRef.current;
    if (path.length < 2) return;

    ctx.strokeStyle = PEN_COLOR;
    ctx.lineWidth = PEN_WIDTH * dpr;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const i = path.length - 1;
    if (i >= 2) {
      const prev = path[i - 1];
      const curr = path[i];
      const midX = (prev.x + curr.x) / 2;
      const midY = (prev.y + curr.y) / 2;
      ctx.beginPath();
      const prevMidX = (path[i - 2].x + prev.x) / 2;
      const prevMidY = (path[i - 2].y + prev.y) / 2;
      ctx.moveTo(prevMidX * dpr, prevMidY * dpr);
      ctx.quadraticCurveTo(prev.x * dpr, prev.y * dpr, midX * dpr, midY * dpr);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(path[0].x * dpr, path[0].y * dpr);
      ctx.lineTo(path[1].x * dpr, path[1].y * dpr);
      ctx.stroke();
    }
  }, [isDrawing, getPos, dpr]);

  const stopDrawing = useCallback(() => {
    if (!isDrawing) return;
    setIsDrawing(false);
    const completedPath = [...currentPathRef.current];
    if (completedPath.length > 1) {
      setPaths(prev => [...prev, completedPath]);
    }
    currentPathRef.current = [];
  }, [isDrawing]);

  const handleClear = useCallback(() => {
    setPaths([]);
    currentPathRef.current = [];
    onClear();
  }, [onClear]);

  const handleUse = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = exportCroppedPng(canvas);
    if (dataUrl) {
      onComplete(dataUrl);
    }
  }, [onComplete]);

  const hasDrawn = paths.length > 0;

  return (
    <div className="flex flex-col gap-3">
      <div
        className="relative rounded-lg border-2 border-dashed border-border bg-white"
        style={{ width: '100%', maxWidth: CANVAS_WIDTH, aspectRatio: `${CANVAS_WIDTH}/${CANVAS_HEIGHT}` }}
      >
        <canvas
          ref={canvasRef}
          className="w-full h-full cursor-crosshair rounded-lg touch-none"
          style={{ display: 'block' }}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
        />
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleClear}
          disabled={!hasDrawn}
          className="rounded-md border border-border px-4 py-2 text-sm text-foreground hover:bg-muted disabled:opacity-40"
        >
          Clear
        </button>
        <button
          type="button"
          onClick={handleUse}
          disabled={!hasDrawn}
          className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
        >
          Use This Signature
        </button>
      </div>
    </div>
  );
}
