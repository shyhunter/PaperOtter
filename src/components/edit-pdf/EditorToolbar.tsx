// EditorToolbar: Text formatting controls for the PDF editor right panel.
// Shows font size, color, alignment, font family, delete, and add-text toggle.
// Only active when a text block is selected or editor is in 'text' mode.

import { useCallback } from 'react';
import {
  AlignLeft,
  AlignCenter,
  AlignRight,
  Plus,
  Trash2,
  Type,
  MousePointer,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { TextBlock, EditorMode } from '@/types/editor';

/** Standard PDF fonts available in pdf-lib */
const FONT_OPTIONS = [
  { value: 'Helvetica', label: 'Helvetica' },
  { value: 'TimesRoman', label: 'Times Roman' },
  { value: 'Courier', label: 'Courier' },
];

/** Preset colors for text */
const COLOR_PRESETS = [
  { value: '#000000', label: 'Black' },
  { value: '#DC2626', label: 'Red' },
  { value: '#2563EB', label: 'Blue' },
  { value: '#16A34A', label: 'Green' },
  { value: '#FFFFFF', label: 'White' },
];

interface EditorToolbarProps {
  /** Currently selected text block (null if none) */
  selectedBlock: TextBlock | null;
  /** Current editor mode */
  editorMode: EditorMode;
  /** Called to update the selected block's properties */
  onBlockUpdate: (id: string, props: Partial<TextBlock>) => void;
  /** Called to delete the selected block */
  onBlockDelete: (id: string) => void;
  /** Called to change editor mode */
  onModeChange: (mode: EditorMode) => void;
}

export function EditorToolbar({
  selectedBlock,
  editorMode,
  onBlockUpdate,
  onBlockDelete,
  onModeChange,
}: EditorToolbarProps) {
  const handleFontSizeChange = useCallback(
    (newSize: number) => {
      if (!selectedBlock) return;
      const clamped = Math.max(6, Math.min(144, newSize));
      onBlockUpdate(selectedBlock.id, { fontSize: clamped });
    },
    [selectedBlock, onBlockUpdate],
  );

  const handleColorChange = useCallback(
    (color: string) => {
      if (!selectedBlock) return;
      onBlockUpdate(selectedBlock.id, { color });
    },
    [selectedBlock, onBlockUpdate],
  );

  const handleAlignmentChange = useCallback(
    (alignment: 'left' | 'center' | 'right') => {
      if (!selectedBlock) return;
      onBlockUpdate(selectedBlock.id, { alignment });
    },
    [selectedBlock, onBlockUpdate],
  );

  const handleFontChange = useCallback(
    (fontName: string) => {
      if (!selectedBlock) return;
      onBlockUpdate(selectedBlock.id, { fontName });
    },
    [selectedBlock, onBlockUpdate],
  );

  const handleDelete = useCallback(() => {
    if (!selectedBlock) return;
    onBlockDelete(selectedBlock.id);
  }, [selectedBlock, onBlockDelete]);

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Mode toggle */}
      <div>
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 block">
          Mode
        </label>
        <div className="flex gap-1">
          <Button
            variant={editorMode === 'select' ? 'default' : 'outline'}
            size="sm"
            onClick={() => onModeChange('select')}
            title="Select mode"
          >
            <MousePointer className="w-3.5 h-3.5 mr-1" />
            Select
          </Button>
          <Button
            variant={editorMode === 'text' ? 'default' : 'outline'}
            size="sm"
            onClick={() => onModeChange('text')}
            title="Add text mode"
          >
            <Plus className="w-3.5 h-3.5 mr-1" />
            <Type className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Text formatting — only when a block is selected */}
      {selectedBlock && (
        <>
          {/* Font family */}
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1 block">
              Font
            </label>
            <select
              value={selectedBlock.fontName}
              onChange={(e) => handleFontChange(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
            >
              {FONT_OPTIONS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>

          {/* Font size */}
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1 block">
              Size
            </label>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => handleFontSizeChange(selectedBlock.fontSize - 1)}
              >
                -
              </Button>
              <input
                type="number"
                min={6}
                max={144}
                value={Math.round(selectedBlock.fontSize)}
                onChange={(e) => handleFontSizeChange(Number(e.target.value))}
                className="w-16 text-center rounded-md border border-input bg-background px-2 py-1 text-sm"
              />
              <Button
                variant="outline"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => handleFontSizeChange(selectedBlock.fontSize + 1)}
              >
                +
              </Button>
              <span className="text-xs text-muted-foreground ml-1">pt</span>
            </div>
          </div>

          {/* Color */}
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1 block">
              Color
            </label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {COLOR_PRESETS.map((c) => (
                <button
                  key={c.value}
                  onClick={() => handleColorChange(c.value)}
                  title={c.label}
                  className={[
                    'w-7 h-7 rounded-md border-2 transition-all',
                    selectedBlock.color === c.value
                      ? 'border-blue-500 ring-1 ring-blue-300'
                      : 'border-border hover:border-muted-foreground',
                  ].join(' ')}
                  style={{ backgroundColor: c.value }}
                />
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={selectedBlock.color}
                onChange={(e) => handleColorChange(e.target.value)}
                className="w-8 h-8 rounded cursor-pointer border border-input"
              />
              <input
                type="text"
                value={selectedBlock.color}
                onChange={(e) => {
                  const v = e.target.value;
                  if (/^#[0-9a-fA-F]{6}$/.test(v)) handleColorChange(v);
                }}
                placeholder="#000000"
                className="flex-1 rounded-md border border-input bg-background px-2 py-1 text-sm font-mono"
              />
            </div>
          </div>

          {/* Alignment */}
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1 block">
              Alignment
            </label>
            <div className="flex gap-1">
              {([
                { value: 'left' as const, icon: AlignLeft },
                { value: 'center' as const, icon: AlignCenter },
                { value: 'right' as const, icon: AlignRight },
              ]).map(({ value, icon: Icon }) => (
                <Button
                  key={value}
                  variant={selectedBlock.alignment === value ? 'default' : 'outline'}
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => handleAlignmentChange(value)}
                  title={`Align ${value}`}
                >
                  <Icon className="w-4 h-4" />
                </Button>
              ))}
            </div>
          </div>

          {/* Delete */}
          <div className="pt-2 border-t border-border">
            <Button
              variant="destructive"
              size="sm"
              className="w-full"
              onClick={handleDelete}
            >
              <Trash2 className="w-3.5 h-3.5 mr-2" />
              Delete Text
            </Button>
          </div>
        </>
      )}

      {/* Hint when nothing is selected */}
      {!selectedBlock && editorMode === 'select' && (
        <p className="text-xs text-muted-foreground text-center mt-4">
          Click a text block on the page to select and edit it.
        </p>
      )}
      {!selectedBlock && editorMode === 'text' && (
        <p className="text-xs text-muted-foreground text-center mt-4">
          Click anywhere on the page to add a new text block.
        </p>
      )}
    </div>
  );
}
