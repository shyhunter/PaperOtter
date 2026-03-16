// ZoomToolbar: floating zoom controls at the bottom-center of the editor canvas.
// Shows current zoom %, +/- buttons, and a preset dropdown.
import { useState, useRef, useEffect } from 'react';
import { Minus, Plus, ChevronUp } from 'lucide-react';
import { useEditorContext } from '@/context/EditorContext';
import type { ZoomPreset } from '@/types/editor';

const PRESETS: { label: string; value: ZoomPreset }[] = [
  { label: '50%', value: 0.5 },
  { label: '75%', value: 0.75 },
  { label: '100%', value: 1.0 },
  { label: '150%', value: 1.5 },
  { label: 'Fit Width', value: 'fit-width' },
];

export function ZoomToolbar() {
  const { state, zoomIn, zoomOut, setZoomPreset } = useEditorContext();
  const [showPresets, setShowPresets] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const zoomPercent = Math.round(state.zoom * 100);

  // Close preset menu on outside click
  useEffect(() => {
    if (!showPresets) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowPresets(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showPresets]);

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10" ref={menuRef}>
      <div className="flex items-center gap-1 rounded-lg border border-border bg-background/95 backdrop-blur px-2 py-1.5 shadow-lg">
        <button
          type="button"
          onClick={zoomOut}
          className="p-1 rounded hover:bg-muted transition-colors"
          title="Zoom out (Cmd+-)"
        >
          <Minus className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={() => setShowPresets(!showPresets)}
          className="min-w-[4rem] px-2 py-0.5 text-xs font-medium text-center rounded hover:bg-muted transition-colors flex items-center justify-center gap-1"
          title="Zoom presets"
        >
          {zoomPercent}%
          <ChevronUp className={`w-3 h-3 transition-transform ${showPresets ? '' : 'rotate-180'}`} />
        </button>

        <button
          type="button"
          onClick={zoomIn}
          className="p-1 rounded hover:bg-muted transition-colors"
          title="Zoom in (Cmd+=)"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Preset dropdown — opens upward */}
      {showPresets && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 rounded-lg border border-border bg-background shadow-lg py-1 min-w-[120px]">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => {
                setZoomPreset(p.value);
                setShowPresets(false);
              }}
              className={[
                'w-full text-left px-3 py-1.5 text-xs hover:bg-muted transition-colors',
                state.zoomPreset === p.value ? 'font-semibold text-primary' : '',
              ].join(' ')}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
