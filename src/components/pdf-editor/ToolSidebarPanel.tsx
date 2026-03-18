// ToolSidebarPanel: renders inline tool settings for the selected tool.
// Each tool shows: title + description, settings form, before/after preview, Apply button.
// Preview pipeline: settings change (debounced 500ms) -> run tool -> update previewBytes.
import { useState, useEffect, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { ToolId } from '@/types/tools';
import { TOOL_REGISTRY } from '@/types/tools';
import { useEditorContext } from '@/context/EditorContext';
import { ToolSidebarPreview } from './ToolSidebarPreview';
import { rotatePdf, type RotationDegrees } from '@/lib/pdfRotate';
import { addWatermark, DEFAULT_WATERMARK_OPTIONS, type WatermarkOptions } from '@/lib/pdfWatermark';
import { addPageNumbers, type PageNumberOptions, type NumberPosition, type NumberFormat } from '@/lib/pdfPageNumbers';
import { cropPdf, type CropMargins, mmToPoints } from '@/lib/pdfCrop';
import { Loader2, Check, AlertCircle, Lock, Unlock } from 'lucide-react';

interface ToolSidebarPanelProps {
  toolId: ToolId;
}

// ── Shared hooks ─────────────────────────────────────────────────────

function useDebouncedPreview(
  pdfBytes: Uint8Array,
  runTool: (bytes: Uint8Array) => Promise<Uint8Array>,
  deps: unknown[],
  delay = 500,
) {
  const [previewBytes, setPreviewBytes] = useState<Uint8Array | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const runIdRef = useRef(0);

  useEffect(() => {
    if (pdfBytes.byteLength === 0) return;

    clearTimeout(timeoutRef.current);
    setIsProcessing(true);

    const runId = ++runIdRef.current;

    timeoutRef.current = setTimeout(async () => {
      try {
        const result = await runTool(pdfBytes);
        // Only update if this is still the latest run
        if (runIdRef.current === runId) {
          setPreviewBytes(result);
          setIsProcessing(false);
        }
      } catch {
        if (runIdRef.current === runId) {
          setPreviewBytes(null);
          setIsProcessing(false);
        }
      }
    }, delay);

    return () => {
      clearTimeout(timeoutRef.current);
      // If cleanup fires (unmount or re-run), ensure processing flag is cleared
      if (runIdRef.current === runId) {
        setIsProcessing(false);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfBytes, ...deps]);

  return { previewBytes, isProcessing };
}

// ── Apply button ─────────────────────────────────────────────────────

function ApplyButton({
  onClick,
  disabled,
  isApplying,
  success,
  error,
}: {
  onClick: () => void;
  disabled: boolean;
  isApplying: boolean;
  success: boolean;
  error: string | null;
}) {
  return (
    <div className="space-y-1.5">
      <button
        onClick={onClick}
        disabled={disabled || isApplying}
        className="w-full py-1.5 px-3 text-xs font-medium rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
      >
        {isApplying ? (
          <>
            <Loader2 className="h-3 w-3 animate-spin" />
            Applying...
          </>
        ) : success ? (
          <>
            <Check className="h-3 w-3" />
            Applied
          </>
        ) : (
          'Apply'
        )}
      </button>
      {error && (
        <div className="flex items-start gap-1 text-[10px] text-destructive">
          <AlertCircle className="h-3 w-3 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}

// ── Tool-specific apply hook ─────────────────────────────────────────

function useApply(
  previewBytes: Uint8Array | null,
  updatePdfBytes: (b: Uint8Array) => void,
  markDirty: () => void,
) {
  const [isApplying, setIsApplying] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apply = useCallback(async (runIfNoPreview?: () => Promise<Uint8Array>) => {
    setIsApplying(true);
    setError(null);
    setSuccess(false);
    try {
      const bytes = previewBytes ?? (runIfNoPreview ? await runIfNoPreview() : null);
      if (!bytes) throw new Error('No preview available');
      updatePdfBytes(bytes);
      markDirty();
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsApplying(false);
    }
  }, [previewBytes, updatePdfBytes, markDirty]);

  return { apply, isApplying, success, error };
}

// ── Tool result feedback ─────────────────────────────────────────────

function ToolResultFeedback({
  originalSize,
  resultSize,
  toolLabel,
}: {
  originalSize: number;
  resultSize: number;
  toolLabel: string;
}) {
  const sizeDiff = resultSize - originalSize;
  const pctChange = Math.round(((resultSize - originalSize) / originalSize) * 100);

  return (
    <div className="rounded border bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800 p-2 space-y-1">
      <div className="flex items-center gap-1.5 text-[10px] font-medium text-green-700 dark:text-green-400">
        <Check className="h-3 w-3" />
        {toolLabel} applied successfully
      </div>
      <div className="flex justify-between text-[10px]">
        <span className="text-muted-foreground">Before</span>
        <span className="font-medium">{formatBytes(originalSize)}</span>
      </div>
      <div className="flex justify-between text-[10px]">
        <span className="text-muted-foreground">After</span>
        <span className="font-medium">{formatBytes(resultSize)}</span>
      </div>
      {sizeDiff !== 0 && (
        <div className="flex justify-between text-[10px] pt-1 border-t border-green-200 dark:border-green-800">
          <span className="text-muted-foreground">Size change</span>
          <span className={`font-semibold ${pctChange <= 0 ? 'text-green-600' : 'text-orange-500'}`}>
            {pctChange <= 0 ? `${pctChange}%` : `+${pctChange}%`}
          </span>
        </div>
      )}
    </div>
  );
}

// ── Panel header ─────────────────────────────────────────────────────

function PanelHeader({ toolId }: { toolId: ToolId }) {
  const tool = TOOL_REGISTRY[toolId];
  return (
    <div className="mb-3">
      <h3 className="text-xs font-semibold">{tool.name}</h3>
      <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">{tool.description}</p>
    </div>
  );
}

// ── Compress Panel ───────────────────────────────────────────────────

const COMPRESS_PRESETS = [
  { value: 'screen', label: 'Low quality (smallest)', desc: 'Best for screen viewing' },
  { value: 'ebook', label: 'Medium quality', desc: 'Good for reading on devices' },
  { value: 'printer', label: 'High quality', desc: 'Suitable for printing' },
  { value: 'prepress', label: 'Maximum quality', desc: 'Prepress / archival' },
] as const;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function CompressPanel() {
  const { state, updatePdfBytes, markDirty } = useEditorContext();
  const [preset, setPreset] = useState<string>('ebook');

  const [previewBytes, setPreviewBytes] = useState<Uint8Array | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [compressionResult, setCompressionResult] = useState<{
    originalSize: number;
    compressedSize: number;
  } | null>(null);

  const { apply, isApplying, success, error } = useApply(previewBytes, updatePdfBytes, markDirty);

  const handleApply = useCallback(async () => {
    setIsProcessing(true);
    setCompressionResult(null);
    try {
      const { tempDir, join } = await import('@tauri-apps/api/path');
      const tmpBase = await tempDir();
      const ts = Date.now();
      const tempInputPath = await join(tmpBase, `papercut_sidebar_${ts}.pdf`);

      const { writeFile, remove } = await import('@tauri-apps/plugin-fs');
      const originalSize = state.pdfBytes.byteLength;
      await writeFile(tempInputPath, state.pdfBytes);

      const gsResult: ArrayBuffer = await invoke('compress_pdf', {
        sourcePath: tempInputPath,
        preset,
      });

      await remove(tempInputPath).catch(() => {});

      const result = new Uint8Array(gsResult);
      setPreviewBytes(result);
      setIsProcessing(false);
      setCompressionResult({
        originalSize,
        compressedSize: result.byteLength,
      });

      updatePdfBytes(result);
      markDirty();
    } catch (err) {
      setIsProcessing(false);
      await apply(() => Promise.reject(err));
    }
  }, [state.pdfBytes, preset, updatePdfBytes, markDirty, apply]);

  const reductionPct = compressionResult
    ? Math.round((1 - compressionResult.compressedSize / compressionResult.originalSize) * 100)
    : null;

  return (
    <div className="space-y-3">
      <PanelHeader toolId="compress-pdf" />

      <div className="space-y-1.5">
        <label className="text-[10px] font-medium text-muted-foreground">Quality Preset</label>
        {COMPRESS_PRESETS.map((p) => (
          <label
            key={p.value}
            className={`flex items-start gap-2 p-1.5 rounded cursor-pointer text-[11px] border ${
              preset === p.value ? 'border-primary bg-primary/5' : 'border-transparent hover:bg-muted/50'
            }`}
          >
            <input
              type="radio"
              name="compress-preset"
              value={p.value}
              checked={preset === p.value}
              onChange={() => setPreset(p.value)}
              className="mt-0.5"
            />
            <div>
              <div className="font-medium">{p.label}</div>
              <div className="text-[10px] text-muted-foreground">{p.desc}</div>
            </div>
          </label>
        ))}
      </div>

      {/* Compression result feedback */}
      {compressionResult && (
        <div className="rounded border bg-muted/30 p-2 space-y-1">
          <div className="flex justify-between text-[10px]">
            <span className="text-muted-foreground">Original</span>
            <span className="font-medium">{formatBytes(compressionResult.originalSize)}</span>
          </div>
          <div className="flex justify-between text-[10px]">
            <span className="text-muted-foreground">Compressed</span>
            <span className="font-medium">{formatBytes(compressionResult.compressedSize)}</span>
          </div>
          <div className="flex justify-between text-[10px] pt-1 border-t">
            <span className="text-muted-foreground">Reduction</span>
            <span className={`font-semibold ${reductionPct! > 0 ? 'text-green-500' : 'text-orange-500'}`}>
              {reductionPct! > 0 ? `−${reductionPct}%` : `+${Math.abs(reductionPct!)}%`}
            </span>
          </div>
        </div>
      )}

      <ToolSidebarPreview
        originalBytes={state.pdfBytes}
        previewBytes={previewBytes}
        isProcessing={isProcessing}
      />

      <ApplyButton
        onClick={handleApply}
        disabled={false}
        isApplying={isApplying || isProcessing}
        success={success}
        error={error}
      />
    </div>
  );
}

// ── Rotate Panel ─────────────────────────────────────────────────────

/** Compass direction entries for the rotate tool */
const COMPASS_DIRECTIONS: { label: string; short: string; degrees: RotationDegrees | 0 }[] = [
  { label: 'Original', short: '↑', degrees: 0 },
  { label: 'Turn Right', short: '→', degrees: 90 },
  { label: 'Upside Down', short: '↓', degrees: 180 },
  { label: 'Turn Left', short: '←', degrees: 270 },
];

function RotatePanel() {
  const { state, updatePdfBytes, markDirty } = useEditorContext();
  const [rotation, setRotation] = useState<RotationDegrees | 0>(0);
  const [applyToAll, setApplyToAll] = useState(false);

  const runTool = useCallback(async (bytes: Uint8Array) => {
    if (rotation === 0) return bytes; // No rotation
    const pageIndices = applyToAll
      ? Array.from({ length: state.pageCount }, (_, i) => i)
      : [state.currentPage];

    const result = await rotatePdf(
      bytes,
      pageIndices.map((idx) => ({ pageIndex: idx, rotation: rotation as RotationDegrees })),
    );
    return result.bytes;
  }, [rotation, applyToAll, state.currentPage, state.pageCount]);

  const { previewBytes, isProcessing } = useDebouncedPreview(
    state.pdfBytes,
    runTool,
    [rotation, applyToAll, state.currentPage],
  );

  const { apply, isApplying, success, error } = useApply(previewBytes, updatePdfBytes, markDirty);

  return (
    <div className="space-y-3">
      <PanelHeader toolId="rotate-pdf" />

      <div className="space-y-1.5">
        <label className="text-[10px] font-medium text-muted-foreground">Direction</label>
        {/* Compass-style 2x2 grid */}
        <div className="grid grid-cols-2 gap-1">
          {COMPASS_DIRECTIONS.map((dir) => (
            <button
              type="button"
              key={dir.degrees}
              onClick={() => setRotation(dir.degrees)}
              className={`flex items-center gap-1.5 py-1.5 px-2 text-[11px] rounded border transition-colors ${
                rotation === dir.degrees
                  ? 'border-primary bg-primary/10 font-medium'
                  : 'border-border hover:bg-muted/50'
              }`}
            >
              <span className="text-base leading-none">{dir.short}</span>
              <span>{dir.label}</span>
            </button>
          ))}
        </div>
      </div>

      <label className="flex items-center gap-2 text-[11px] cursor-pointer">
        <input
          type="checkbox"
          checked={applyToAll}
          onChange={(e) => setApplyToAll(e.target.checked)}
        />
        Apply to all pages
      </label>

      <ToolSidebarPreview
        originalBytes={state.pdfBytes}
        previewBytes={previewBytes}
        isProcessing={isProcessing}
      />

      <ApplyButton
        onClick={() => apply()}
        disabled={rotation === 0 || !previewBytes}
        isApplying={isApplying}
        success={success}
        error={error}
      />
    </div>
  );
}

// ── Watermark Panel ──────────────────────────────────────────────────

function WatermarkPanel() {
  const { state, updatePdfBytes, markDirty } = useEditorContext();
  const [options, setOptions] = useState<WatermarkOptions>({ ...DEFAULT_WATERMARK_OPTIONS });

  const runTool = useCallback(async (bytes: Uint8Array) => {
    if (!options.text.trim()) return bytes;
    return addWatermark(bytes, options);
  }, [options]);

  const { previewBytes, isProcessing } = useDebouncedPreview(
    state.pdfBytes,
    runTool,
    [options.text, options.fontSize, options.opacity, options.rotation, options.color],
  );

  const { apply, isApplying, success, error } = useApply(previewBytes, updatePdfBytes, markDirty);

  return (
    <div className="space-y-3">
      <PanelHeader toolId="watermark" />

      <div className="space-y-2">
        <div>
          <label className="text-[10px] font-medium text-muted-foreground">Text</label>
          <input
            type="text"
            value={options.text}
            onChange={(e) => setOptions((o) => ({ ...o, text: e.target.value }))}
            className="w-full mt-0.5 px-2 py-1 text-xs border rounded bg-background"
            placeholder="CONFIDENTIAL"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] font-medium text-muted-foreground">Font Size</label>
            <input
              type="number"
              value={options.fontSize}
              onChange={(e) => setOptions((o) => ({ ...o, fontSize: Number(e.target.value) || 12 }))}
              className="w-full mt-0.5 px-2 py-1 text-xs border rounded bg-background"
              min={8}
              max={120}
            />
          </div>
          <div>
            <label className="text-[10px] font-medium text-muted-foreground">Rotation</label>
            <input
              type="number"
              value={options.rotation}
              onChange={(e) => setOptions((o) => ({ ...o, rotation: Number(e.target.value) }))}
              className="w-full mt-0.5 px-2 py-1 text-xs border rounded bg-background"
              min={-180}
              max={180}
            />
          </div>
        </div>

        <div>
          <label className="text-[10px] font-medium text-muted-foreground">
            Opacity: {Math.round(options.opacity * 100)}%
          </label>
          <input
            type="range"
            min={5}
            max={100}
            value={Math.round(options.opacity * 100)}
            onChange={(e) => setOptions((o) => ({ ...o, opacity: Number(e.target.value) / 100 }))}
            className="w-full mt-0.5"
          />
        </div>

        <div>
          <label className="text-[10px] font-medium text-muted-foreground">Color</label>
          <div className="flex gap-1 mt-0.5">
            {(['gray', 'red', 'blue'] as const).map((c) => (
              <button
                key={c}
                onClick={() => setOptions((o) => ({ ...o, color: c }))}
                className={`px-2 py-0.5 text-[10px] rounded border capitalize ${
                  options.color === c ? 'border-primary bg-primary/10 font-medium' : 'border-border hover:bg-muted/50'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      </div>

      <ToolSidebarPreview
        originalBytes={state.pdfBytes}
        previewBytes={previewBytes}
        isProcessing={isProcessing}
      />

      <ApplyButton
        onClick={() => apply()}
        disabled={!options.text.trim()}
        isApplying={isApplying}
        success={success}
        error={error}
      />
    </div>
  );
}

// ── Page Numbers Panel ───────────────────────────────────────────────

function PageNumbersPanel() {
  const { state, updatePdfBytes, markDirty } = useEditorContext();
  const [options, setOptions] = useState<PageNumberOptions>({
    position: 'bottom-center',
    format: 'numeric',
    fontSize: 12,
    startNumber: 1,
    margin: 30,
  });

  const runTool = useCallback(async (bytes: Uint8Array) => {
    return addPageNumbers(bytes, options);
  }, [options]);

  const { previewBytes, isProcessing } = useDebouncedPreview(
    state.pdfBytes,
    runTool,
    [options.position, options.format, options.fontSize, options.startNumber, options.margin],
  );

  const { apply, isApplying, success, error } = useApply(previewBytes, updatePdfBytes, markDirty);

  return (
    <div className="space-y-3">
      <PanelHeader toolId="page-numbers" />

      <div className="space-y-2">
        <div>
          <label className="text-[10px] font-medium text-muted-foreground">Position</label>
          <select
            value={options.position}
            onChange={(e) => setOptions((o) => ({ ...o, position: e.target.value as NumberPosition }))}
            className="w-full mt-0.5 px-2 py-1 text-xs border rounded bg-background"
          >
            <option value="bottom-center">Bottom Center</option>
            <option value="bottom-left">Bottom Left</option>
            <option value="bottom-right">Bottom Right</option>
            <option value="top-center">Top Center</option>
            <option value="top-left">Top Left</option>
            <option value="top-right">Top Right</option>
          </select>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] font-medium text-muted-foreground">Format</label>
            <select
              value={options.format}
              onChange={(e) => setOptions((o) => ({ ...o, format: e.target.value as NumberFormat }))}
              className="w-full mt-0.5 px-2 py-1 text-xs border rounded bg-background"
            >
              <option value="numeric">1, 2, 3</option>
              <option value="roman">i, ii, iii</option>
              <option value="alphabetic">A, B, C</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] font-medium text-muted-foreground">Start At</label>
            <input
              type="number"
              value={options.startNumber}
              onChange={(e) => setOptions((o) => ({ ...o, startNumber: Number(e.target.value) || 1 }))}
              className="w-full mt-0.5 px-2 py-1 text-xs border rounded bg-background"
              min={1}
            />
          </div>
        </div>

        <div>
          <label className="text-[10px] font-medium text-muted-foreground">Font Size</label>
          <input
            type="number"
            value={options.fontSize}
            onChange={(e) => setOptions((o) => ({ ...o, fontSize: Number(e.target.value) || 12 }))}
            className="w-full mt-0.5 px-2 py-1 text-xs border rounded bg-background"
            min={6}
            max={48}
          />
        </div>
      </div>

      <ToolSidebarPreview
        originalBytes={state.pdfBytes}
        previewBytes={previewBytes}
        isProcessing={isProcessing}
      />

      <ApplyButton
        onClick={() => apply()}
        disabled={!previewBytes}
        isApplying={isApplying}
        success={success}
        error={error}
      />
    </div>
  );
}

// ── Crop Panel ───────────────────────────────────────────────────────

function CropPanel() {
  const { state, updatePdfBytes, markDirty } = useEditorContext();
  const [margins, setMargins] = useState({ top: 10, bottom: 10, left: 10, right: 10 });
  const [linked, setLinked] = useState(true);

  const handleMarginChange = useCallback((side: 'top' | 'bottom' | 'left' | 'right', value: number) => {
    if (linked) {
      setMargins({ top: value, bottom: value, left: value, right: value });
    } else {
      setMargins((m) => ({ ...m, [side]: value }));
    }
  }, [linked]);

  const runTool = useCallback(async (bytes: Uint8Array) => {
    const cropMargins: CropMargins = {
      top: mmToPoints(margins.top),
      bottom: mmToPoints(margins.bottom),
      left: mmToPoints(margins.left),
      right: mmToPoints(margins.right),
    };
    return cropPdf(bytes, cropMargins);
  }, [margins]);

  const { previewBytes, isProcessing } = useDebouncedPreview(
    state.pdfBytes,
    runTool,
    [margins.top, margins.bottom, margins.left, margins.right],
  );

  const { apply, isApplying, success, error } = useApply(previewBytes, updatePdfBytes, markDirty);

  return (
    <div className="space-y-3">
      <PanelHeader toolId="crop-pdf" />

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-[10px] font-medium text-muted-foreground">Margins (mm)</label>
          <label className="flex items-center gap-1 text-[10px] cursor-pointer">
            <input
              type="checkbox"
              checked={linked}
              onChange={(e) => setLinked(e.target.checked)}
              className="rounded"
            />
            <span className="text-muted-foreground">All equal</span>
          </label>
        </div>

        {linked ? (
          <div>
            <label className="text-[10px] text-muted-foreground">All sides</label>
            <input
              type="number"
              value={margins.top}
              onChange={(e) => handleMarginChange('top', Number(e.target.value) || 0)}
              className="w-full mt-0.5 px-2 py-1 text-xs border rounded bg-background"
              min={0}
              max={100}
              title="All margins (mm)"
            />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {(['top', 'bottom', 'left', 'right'] as const).map((side) => (
              <div key={side}>
                <label className="text-[10px] text-muted-foreground capitalize">{side}</label>
                <input
                  type="number"
                  value={margins[side]}
                  onChange={(e) => handleMarginChange(side, Number(e.target.value) || 0)}
                  className="w-full mt-0.5 px-2 py-1 text-xs border rounded bg-background"
                  min={0}
                  max={100}
                  title={`${side} margin (mm)`}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      <ToolSidebarPreview
        originalBytes={state.pdfBytes}
        previewBytes={previewBytes}
        isProcessing={isProcessing}
      />

      <ApplyButton
        onClick={() => apply()}
        disabled={!previewBytes}
        isApplying={isApplying}
        success={success}
        error={error}
      />
    </div>
  );
}

// ── Sign Panel (placeholder) ─────────────────────────────────────────

function SignPanel() {
  const { state, setEditorMode } = useEditorContext();
  const isTextMode = state.editorMode === 'text';
  return (
    <div className="space-y-3">
      <PanelHeader toolId="sign-pdf" />
      <p className="text-[10px] text-muted-foreground leading-relaxed">
        Use the text tool to type your signature directly on the PDF. Activate text mode, then click anywhere on the page to place your signature text.
      </p>
      <button
        type="button"
        onClick={() => setEditorMode(isTextMode ? 'select' : 'text')}
        className={`w-full py-1.5 px-3 text-xs font-medium rounded transition-colors flex items-center justify-center gap-1.5 ${
          isTextMode
            ? 'bg-green-600 text-white'
            : 'bg-primary text-primary-foreground hover:bg-primary/90'
        }`}
      >
        {isTextMode ? (
          <>
            <Check className="h-3 w-3" />
            Text Mode Active — Click on page to place text
          </>
        ) : (
          'Activate Text Mode'
        )}
      </button>
      {isTextMode && (
        <div className="rounded border border-green-200 bg-green-50 dark:bg-green-950/30 dark:border-green-800 p-2">
          <p className="text-[10px] text-green-700 dark:text-green-400 font-medium">
            Click anywhere on the PDF canvas to place a new text block. The cursor will show as a crosshair (+) on the page.
          </p>
        </div>
      )}
      <p className="text-[9px] text-muted-foreground italic">
        Image-based signature support coming in a future update.
      </p>
    </div>
  );
}

// ── Redact Panel ─────────────────────────────────────────────────────

function RedactPanel() {
  const { state, setEditorMode } = useEditorContext();
  const isTextMode = state.editorMode === 'text';
  return (
    <div className="space-y-3">
      <PanelHeader toolId="redact-pdf" />
      <p className="text-[10px] text-muted-foreground leading-relaxed">
        To redact text: click a text block to select it, then press <kbd className="px-1 py-0.5 rounded bg-muted text-[9px] font-mono">Delete</kbd> or <kbd className="px-1 py-0.5 rounded bg-muted text-[9px] font-mono">Backspace</kbd>. The area will be covered with a white rectangle in the saved PDF.
      </p>
      <p className="text-[10px] text-muted-foreground leading-relaxed">
        You can also place opaque text blocks over sensitive content:
      </p>
      <button
        type="button"
        onClick={() => setEditorMode(isTextMode ? 'select' : 'text')}
        className={`w-full py-1.5 px-3 text-xs font-medium rounded transition-colors flex items-center justify-center gap-1.5 ${
          isTextMode
            ? 'bg-green-600 text-white'
            : 'bg-primary text-primary-foreground hover:bg-primary/90'
        }`}
      >
        {isTextMode ? (
          <>
            <Check className="h-3 w-3" />
            Text Mode Active — Click on page to place block
          </>
        ) : (
          'Activate Text Mode'
        )}
      </button>
      {isTextMode && (
        <div className="rounded border border-green-200 bg-green-50 dark:bg-green-950/30 dark:border-green-800 p-2">
          <p className="text-[10px] text-green-700 dark:text-green-400 font-medium">
            Click anywhere on the PDF canvas to place a covering text block. The cursor will show as a crosshair (+) on the page.
          </p>
        </div>
      )}
      <p className="text-[9px] text-muted-foreground italic">
        Rectangle-based redaction coming in a future update.
      </p>
    </div>
  );
}

// ── PDF/A Convert Panel ──────────────────────────────────────────────

function PdfaPanel() {
  const { state, updatePdfBytes, markDirty } = useEditorContext();
  const [pdfaLevel, setPdfaLevel] = useState<string>('2');
  const [isProcessing, setIsProcessing] = useState(false);
  const [resultInfo, setResultInfo] = useState<{ originalSize: number; resultSize: number } | null>(null);
  const { apply, isApplying, success, error } = useApply(null, updatePdfBytes, markDirty);

  const handleApply = useCallback(async () => {
    setIsProcessing(true);
    setResultInfo(null);
    const originalSize = state.pdfBytes.byteLength;
    try {
      const { tempDir, join } = await import('@tauri-apps/api/path');
      const tmpBase = await tempDir();
      const ts = Date.now();
      const tempInputPath = await join(tmpBase, `papercut_pdfa_${ts}.pdf`);

      const { writeFile, remove } = await import('@tauri-apps/plugin-fs');
      await writeFile(tempInputPath, state.pdfBytes);

      const bytes: Uint8Array = await invoke('convert_pdfa', {
        sourcePath: tempInputPath,
        pdfaLevel,
      });

      await remove(tempInputPath).catch(() => {});

      const result = new Uint8Array(bytes);
      setIsProcessing(false);
      setResultInfo({ originalSize, resultSize: result.byteLength });
      await apply(() => Promise.resolve(result));
    } catch (err) {
      setIsProcessing(false);
      await apply(() => Promise.reject(err));
    }
  }, [state.pdfBytes, pdfaLevel, apply]);

  return (
    <div className="space-y-3">
      <PanelHeader toolId="pdfa-convert" />

      <div>
        <label className="text-[10px] font-medium text-muted-foreground">PDF/A Level</label>
        <select
          value={pdfaLevel}
          onChange={(e) => setPdfaLevel(e.target.value)}
          className="w-full mt-0.5 px-2 py-1 text-xs border rounded bg-background"
          title="PDF/A conformance level"
        >
          <option value="1">PDF/A-1 (most compatible)</option>
          <option value="2">PDF/A-2 (recommended)</option>
          <option value="3">PDF/A-3 (full features)</option>
        </select>
      </div>

      {resultInfo && (
        <ToolResultFeedback
          originalSize={resultInfo.originalSize}
          resultSize={resultInfo.resultSize}
          toolLabel={`PDF/A-${pdfaLevel} conversion`}
        />
      )}

      <ToolSidebarPreview originalBytes={state.pdfBytes} previewBytes={null} isProcessing={isProcessing} />

      <ApplyButton
        onClick={handleApply}
        disabled={false}
        isApplying={isApplying || isProcessing}
        success={success}
        error={error}
      />
    </div>
  );
}

// ── Repair Panel ─────────────────────────────────────────────────────

function RepairPanel() {
  const { state, updatePdfBytes, markDirty } = useEditorContext();
  const [isProcessing, setIsProcessing] = useState(false);
  const [resultInfo, setResultInfo] = useState<{ originalSize: number; resultSize: number } | null>(null);
  const { apply, isApplying, success, error } = useApply(null, updatePdfBytes, markDirty);

  const handleApply = useCallback(async () => {
    setIsProcessing(true);
    setResultInfo(null);
    const originalSize = state.pdfBytes.byteLength;
    try {
      const { tempDir, join } = await import('@tauri-apps/api/path');
      const tmpBase = await tempDir();
      const ts = Date.now();
      const tempInputPath = await join(tmpBase, `papercut_repair_${ts}.pdf`);

      const { writeFile, remove } = await import('@tauri-apps/plugin-fs');
      await writeFile(tempInputPath, state.pdfBytes);

      const bytes: Uint8Array = await invoke('repair_pdf', {
        sourcePath: tempInputPath,
      });

      await remove(tempInputPath).catch(() => {});

      const result = new Uint8Array(bytes);
      setIsProcessing(false);
      setResultInfo({ originalSize, resultSize: result.byteLength });
      await apply(() => Promise.resolve(result));
    } catch (err) {
      setIsProcessing(false);
      await apply(() => Promise.reject(err));
    }
  }, [state.pdfBytes, apply]);

  return (
    <div className="space-y-3">
      <PanelHeader toolId="repair-pdf" />
      <p className="text-[10px] text-muted-foreground">
        Attempt to fix corrupted or malformed PDF structure using Ghostscript.
      </p>

      {resultInfo && (
        <ToolResultFeedback
          originalSize={resultInfo.originalSize}
          resultSize={resultInfo.resultSize}
          toolLabel="PDF repair"
        />
      )}

      <ToolSidebarPreview originalBytes={state.pdfBytes} previewBytes={null} isProcessing={isProcessing} />

      <ApplyButton
        onClick={handleApply}
        disabled={false}
        isApplying={isApplying || isProcessing}
        success={success}
        error={error}
      />
    </div>
  );
}

// ── Protect Panel ────────────────────────────────────────────────────

function ProtectPanel() {
  const { state, updatePdfBytes, markDirty } = useEditorContext();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const { apply, isApplying, success, error } = useApply(null, updatePdfBytes, markDirty);

  const passwordsMatch = password.length > 0 && password === confirmPassword;

  const handleApply = useCallback(async () => {
    if (!passwordsMatch) return;
    setIsProcessing(true);
    try {
      const { tempDir, join } = await import('@tauri-apps/api/path');
      const tmpBase = await tempDir();
      const ts = Date.now();
      const tempInputPath = await join(tmpBase, `papercut_protect_${ts}.pdf`);

      const { writeFile, remove } = await import('@tauri-apps/plugin-fs');
      await writeFile(tempInputPath, state.pdfBytes);

      const bytes: Uint8Array = await invoke('protect_pdf', {
        sourcePath: tempInputPath,
        ownerPassword: password,
        userPassword: password,
      });

      await remove(tempInputPath).catch(() => {});

      const result = new Uint8Array(bytes);
      setIsProcessing(false);
      await apply(() => Promise.resolve(result));
    } catch (err) {
      setIsProcessing(false);
      await apply(() => Promise.reject(err));
    }
  }, [state.pdfBytes, password, passwordsMatch, apply]);

  return (
    <div className="space-y-3">
      <PanelHeader toolId="protect-pdf" />

      <div className="space-y-2">
        <div>
          <label className="text-[10px] font-medium text-muted-foreground">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full mt-0.5 px-2 py-1 text-xs border rounded bg-background"
            placeholder="Enter password"
          />
        </div>
        <div>
          <label className="text-[10px] font-medium text-muted-foreground">Confirm Password</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full mt-0.5 px-2 py-1 text-xs border rounded bg-background"
            placeholder="Confirm password"
          />
        </div>
        {password && confirmPassword && !passwordsMatch && (
          <p className="text-[10px] text-destructive">Passwords do not match</p>
        )}
      </div>

      {success ? (
        <div className="rounded border border-green-200 bg-green-50 dark:bg-green-950/30 dark:border-green-800 p-2">
          <div className="flex items-center gap-1.5 text-[10px] font-medium text-green-700 dark:text-green-400">
            <Check className="h-3 w-3" />
            PDF is now password-protected
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-center py-3">
          <Lock className="h-8 w-8 text-muted-foreground" />
        </div>
      )}

      <ApplyButton
        onClick={handleApply}
        disabled={!passwordsMatch}
        isApplying={isApplying || isProcessing}
        success={success}
        error={error}
      />
    </div>
  );
}

// ── Unlock Panel ─────────────────────────────────────────────────────

function UnlockPanel() {
  const { state, updatePdfBytes, markDirty } = useEditorContext();
  const [password, setPassword] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const { apply, isApplying, success, error } = useApply(null, updatePdfBytes, markDirty);

  const handleApply = useCallback(async () => {
    if (!password) return;
    setIsProcessing(true);
    try {
      const { tempDir, join } = await import('@tauri-apps/api/path');
      const tmpBase = await tempDir();
      const ts = Date.now();
      const tempInputPath = await join(tmpBase, `papercut_unlock_${ts}.pdf`);

      const { writeFile, remove } = await import('@tauri-apps/plugin-fs');
      await writeFile(tempInputPath, state.pdfBytes);

      const bytes: Uint8Array = await invoke('unlock_pdf', {
        sourcePath: tempInputPath,
        password,
      });

      await remove(tempInputPath).catch(() => {});

      const result = new Uint8Array(bytes);
      setIsProcessing(false);
      await apply(() => Promise.resolve(result));
    } catch (err) {
      setIsProcessing(false);
      await apply(() => Promise.reject(err));
    }
  }, [state.pdfBytes, password, apply]);

  return (
    <div className="space-y-3">
      <PanelHeader toolId="unlock-pdf" />

      <div>
        <label className="text-[10px] font-medium text-muted-foreground">Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full mt-0.5 px-2 py-1 text-xs border rounded bg-background"
          placeholder="Enter PDF password"
        />
      </div>

      {success ? (
        <div className="rounded border border-green-200 bg-green-50 dark:bg-green-950/30 dark:border-green-800 p-2">
          <div className="flex items-center gap-1.5 text-[10px] font-medium text-green-700 dark:text-green-400">
            <Check className="h-3 w-3" />
            PDF password protection removed
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-center py-3">
          <Unlock className="h-8 w-8 text-muted-foreground" />
        </div>
      )}

      <ApplyButton
        onClick={handleApply}
        disabled={!password}
        isApplying={isApplying || isProcessing}
        success={success}
        error={error}
      />
    </div>
  );
}

// ── Panel Router ─────────────────────────────────────────────────────

export function ToolSidebarPanel({ toolId }: ToolSidebarPanelProps) {
  switch (toolId) {
    case 'compress-pdf':
      return <CompressPanel />;
    case 'rotate-pdf':
      return <RotatePanel />;
    case 'watermark':
      return <WatermarkPanel />;
    case 'page-numbers':
      return <PageNumbersPanel />;
    case 'crop-pdf':
      return <CropPanel />;
    case 'sign-pdf':
      return <SignPanel />;
    case 'redact-pdf':
      return <RedactPanel />;
    case 'pdfa-convert':
      return <PdfaPanel />;
    case 'repair-pdf':
      return <RepairPanel />;
    case 'protect-pdf':
      return <ProtectPanel />;
    case 'unlock-pdf':
      return <UnlockPanel />;
    default:
      return (
        <div className="text-[10px] text-muted-foreground p-2">
          Tool panel not yet implemented.
        </div>
      );
  }
}
