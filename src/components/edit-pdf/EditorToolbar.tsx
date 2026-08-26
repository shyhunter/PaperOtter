// EditorToolbar: Text and image formatting controls for the PDF editor right panel.
// Shows mode toggle (Select / Text / Image), context-sensitive controls for the
// selected text or image block, and always-visible Insert Image button.

import { useCallback, useRef, useState } from 'react';
import {
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Bold,
  Italic,
  Underline,
  Plus,
  Trash2,
  Type,
  MousePointer,
  Image as ImageIcon,
  RotateCw,
  RotateCcw,
  FlipHorizontal,
  FlipVertical,
  Replace,
  Undo2,
  Redo2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { TextBlock, ImageBlock, EditorMode } from '@/types/editor';
import { colorPresets } from '@/lib/colorPresets';
import { t } from '@/i18n';

/** Standard PDF fonts available in pdf-lib.
 *  pdf-lib only supports the 14 standard fonts grouped into 3 families.
 *  We show familiar aliases so users pick recognizable names. */
/**
 * A function, not a constant: these labels are translated, and a module-level
 * constant resolves them once at import -- before the locale is known.
 */
function fontOptions() {
  return [
    { value: 'Helvetica', label: t('editorToolbar.helveticaArialSansSerif') },
    { value: 'TimesRoman', label: t('editorToolbar.timesNewRomanSerif') },
    { value: 'Courier', label: t('editorToolbar.courierNewMonospace') },
  ];
}

/** Preset colors for text */
/** Local-storage key for custom colors */
const CUSTOM_COLORS_KEY = 'papercut-custom-colors';

interface EditorToolbarProps {
  /** Currently selected text block (null if none) */
  selectedBlock: TextBlock | null;
  /** Currently selected image block (null if none) */
  selectedImageBlock: ImageBlock | null;
  /** Current editor mode */
  editorMode: EditorMode;
  /** Called to update the selected block's properties */
  onBlockUpdate: (id: string, props: Partial<TextBlock>) => void;
  /** Called to delete the selected block */
  onBlockDelete: (id: string) => void;
  /** Called to update an image block */
  onImageUpdate: (id: string, props: Partial<ImageBlock>) => void;
  /** Called to delete an image block */
  onImageDelete: (id: string) => void;
  /** Called to insert a new image */
  onImageInsert: (block: ImageBlock) => void;
  /** Called to change editor mode */
  onModeChange: (mode: EditorMode) => void;
  /** Page dimensions in PDF points for sizing new images */
  pageWidth: number;
  pageHeight: number;
  /** Undo/redo */
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
}

export function EditorToolbar({
  selectedBlock,
  selectedImageBlock,
  editorMode,
  onBlockUpdate,
  onBlockDelete,
  onImageUpdate,
  onImageDelete,
  onImageInsert,
  onModeChange,
  pageWidth,
  pageHeight,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
}: EditorToolbarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);

  // Custom colors persisted in localStorage
  const [customColors, setCustomColors] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem(CUSTOM_COLORS_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  });

  const addCustomColor = useCallback((color: string) => {
    setCustomColors((prev) => {
      if (prev.includes(color)) return prev;
      const next = [...prev, color].slice(-12); // max 12 custom colors
      localStorage.setItem(CUSTOM_COLORS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const removeCustomColor = useCallback((color: string) => {
    setCustomColors((prev) => {
      const next = prev.filter((c) => c !== color);
      localStorage.setItem(CUSTOM_COLORS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);
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
    (alignment: 'left' | 'center' | 'right' | 'justify') => {
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

  // ── Image handlers ──────────────────────────────────────────────────

  const handleRotate = useCallback(
    (degrees: 0 | 90 | 180 | 270) => {
      if (!selectedImageBlock) return;
      const current = selectedImageBlock.rotation;
      const next = ((current + degrees) % 360) as 0 | 90 | 180 | 270;
      onImageUpdate(selectedImageBlock.id, { rotation: next });
    },
    [selectedImageBlock, onImageUpdate],
  );

  const handleFlipH = useCallback(() => {
    if (!selectedImageBlock) return;
    onImageUpdate(selectedImageBlock.id, { flipH: !selectedImageBlock.flipH });
  }, [selectedImageBlock, onImageUpdate]);

  const handleFlipV = useCallback(() => {
    if (!selectedImageBlock) return;
    onImageUpdate(selectedImageBlock.id, { flipV: !selectedImageBlock.flipV });
  }, [selectedImageBlock, onImageUpdate]);

  const handleImageDelete = useCallback(() => {
    if (!selectedImageBlock) return;
    onImageDelete(selectedImageBlock.id);
  }, [selectedImageBlock, onImageDelete]);

  /** Read an image file and create an ImageBlock at center of page */
  const handleImageFile = useCallback(
    async (file: File, replaceId?: string) => {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);

      // Get natural dimensions via createImageBitmap
      const blob = new Blob([bytes], { type: file.type });
      const bitmap = await createImageBitmap(blob);
      let w = bitmap.width;
      let h = bitmap.height;
      bitmap.close();

      // Scale to fit within 80% of page if larger
      const maxW = pageWidth * 0.8;
      const maxH = pageHeight * 0.8;
      if (w > maxW) {
        const s = maxW / w;
        w *= s;
        h *= s;
      }
      if (h > maxH) {
        const s = maxH / h;
        w *= s;
        h *= s;
      }

      if (replaceId && selectedImageBlock) {
        // Replace: keep position/size, swap bytes
        onImageUpdate(replaceId, { imageBytes: bytes });
      } else {
        // Insert: center on page
        const newBlock: ImageBlock = {
          id: crypto.randomUUID(),
          pageIndex: 0, // will be set by parent
          x: (pageWidth - w) / 2,
          y: (pageHeight - h) / 2,
          width: w,
          height: h,
          imageBytes: bytes,
          rotation: 0,
          flipH: false,
          flipV: false,
          isNew: true,
        };
        onImageInsert(newBlock);
      }
    },
    [pageWidth, pageHeight, selectedImageBlock, onImageUpdate, onImageInsert],
  );

  const handleInsertImage = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleReplaceImage = useCallback(() => {
    replaceInputRef.current?.click();
  }, []);

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Mode toggle */}
      <div>
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 block">
          {t('editPdf.mode')}
        </label>
        <div className="flex gap-1">
          <Button
            variant={editorMode === 'select' ? 'default' : 'outline'}
            size="sm"
            onClick={() => onModeChange('select')}
            title={t('editPdf.selectMode')}
          >
            <MousePointer className="w-3.5 h-3.5 me-1" />
            {t('editPdf.select')}
          </Button>
          <Button
            variant={editorMode === 'text' ? 'default' : 'outline'}
            size="sm"
            onClick={() => onModeChange('text')}
            title={t('editPdf.addTextMode')}
          >
            <Plus className="w-3.5 h-3.5 me-1" />
            <Type className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant={editorMode === 'image' ? 'default' : 'outline'}
            size="sm"
            onClick={() => onModeChange('image')}
            title={t('editPdf.imageMode')}
          >
            <ImageIcon className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Insert Image button (always visible) */}
      <div>
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={handleInsertImage}
        >
          <Plus className="w-3.5 h-3.5 me-1" />
          <ImageIcon className="w-3.5 h-3.5 me-1" />
          {t('editPdf.insertImage')}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          title={t('editPdf.selectImageFileToInsert')}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleImageFile(file);
            e.target.value = '';
          }}
        />
      </div>

      {/* Text formatting — only when a block is selected */}
      {selectedBlock && (
        <>
          {/* Font family */}
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1 block">
              {t('convertDoc.font')}
            </label>
            <select
              value={selectedBlock.fontName}
              onChange={(e) => handleFontChange(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
            >
              {fontOptions().map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>

          {/* Font size */}
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1 block">
              {t('common.size')}
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
              <span className="text-xs text-muted-foreground ms-1">pt</span>
            </div>
          </div>

          {/* Color */}
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1 block">
              {t('editPdf.currentColor')}
            </label>
            <div className="flex items-center gap-2 mb-2">
              <div
                className="w-8 h-8 rounded-md border-2 border-border"
                style={{ backgroundColor: selectedBlock.color }}
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
              <input
                type="color"
                value={selectedBlock.color}
                onChange={(e) => handleColorChange(e.target.value)}
                className="w-8 h-8 rounded cursor-pointer border border-input"
                title={t('editPdf.pickColor')}
              />
            </div>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {colorPresets().map((c) => (
                <button
                  key={c.hex}
                  onClick={() => handleColorChange(c.hex)}
                  title={c.label}
                  aria-label={c.label}
                  className={cn(
                    'w-7 h-7 rounded-md border-2 transition-all',
                    selectedBlock.color.toLowerCase() === c.hex.toLowerCase()
                      ? 'border-blue-500 ring-1 ring-blue-300'
                      : 'border-border hover:border-muted-foreground',
                  )}
                  style={{ backgroundColor: c.hex }}
                />
              ))}
            </div>

            {/* Custom Colors */}
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1 block">
              {t('editPdf.customColors')}
            </label>
            <div className="flex flex-wrap gap-1.5 items-center">
              {customColors.map((c) => (
                <button
                  key={c}
                  onClick={() => handleColorChange(c)}
                  onContextMenu={(e) => { e.preventDefault(); removeCustomColor(c); }}
                  title={`${c} — right-click to remove`}
                  className={cn(
                    'w-7 h-7 rounded-md border-2 transition-all',
                    selectedBlock.color === c
                      ? 'border-blue-500 ring-1 ring-blue-300'
                      : 'border-border hover:border-muted-foreground',
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
              <button
                onClick={() => addCustomColor(selectedBlock.color)}
                title={t('editPdf.saveCurrentColor')}
                className="w-7 h-7 rounded-md border-2 border-dashed border-border hover:border-muted-foreground flex items-center justify-center text-muted-foreground"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Style toggles: Bold / Italic / Underline */}
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1 block">
              {t('common.style')}
            </label>
            <div className="flex gap-1">
              <Button
                variant={selectedBlock.bold ? 'default' : 'outline'}
                size="sm"
                className={cn('h-8 w-8 p-0', selectedBlock.bold && 'font-bold')}
                onClick={() => onBlockUpdate(selectedBlock.id, { bold: !selectedBlock.bold })}
                title={t('common.bold')}
              >
                <Bold className="w-4 h-4" />
              </Button>
              <Button
                variant={selectedBlock.italic ? 'default' : 'outline'}
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => onBlockUpdate(selectedBlock.id, { italic: !selectedBlock.italic })}
                title={t('common.italic')}
              >
                <Italic className="w-4 h-4" />
              </Button>
              <Button
                variant={selectedBlock.underline ? 'default' : 'outline'}
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => onBlockUpdate(selectedBlock.id, { underline: !selectedBlock.underline })}
                title={t('common.underline')}
              >
                <Underline className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Alignment */}
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1 block">
              {t('editPdf.alignment')}
            </label>
            <div className="flex gap-1">
              {([
                { value: 'left' as const, icon: AlignLeft },
                { value: 'center' as const, icon: AlignCenter },
                { value: 'right' as const, icon: AlignRight },
                { value: 'justify' as const, icon: AlignJustify },
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
              <Trash2 className="w-3.5 h-3.5 me-2" />
              {t('editPdf.deleteText')}
            </Button>
          </div>
        </>
      )}

      {/* Image controls — shown when an image block is selected */}
      {selectedImageBlock && (
        <>
          {/* Rotate */}
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1 block">
              {t('editPdf.rotate')}
            </label>
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => handleRotate(270)}
                title={t('editPdf.rotate90CounterClockwise')}
              >
                <RotateCcw className="w-4 h-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => handleRotate(90)}
                title={t('editPdf.rotate90Clockwise')}
              >
                <RotateCw className="w-4 h-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-2"
                onClick={() => handleRotate(180)}
                title={t('editPdf.rotate180')}
              >
                180
              </Button>
            </div>
          </div>

          {/* Flip */}
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1 block">
              {t('editPdf.flip')}
            </label>
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={handleFlipH}
                title={t('editPdf.flipHorizontal')}
              >
                <FlipHorizontal className="w-4 h-4 me-1" />
                H
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleFlipV}
                title={t('editPdf.flipVertical')}
              >
                <FlipVertical className="w-4 h-4 me-1" />
                V
              </Button>
            </div>
          </div>

          {/* Replace */}
          <div>
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={handleReplaceImage}
            >
              <Replace className="w-3.5 h-3.5 me-2" />
              {t('editPdf.replaceImage')}
            </Button>
            <input
              ref={replaceInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              title={t('editPdf.selectReplacementImage')}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file && selectedImageBlock) handleImageFile(file, selectedImageBlock.id);
                e.target.value = '';
              }}
            />
          </div>

          {/* Delete image */}
          <div className="pt-2 border-t border-border">
            <Button
              variant="destructive"
              size="sm"
              className="w-full"
              onClick={handleImageDelete}
            >
              <Trash2 className="w-3.5 h-3.5 me-2" />
              {t('editPdf.deleteImage')}
            </Button>
          </div>
        </>
      )}

      {/* Hint when nothing is selected */}
      {!selectedBlock && !selectedImageBlock && editorMode === 'select' && (
        <p className="text-xs text-muted-foreground text-center mt-4">
          {t('editPdf.clickATextBlockOr')}
        </p>
      )}
      {!selectedBlock && !selectedImageBlock && editorMode === 'text' && (
        <p className="text-xs text-muted-foreground text-center mt-4">
          {t('editPdf.clickAnywhereOnThePage')}
        </p>
      )}
      {!selectedBlock && !selectedImageBlock && editorMode === 'image' && (
        <p className="text-xs text-muted-foreground text-center mt-4">
          {t('editPdf.clickInsertImageToAdd')}
        </p>
      )}

      {/* Undo / Redo */}
      <div className="mt-auto pt-3 border-t border-border flex gap-1">
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          disabled={!canUndo}
          onClick={onUndo}
          title={t('common.undo')}
        >
          <Undo2 className="w-4 h-4 me-1" />
          {t('editPdf.undo')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          disabled={!canRedo}
          onClick={onRedo}
          title={t('common.redo')}
        >
          <Redo2 className="w-4 h-4 me-1" />
          {t('editPdf.redo')}
        </Button>
      </div>
    </div>
  );
}
