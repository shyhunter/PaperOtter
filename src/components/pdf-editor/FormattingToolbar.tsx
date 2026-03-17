// FormattingToolbar: horizontal formatting bar for text editing in the PDF editor.
// Shows font family, size, color, and bold/italic/underline toggles.
// Integrated into EditorTopToolbar, always visible (disabled when no block selected).

import { useCallback, useRef, useState } from 'react';
import { Bold, Italic, Underline, Plus, Minus, Type } from 'lucide-react';
import { useEditorContext } from '@/context/EditorContext';
import type { TextBlock } from '@/types/editor';

/** Standard PDF fonts available in pdf-lib */
const FONT_OPTIONS = [
  { value: 'Helvetica', label: 'Helvetica' },
  { value: 'TimesRoman', label: 'Times Roman' },
  { value: 'Courier', label: 'Courier' },
];

/** Common color presets */
const COLOR_PRESETS = [
  '#000000', '#DC2626', '#2563EB', '#16A34A', '#F59E0B',
  '#7C3AED', '#EC4899', '#FFFFFF',
];

export function FormattingToolbar() {
  const { state, updateTextBlock, setEditorMode } = useEditorContext();
  const { selectedBlockId, editorMode, pages, currentPage } = state;
  const colorInputRef = useRef<HTMLInputElement>(null);
  const [showColorPicker, setShowColorPicker] = useState(false);

  // Find the selected block across all pages
  const selectedBlock: TextBlock | null = (() => {
    if (!selectedBlockId) return null;
    for (const page of pages) {
      const block = page.textBlocks.find((b) => b.id === selectedBlockId);
      if (block) return block;
    }
    return null;
  })();

  const selectedPageIdx: number = (() => {
    if (!selectedBlockId) return currentPage;
    for (const page of pages) {
      const block = page.textBlocks.find((b) => b.id === selectedBlockId);
      if (block) return page.pageIndex;
    }
    return currentPage;
  })();

  const isDisabled = !selectedBlock;

  // Update a property on the selected block
  const updateProp = useCallback(
    (props: Partial<TextBlock>) => {
      if (!selectedBlock) return;
      updateTextBlock(selectedPageIdx, { ...selectedBlock, ...props, isModified: true });
    },
    [selectedBlock, selectedPageIdx, updateTextBlock],
  );

  const handleFontChange = useCallback(
    (fontName: string) => updateProp({ fontName }),
    [updateProp],
  );

  const handleFontSizeChange = useCallback(
    (delta: number) => {
      if (!selectedBlock) return;
      const newSize = Math.max(6, Math.min(72, Math.round(selectedBlock.fontSize + delta)));
      updateProp({ fontSize: newSize });
    },
    [selectedBlock, updateProp],
  );

  const handleFontSizeInput = useCallback(
    (value: string) => {
      const num = parseInt(value, 10);
      if (!isNaN(num) && num >= 6 && num <= 72) {
        updateProp({ fontSize: num });
      }
    },
    [updateProp],
  );

  const handleColorChange = useCallback(
    (color: string) => {
      updateProp({ color });
      setShowColorPicker(false);
    },
    [updateProp],
  );

  const handleAddText = useCallback(() => {
    if (editorMode === 'text') {
      setEditorMode('select');
    } else {
      setEditorMode('text');
    }
  }, [editorMode, setEditorMode]);

  // Button base styles
  const btnBase =
    'h-7 px-1.5 rounded text-xs transition-colors disabled:opacity-40 disabled:cursor-not-allowed';
  const btnToggle = (active: boolean) =>
    active
      ? `${btnBase} bg-primary text-primary-foreground`
      : `${btnBase} hover:bg-muted`;

  return (
    <div className="flex items-center h-9 px-4 border-b border-border bg-background/50 flex-none gap-2 overflow-x-auto">
      {/* Add Text button */}
      <button
        type="button"
        onClick={handleAddText}
        className={btnToggle(editorMode === 'text')}
        title="Add text mode (click on page to add)"
      >
        <span className="flex items-center gap-1">
          <Plus className="w-3 h-3" />
          <Type className="w-3 h-3" />
        </span>
      </button>

      <div className="w-px h-5 bg-border" />

      {/* Font family */}
      <select
        value={selectedBlock?.fontName ?? 'Helvetica'}
        onChange={(e) => handleFontChange(e.target.value)}
        disabled={isDisabled}
        className="h-7 rounded border border-input bg-background px-1.5 text-xs disabled:opacity-40 disabled:cursor-not-allowed min-w-[90px]"
      >
        {FONT_OPTIONS.map((f) => (
          <option key={f.value} value={f.value}>
            {f.label}
          </option>
        ))}
      </select>

      {/* Font size */}
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          onClick={() => handleFontSizeChange(-1)}
          disabled={isDisabled}
          className={btnBase + ' hover:bg-muted w-6'}
          title="Decrease font size"
        >
          <Minus className="w-3 h-3 mx-auto" />
        </button>
        <input
          type="number"
          min={6}
          max={72}
          value={selectedBlock ? Math.round(selectedBlock.fontSize) : 12}
          onChange={(e) => handleFontSizeInput(e.target.value)}
          disabled={isDisabled}
          className="w-10 h-7 text-center rounded border border-input bg-background text-xs disabled:opacity-40 disabled:cursor-not-allowed [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
        <button
          type="button"
          onClick={() => handleFontSizeChange(1)}
          disabled={isDisabled}
          className={btnBase + ' hover:bg-muted w-6'}
          title="Increase font size"
        >
          <Plus className="w-3 h-3 mx-auto" />
        </button>
      </div>

      {/* Text color */}
      <div className="relative">
        <button
          type="button"
          onClick={() => !isDisabled && setShowColorPicker(!showColorPicker)}
          disabled={isDisabled}
          className={`${btnBase} hover:bg-muted w-7 flex items-center justify-center`}
          title="Text color"
        >
          <div className="w-4 h-4 rounded-sm border border-border" style={{
            backgroundColor: selectedBlock?.color ?? '#000000',
          }} />
        </button>
        {showColorPicker && !isDisabled && (
          <div className="absolute top-full left-0 mt-1 z-50 rounded-lg border border-border bg-background shadow-lg p-2 min-w-[140px]">
            <div className="grid grid-cols-4 gap-1 mb-2">
              {COLOR_PRESETS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => handleColorChange(c)}
                  className={`w-6 h-6 rounded-sm border-2 transition-all ${
                    selectedBlock?.color === c
                      ? 'border-blue-500 ring-1 ring-blue-300'
                      : 'border-border hover:border-muted-foreground'
                  }`}
                  style={{ backgroundColor: c }}
                  title={c}
                />
              ))}
            </div>
            <div className="flex items-center gap-1">
              <input
                ref={colorInputRef}
                type="color"
                value={selectedBlock?.color ?? '#000000'}
                onChange={(e) => handleColorChange(e.target.value)}
                className="w-6 h-6 rounded cursor-pointer border border-input"
                title="Custom color"
              />
              <span className="text-xs text-muted-foreground font-mono">
                {selectedBlock?.color ?? '#000000'}
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="w-px h-5 bg-border" />

      {/* Bold / Italic / Underline */}
      <button
        type="button"
        onClick={() => updateProp({ bold: !selectedBlock?.bold })}
        disabled={isDisabled}
        className={btnToggle(selectedBlock?.bold ?? false) + ' w-7 font-bold'}
        title="Bold"
      >
        <Bold className="w-3.5 h-3.5 mx-auto" />
      </button>
      <button
        type="button"
        onClick={() => updateProp({ italic: !selectedBlock?.italic })}
        disabled={isDisabled}
        className={btnToggle(selectedBlock?.italic ?? false) + ' w-7'}
        title="Italic"
      >
        <Italic className="w-3.5 h-3.5 mx-auto" />
      </button>
      <button
        type="button"
        onClick={() => updateProp({ underline: !selectedBlock?.underline })}
        disabled={isDisabled}
        className={btnToggle(selectedBlock?.underline ?? false) + ' w-7'}
        title="Underline"
      >
        <Underline className="w-3.5 h-3.5 mx-auto" />
      </button>
    </div>
  );
}
