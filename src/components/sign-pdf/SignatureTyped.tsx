import { useState, useCallback, useRef, useEffect } from 'react';

interface SignatureTypedProps {
  onComplete: (dataUrl: string) => void;
}

const FONTS: { label: string; family: string }[] = [
  { label: 'Flowing', family: 'Dancing Script' },
  { label: 'Casual', family: 'Caveat' },
  { label: 'Formal', family: 'Great Vibes' },
  { label: 'Mono', family: 'monospace' },
];

const CANVAS_WIDTH = 600;
const CANVAS_HEIGHT = 200;

/**
 * Auto-calculate font size so text fits within canvas width (with padding).
 */
function calcFontSize(text: string, fontFamily: string, maxWidth: number): number {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return 48;

  let size = 72;
  const minSize = 20;
  const padding = 40; // horizontal padding

  while (size > minSize) {
    ctx.font = `${size}px "${fontFamily}"`;
    const measured = ctx.measureText(text);
    if (measured.width <= maxWidth - padding) break;
    size -= 2;
  }
  return size;
}

export function SignatureTyped({ onComplete }: SignatureTypedProps) {
  const [text, setText] = useState('');
  const [selectedFont, setSelectedFont] = useState(FONTS[0].family);
  const previewRef = useRef<HTMLDivElement>(null);

  // Compute preview font size
  const fontSize = text ? calcFontSize(text, selectedFont, CANVAS_WIDTH) : 48;

  // Ensure selected font is loaded for canvas rendering
  useEffect(() => {
    if (selectedFont === 'monospace') return;
    // Trigger font load if not yet loaded
    document.fonts.load(`48px "${selectedFont}"`).catch(() => {
      // Font load failed silently -- will fall back to system font
    });
  }, [selectedFont]);

  const handleUse = useCallback(() => {
    if (!text.trim()) return;

    const canvas = document.createElement('canvas');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = CANVAS_WIDTH * dpr;
    canvas.height = CANVAS_HEIGHT * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.scale(dpr, dpr);

    const renderSize = calcFontSize(text, selectedFont, CANVAS_WIDTH);
    ctx.font = `${renderSize}px "${selectedFont}"`;
    ctx.fillStyle = '#000000';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillText(text, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);

    // Crop to content
    const fullData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const { data } = fullData;
    let minX = canvas.width, minY = canvas.height, maxX = 0, maxY = 0;
    let hasContent = false;

    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        if (data[(y * canvas.width + x) * 4 + 3] > 0) {
          hasContent = true;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    if (!hasContent) return;

    const pad = 8;
    minX = Math.max(0, minX - pad);
    minY = Math.max(0, minY - pad);
    maxX = Math.min(canvas.width - 1, maxX + pad);
    maxY = Math.min(canvas.height - 1, maxY + pad);

    const cropW = maxX - minX + 1;
    const cropH = maxY - minY + 1;
    const cropCanvas = document.createElement('canvas');
    cropCanvas.width = cropW;
    cropCanvas.height = cropH;
    const cropCtx = cropCanvas.getContext('2d');
    if (!cropCtx) return;
    cropCtx.drawImage(canvas, minX, minY, cropW, cropH, 0, 0, cropW, cropH);

    onComplete(cropCanvas.toDataURL('image/png'));
  }, [text, selectedFont, onComplete]);

  return (
    <div className="flex flex-col gap-3">
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Type your name or signature..."
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        maxLength={60}
      />

      {/* Font selector */}
      <div className="flex gap-2 flex-wrap">
        {FONTS.map((f) => (
          <button
            key={f.family}
            type="button"
            onClick={() => setSelectedFont(f.family)}
            className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
              selectedFont === f.family
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border text-foreground hover:bg-muted'
            }`}
          >
            <span style={{ fontFamily: `"${f.family}"` }}>{f.label}</span>
          </button>
        ))}
      </div>

      {/* Preview */}
      <div
        ref={previewRef}
        className="flex items-center justify-center rounded-lg border-2 border-dashed border-border bg-white"
        style={{
          width: '100%',
          maxWidth: CANVAS_WIDTH,
          height: CANVAS_HEIGHT,
          overflow: 'hidden',
        }}
      >
        {text ? (
          <span
            className="select-none text-black"
            style={{
              fontFamily: `"${selectedFont}"`,
              fontSize: `${fontSize}px`,
              lineHeight: 1,
            }}
          >
            {text}
          </span>
        ) : (
          <span className="text-muted-foreground text-sm">Preview will appear here</span>
        )}
      </div>

      <button
        type="button"
        onClick={handleUse}
        disabled={!text.trim()}
        className="self-start rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
      >
        Use This Signature
      </button>
    </div>
  );
}
