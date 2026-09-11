// ToolSidebarPanel: renders inline tool settings for the selected tool.
// Each tool shows: title + description, settings form, before/after preview, Apply button.
// Preview pipeline: settings change (debounced 500ms) -> run tool -> update previewBytes.
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { ToolId } from '@/types/tools';
import { TOOL_REGISTRY } from '@/types/tools';
import { useEditorContext } from '@/context/EditorContext';
import { ToolSidebarPreview } from './ToolSidebarPreview';
import { rotatePdf, turnBy, type RotationDegrees } from '@/lib/pdfRotate';
import { turnWatermarkBy } from '@/lib/watermarkRotation';
import {
  addWatermark,
  addWatermarkSinglePage,
  DEFAULT_WATERMARK_OPTIONS,
  WATERMARK_FONT_SIZE_MAX,
  WATERMARK_FONT_SIZE_MIN,
  type WatermarkOptions,
} from '@/lib/pdfWatermark';
import { addPageNumbers, addPageNumbersSinglePage, type PageNumberOptions, type NumberPosition, type NumberFormat } from '@/lib/pdfPageNumbers';
import { rasteriseSignatureDataUrl, signatureBlockSize } from '@/lib/signatureRaster';
import { useSavedSignatures } from '@/hooks/useSavedSignatures';
import { SignatureBackground, type SignatureBg } from '@/components/SignatureBackground';
import { SignatureCanvas } from '@/components/sign-pdf/SignatureCanvas';
import { SignatureUpload } from '@/components/sign-pdf/SignatureUpload';
import { applySignatureBackground } from '@/lib/signatureBackground';
import { applyRedactions } from '@/lib/pdfRedact';
import type { TextMatch } from '@/lib/pdfTextSearch';
import { useDocumentSearch } from '@/hooks/useDocumentSearch';
import { isAlreadyMarked, matchToRect, redactionScopes, type RedactionScope } from '@/lib/redactionScope';
import { nextStampPosition } from '@/lib/blockResize';
import { parsePageRange } from '@/lib/pdfUtils';
import { DEFAULT_TEXT_COLOR, isLightColor } from '@/lib/colorPresets';
import { offersKbUnit, smallestReachableTarget } from '@/lib/compressTargetSize';
import { SavedSettingsRow, SaveSettingAs } from '@/components/destinations/DestinationPicker';
import { targetSizeInput, type DestinationRequirement } from '@/lib/destinations';
import { useDestinations } from '@/hooks/useDestinations';
import {
  getPdfCompressibilityFromBytes,
  estimateOutputSizeBytes,
  getNonCompressibleReason,
  nonCompressibleMessage,
  resizePagesInDocument,
  type PdfCompressibility,
} from '@/lib/pdfProcessor';
import type { PdfQualityLevel, PdfPagePreset } from '@/types/file';
import { ColorPicker } from '@/components/ColorPicker';
import { cropPdf, cropPdfSinglePage, type CropMargins, mmToPoints } from '@/lib/pdfCrop';
import { Check, AlertCircle, Expand, RotateCcw, RotateCw } from 'lucide-react';
import { diagLog } from '@/lib/diagLog';
import { plural, t } from '@/i18n';
import { useLocale } from '@/i18n/context';
import { listen } from '@tauri-apps/api/event';
import { ocrPdf, type OcrSummary } from '@/lib/ocrProcessor';
import { listOcrLanguages, type OcrLanguage } from '@/lib/ocrLanguages';
import { OtterSpinner } from '@/components/brand/OtterSpinner';
import { dataUrlToBytes } from '@/lib/dataUrl';
import { cropMarginPresets } from '@/lib/cropPresets';
import { cn } from '@/lib/utils';

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
    diagLog(`useDebouncedPreview.scheduled runId=${runId}`);

    timeoutRef.current = setTimeout(async () => {
      diagLog(`useDebouncedPreview.runTool.start runId=${runId}`);
      const t0 = performance.now();
      try {
        const result = await runTool(pdfBytes);
        diagLog(`useDebouncedPreview.runTool.done runId=${runId} ms=${(performance.now() - t0).toFixed(0)} stale=${runIdRef.current !== runId}`);
        // Only update if this is still the latest run
        if (runIdRef.current === runId) {
          setPreviewBytes(result);
          setIsProcessing(false);
        }
      } catch {
        diagLog(`useDebouncedPreview.runTool.threw runId=${runId} ms=${(performance.now() - t0).toFixed(0)}`);
        if (runIdRef.current === runId) {
          setPreviewBytes(null);
          setIsProcessing(false);
        }
      }
    }, delay);

    return () => {
      clearTimeout(timeoutRef.current);
      // If cleanup fires (unmount or re-run), ensure processing flag is cleared.
      // Reading runIdRef.current *at cleanup time* is the point: it tells us
      // whether a newer run has superseded this one. Copying it into a variable
      // inside the effect, as react-hooks/exhaustive-deps suggests, would freeze
      // it at the captured value and make this comparison always true.
      // eslint-disable-next-line react-hooks/exhaustive-deps
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
        data-framed
        className="w-full py-1.5 px-3 text-xs font-medium bg-primary text-primary-foreground hover:brightness-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none flex items-center justify-center gap-1.5"
      >
        {isApplying ? (
          <>
            <OtterSpinner className="size-4" />
            {t('common.applying')}
          </>
        ) : success ? (
          <>
            <Check className="h-3 w-3" />
            {t('pdfEditor.applied')}
          </>
        ) : (
          t('toolSidebarPanel.apply')
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
      if (!bytes) throw new Error(t('toolSidebarPanel.noPreviewAvailable'));
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
        {t('toolSidebarPanel.appliedSuccessfully', { tool: toolLabel })}
      </div>
      <div className="flex justify-between text-[10px]">
        <span className="text-muted-foreground">{t('compare.before')}</span>
        <span className="font-medium">{formatBytes(originalSize)}</span>
      </div>
      <div className="flex justify-between text-[10px]">
        <span className="text-muted-foreground">{t('compare.after')}</span>
        <span className="font-medium">{formatBytes(resultSize)}</span>
      </div>
      {sizeDiff !== 0 && (
        <div className="flex justify-between text-[10px] pt-1 border-t border-green-200 dark:border-green-800">
          <span className="text-muted-foreground">{t('pdfEditor.sizeChange')}</span>
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
      <h3 className="text-xs font-semibold">{t(tool.name)}</h3>
      <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">{t(tool.description)}</p>
    </div>
  );
}

// ── Compress Panel ───────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Quality zones matching the full compress tool.
 *
 * Values and DPI figures only -- the label and description are translated, and
 * a `const` holding them resolves the English at import and keeps it.
 */
const QUALITY_ZONES = [
  { value: 'screen', quality: 'web' as PdfQualityLevel, dpi: '72–150 dpi' },
  { value: 'ebook', quality: 'screen' as PdfQualityLevel, dpi: '150 dpi' },
  { value: 'printer', quality: 'print' as PdfQualityLevel, dpi: '300 dpi' },
  // "Lossless" is a word, not a figure, so it is resolved at render by
  // zoneFigure below rather than frozen in English here.
  { value: 'prepress', quality: 'archive' as PdfQualityLevel, dpi: '' },
] as const;

/** See the note on QUALITY_ZONES: the archive figure is a translatable word. */
function zoneFigure(value: ZoneValue, dpi: string): string {
  return value === 'prepress' ? t('configureStep.lossless') : dpi;
}

type ZoneValue = (typeof QUALITY_ZONES)[number]['value'];

type MarginSide = 'top' | 'bottom' | 'left' | 'right';

function sideLabel(side: MarginSide): string {
  const labels: Record<MarginSide, string> = {
    top: t('common.top'),
    bottom: t('common.bottom'),
    left: t('common.left'),
    right: t('common.right'),
  };
  return labels[side];
}

function zoneLabel(value: ZoneValue): string {
  const labels: Record<ZoneValue, string> = {
    screen: t('toolSidebarPanel.webScreen'),
    ebook: t('toolSidebarPanel.mediumEbook'),
    printer: t('toolSidebarPanel.highPrint'),
    prepress: t('toolSidebarPanel.maximumPrepress'),
  };
  return labels[value];
}

function zoneDesc(value: ZoneValue): string {
  const descriptions: Record<ZoneValue, string> = {
    screen: t('toolSidebarPanel.smallestFileBestForScreen'),
    ebook: t('toolSidebarPanel.goodForReadingOnDevices'),
    printer: t('toolSidebarPanel.suitableForPrinting'),
    prepress: t('toolSidebarPanel.prepressArchivalNoRecompression'),
  };
  return descriptions[value];
}

/**
 * The page sizes the resize offers, matching the standalone tool exactly.
 *
 * A function, not a constant: these labels are translated, and a module-level
 * constant resolves them once at import, before the locale is known.
 */
function pageSizePresets(): { value: PdfPagePreset; label: string }[] {
  return [
    { value: 'A4', label: t('configureStep.a4210297Mm') },
    { value: 'A3', label: t('configureStep.a3297420Mm') },
    { value: 'Letter', label: t('configureStep.letter216279Mm') },
    { value: 'custom', label: t('configureStep.custom') },
  ];
}

function CompressPanel() {
  const { state, selectedPages, updatePdfBytes, markDirty, setCompareMode } = useEditorContext();
  const [preset, setPreset] = useState<string>('ebook');

  // Target file size mode
  const [useTargetSize, setUseTargetSize] = useState(false);
  const [targetSizeValue, setTargetSizeValue] = useState('');
  const [targetUnit, setTargetUnit] = useState<'MB' | 'KB'>('MB');

  // Additional options
  const [downsampleImages, setDownsampleImages] = useState(true);

  // Page resize. The standalone tool has had these since it shipped; this panel
  // offered compression only, so the editor could not change a page's size at
  // all. Off by default, as it is there: it rewrites every page it touches.
  const [resizeEnabled, setResizeEnabled] = useState(false);
  const [pagePreset, setPagePreset] = useState<PdfPagePreset>('A4');
  const [customWidthMm, setCustomWidthMm] = useState('210');
  const [customHeightMm, setCustomHeightMm] = useState('297');

  // Saved settings. The same list the standalone tool keeps, so a setting saved
  // for a portal is there whichever way the document was opened -- which is the
  // whole point of a saved setting, and the editor had none of it.
  const [destination, setDestination] = useState<DestinationRequirement | null>(null);
  const { destinations, save: saveDestination, remove: removeDestination } = useDestinations();

  const [previewBytes, setPreviewBytes] = useState<Uint8Array | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [compressionResult, setCompressionResult] = useState<{
    originalSize: number;
    compressedSize: number;
    /** The target this run was judged against, frozen at apply time so later
     *  edits to the field cannot rewrite the verdict. */
    targetBytes: number | null;
  } | null>(null);
  const [analysis, setAnalysis] = useState<PdfCompressibility | null>(null);

  // The bytes this panel compresses from. Ghostscript is lossy, so compressing
  // its own output bakes in both lots of loss -- trying Screen, deciding it is
  // too soft and switching to eBook has to re-derive from the document as it
  // was, not stack eBook on top of Screen.
  const [baseline, setBaseline] = useState<Uint8Array | null>(null);
  // The last result this panel produced, so a change from anywhere else is
  // distinguishable from its own.
  const ownResultRef = useRef<Uint8Array | null>(null);

  useEffect(() => {
    // Revert, or another tool applying, leaves the baseline describing a
    // document that no longer exists; compressing from it would undo them.
    if (state.pdfBytes !== ownResultRef.current) setBaseline(null);
  }, [state.pdfBytes]);

  const baseBytes = baseline ?? state.pdfBytes;

  // What this document can actually give up, read once per version of the bytes.
  // Without it the panel offers four presets and no way to tell them apart.
  useEffect(() => {
    let cancelled = false;
    setAnalysis(null);
    getPdfCompressibilityFromBytes(baseBytes)
      .then((result) => { if (!cancelled) setAnalysis(result); })
      // An unreadable document simply means no estimates; the panel still works.
      .catch(() => { if (!cancelled) setAnalysis(null); });
    return () => { cancelled = true; };
  }, [baseBytes]);

  // Estimates predict what each preset yields from the baseline, since that is
  // what Apply will actually compress.
  const currentSize = baseBytes.byteLength;

  const estimates = useMemo(() => {
    if (!analysis) return null;
    return QUALITY_ZONES.reduce((acc, zone) => {
      acc[zone.value] = estimateOutputSizeBytes(
        zone.quality,
        currentSize,
        analysis.compressibilityScore,
        analysis.jpxByteShare,
      );
      return acc;
    }, {} as Record<string, number>);
  }, [analysis, currentSize]);

  const nonCompressibleReason = analysis
    ? getNonCompressibleReason(analysis.compressibilityScore, analysis.jpxByteShare)
    : null;

  // Asking for a size is only meaningful if the document can shrink at all.
  const canTargetSize = analysis !== null && nonCompressibleReason === null;
  const targetActive = canTargetSize && useTargetSize;

  // The most aggressive preset's estimate is the floor: nothing here goes below it.
  const floorBytes = estimates ? Math.min(...Object.values(estimates)) : null;

  // A unit the document cannot sensibly be measured in is the same trap as a
  // target it cannot reach. Applying another tool can raise the floor past the
  // point where KB is usable, so the unit in force is derived rather than
  // stored -- a stale KB selection can never survive into a target.
  const offerKb = floorBytes === null || offersKbUnit(floorBytes);
  const unit: 'MB' | 'KB' = offerKb ? targetUnit : 'MB';

  const targetBytes = useMemo(() => {
    const parsed = parseInt(targetSizeValue, 10);
    if (isNaN(parsed) || parsed < 1) return null;
    return parsed * (unit === 'MB' ? 1024 * 1024 : 1024);
  }, [targetSizeValue, unit]);

  const targetUnreachable =
    targetActive && targetBytes !== null && floorBytes !== null && targetBytes < floorBytes;
  const nonCompressibleMsg = analysis
    ? nonCompressibleMessage(nonCompressibleReason, analysis.imageCount)
    : null;

  const { apply, isApplying, success, error } = useApply(previewBytes, updatePdfBytes, markDirty);

  // Auto-select best preset for target size
  const resolvedPreset = useCallback((): string => {
    if (!targetActive || !targetSizeValue.trim()) return preset;
    const parsed = parseInt(targetSizeValue, 10);
    if (isNaN(parsed) || parsed < 1) return preset;
    const targetBytes = parsed * (unit === 'MB' ? 1024 * 1024 : 1024);
    const ratio = targetBytes / baseBytes.byteLength;
    // Pick the most aggressive preset that might meet the target
    if (ratio < 0.3) return 'screen';
    if (ratio < 0.5) return 'ebook';
    if (ratio < 0.8) return 'printer';
    return 'prepress';
  }, [targetActive, targetSizeValue, unit, baseBytes, preset]);

  /**
   * Apply a saved setting by moving the controls, not by overriding them.
   *
   * The same rule the standalone tool follows, for the same reason: the user
   * can see exactly what was set and change any of it, because a saved setting
   * is a starting point for their document rather than a mode the app enters.
   */
  const applyDestination = useCallback((d: DestinationRequirement | null) => {
    setDestination(d);
    if (!d) return;

    // Target size and quality are alternatives, so only the one it was saved
    // in comes back; restoring both would leave the panel in a state nobody
    // filled in.
    if (d.maxBytes !== undefined) {
      const { value, unit: u } = targetSizeInput(d.maxBytes);
      setUseTargetSize(true);
      setTargetSizeValue(value);
      setTargetUnit(u);
    } else if (d.qualityLevel !== undefined) {
      setUseTargetSize(false);
      const zone = QUALITY_ZONES.find((z) => z.quality === d.qualityLevel);
      if (zone) setPreset(zone.value);
    }

    if (d.pageSize !== undefined) {
      setResizeEnabled(true);
      setPagePreset(d.pageSize);
    } else {
      // Saved with resizing off, so it goes back off. Leaving a previous
      // setting's A4 in place would silently resize a document this one never
      // asked to resize.
      setResizeEnabled(false);
    }
  }, []);

  /** Save what the controls currently say, under the user's own name. */
  const saveCurrentAsDestination = useCallback((name: string) => {
    const parsed = parseInt(targetSizeValue, 10);
    const maxBytes = useTargetSize && !isNaN(parsed) && parsed > 0
      ? parsed * (unit === 'MB' ? 1024 * 1024 : 1024)
      : undefined;
    void saveDestination({
      name,
      maxBytes,
      // The zones are the four real presets; 'custom' is not one of them, so
      // this narrowing can never drop a quality that was actually offered.
      qualityLevel: !useTargetSize
        ? QUALITY_ZONES.find((z) => z.value === preset)?.quality as
            Exclude<PdfQualityLevel, 'custom'> | undefined
        : undefined,
      pageSize: resizeEnabled && pagePreset !== 'custom' ? pagePreset : undefined,
    });
  }, [targetSizeValue, useTargetSize, unit, preset, resizeEnabled, pagePreset, saveDestination]);

  // Which pages the resize touches. A selection in the Pages panel is what the
  // user pointed at, the same rule the Rotate panel follows; with no selection
  // it means the whole document, because that is what "resize pages" reads as.
  const resizeTargets = useMemo(
    () => (selectedPages.size > 0
      ? Array.from(selectedPages).sort((a, b) => a - b)
      : Array.from({ length: state.pageCount }, (_, i) => i)),
    [selectedPages, state.pageCount],
  );

  /** The document with its pages resized, as bytes ready for Ghostscript. */
  const resizedBytes = useCallback(async (source: Uint8Array, indices: number[]) => {
    const { PDFDocument } = await import('pdf-lib');
    // slice(): pdf.js elsewhere in the editor transfers this buffer to its
    // worker, and a detached one loads as an empty document.
    const doc = await PDFDocument.load(source.slice(), { ignoreEncryption: true });
    resizePagesInDocument(doc, {
      pagePreset,
      customWidthMm: pagePreset === 'custom' ? parseFloat(customWidthMm) : null,
      customHeightMm: pagePreset === 'custom' ? parseFloat(customHeightMm) : null,
      selectedPageIndices: indices,
    });
    return new Uint8Array(await doc.save({ useObjectStreams: true }));
  }, [pagePreset, customWidthMm, customHeightMm]);

  const handleApply = useCallback(async () => {
    setIsProcessing(true);
    setCompressionResult(null);
    try {
      const { tempDir, join } = await import('@tauri-apps/api/path');
      const tmpBase = await tempDir();
      const ts = Date.now();
      const tempInputPath = await join(tmpBase, `papercut_sidebar_${ts}.pdf`);

      const { writeFile, remove } = await import('@tauri-apps/plugin-fs');
      const source = baseline ?? state.pdfBytes;
      setBaseline(source);
      const originalSize = source.byteLength;

      // Resize before compressing, the order processPdf uses: Ghostscript
      // should encode the pages that are actually going to be in the file.
      const toCompress = resizeEnabled
        ? await resizedBytes(source, resizeTargets)
        : source;
      await writeFile(tempInputPath, toCompress);

      const gsResult: ArrayBuffer = await invoke('compress_pdf', {
        sourcePath: tempInputPath,
        preset: resolvedPreset(),
        downsampleImages,
      });

      await remove(tempInputPath).catch(() => {});

      const result = new Uint8Array(gsResult);
      ownResultRef.current = result;
      setPreviewBytes(result);
      setIsProcessing(false);
      setCompressionResult({
        originalSize,
        compressedSize: result.byteLength,
        targetBytes: targetActive ? targetBytes : null,
      });

      updatePdfBytes(result);
      markDirty();
    } catch (err) {
      setIsProcessing(false);
      await apply(() => Promise.reject(err));
    }
  }, [state.pdfBytes, baseline, resolvedPreset, downsampleImages, targetActive, targetBytes,
      resizeEnabled, resizedBytes, resizeTargets, updatePdfBytes, markDirty, apply]);

  const reductionPct = compressionResult
    ? Math.round((1 - compressionResult.compressedSize / compressionResult.originalSize) * 100)
    : null;

  return (
    <div className="space-y-3">
      <PanelHeader toolId="compress-pdf" />

      {/* Saved settings, above the controls they rewrite -- the arrangement the
          standalone tool uses. Renders nothing until something has been saved,
          so a first run is not given a heading over a dead control. */}
      <SavedSettingsRow
        destinations={destinations}
        selectedId={destination?.id ?? null}
        onSelect={applyDestination}
        onRemove={(id) => {
          void removeDestination(id);
          if (destination?.id === id) setDestination(null);
        }}
      />

      {/* Current file size */}
      <div className="rounded bg-muted/30 p-2 flex justify-between text-[10px]">
        <span className="text-muted-foreground">{t('pdfEditor.currentSize')}</span>
        <span className="font-medium">{formatBytes(state.pdfBytes.byteLength)}</span>
      </div>

      {/* Why this file may not shrink — the same wording the standalone tool uses */}
      {nonCompressibleMsg && (
        <div className="rounded border border-amber-500/40 bg-amber-500/10 p-2 text-[10px] leading-relaxed text-foreground/80">
          {nonCompressibleMsg}
        </div>
      )}

      {/* Quality presets */}
      <div className="space-y-1.5">
        <label className="text-[10px] font-medium text-muted-foreground">{t('pdfEditor.qualityPreset')}</label>
        {QUALITY_ZONES.map((p) => (
          <label
            key={p.value}
            className={`flex items-start gap-2 p-1.5 rounded cursor-pointer text-[11px] border ${
              preset === p.value && !useTargetSize ? 'border-primary bg-primary/5' : 'border-transparent hover:bg-muted/50'
            }`}
          >
            <input
              type="radio"
              name="compress-preset"
              value={p.value}
              checked={preset === p.value}
              onChange={() => { setPreset(p.value); setUseTargetSize(false); }}
              className="mt-0.5"
            />
            <div className="min-w-0">
              <div className="font-medium">{zoneLabel(p.value)}</div>
              <div className="text-[10px] text-muted-foreground">{zoneFigure(p.value, p.dpi)}, {zoneDesc(p.value)}</div>
              {estimates && (
                <div data-testid="preset-estimate" className="text-[10px] font-medium text-foreground/80 mt-0.5">
                  ≈ {formatBytes(estimates[p.value])}
                  <span className="text-muted-foreground font-normal">
                    {' · '}
                    {currentSize > 0
                      ? `−${Math.max(0, Math.round((1 - estimates[p.value] / currentSize) * 100))}%`
                      : '0%'}
                  </span>
                </div>
              )}
            </div>
          </label>
        ))}
      </div>

      {/* Target file size — only where a size can actually be aimed at. On a
          text-only or JPEG2000-dominated document no number below the current
          size is reachable, so the field would be a trap; the banner above
          already says why. */}
      {canTargetSize && (
      <div className="space-y-1.5">
        <label className="flex items-center gap-2 text-[11px] cursor-pointer">
          <input
            type="checkbox"
            checked={useTargetSize}
            onChange={(e) => setUseTargetSize(e.target.checked)}
          />
          <span className="font-medium">{t('pdfEditor.targetFileSize')}</span>
        </label>
        {useTargetSize && (
          <div className="flex gap-1.5 items-center">
            <input
              type="number"
              value={targetSizeValue}
              onChange={(e) => setTargetSizeValue(e.target.value)}
              placeholder={floorBytes !== null ? `e.g. ${smallestReachableTarget(floorBytes, unit)}` : 'e.g. 5'}
              title={t('toolSidebar.targetFileSize')}
              min={floorBytes !== null ? smallestReachableTarget(floorBytes, unit) : 1}
              // min-w-0 is load-bearing: a flex item defaults to min-width:auto,
              // and a number input's intrinsic width is wider than the 232px
              // sidebar, so without it the field pushes MB/KB out of view.
              className="flex-1 min-w-0 px-2 py-1 text-xs border rounded bg-background"
            />
            {offerKb ? (
              <select
                data-testid="target-unit"
                value={targetUnit}
                onChange={(e) => setTargetUnit(e.target.value as 'MB' | 'KB')}
                title={t('pdfEditor.sizeUnit')}
                className="flex-none px-1.5 py-1 text-xs border rounded bg-background"
              >
                <option value="MB">MB</option>
                <option value="KB">KB</option>
              </select>
            ) : (
              // A static label, not a dropdown with KB greyed out: a two-option
              // select with one option dead reads as broken and invites clicking.
              // "MB" as plain text states the true thing — this file is measured
              // in megabytes.
              <span
                data-testid="target-unit"
                className="flex-none px-1.5 py-1 text-xs text-muted-foreground"
              >
                MB
              </span>
            )}
          </div>
        )}
        {useTargetSize && floorBytes !== null && (
          targetUnreachable ? (
            <p className="text-[10px] leading-relaxed text-amber-600 dark:text-amber-400">
              {t('toolSidebarPanel.smallestAchievable', { size: formatBytes(floorBytes) })}
            </p>
          ) : (
            // Stated up front rather than only after a rejected value: the floor
            // is known the moment the estimates are, so making the user discover
            // it by failing is a choice, not a limitation.
            <p className="text-[10px] leading-relaxed text-muted-foreground">
              {t('toolSidebarPanel.canCompressToAbout', { size: formatBytes(floorBytes) })}
            </p>
          )
        )}
      </div>
      )}

      {/* Advanced options */}
      <div className="space-y-1.5 border-t pt-2">
        <span className="text-[10px] font-medium text-muted-foreground">{t('pdfEditor.options')}</span>
        {/* Only meaningful when there are images to keep the resolution of.
            Phrased as the thing the user wants, not the mechanism they must
            switch off to get it: the presets bundle resolution reduction with
            JPEG re-encoding, and this is the only way to have the second
            without the first — the right answer for screenshots and line art,
            where downsampling is what makes small text unreadable. */}
        {(analysis?.imageCount ?? 0) > 0 && (
          <>
            <label className="flex items-center gap-2 text-[11px] cursor-pointer">
              <input
                type="checkbox"
                checked={!downsampleImages}
                onChange={(e) => setDownsampleImages(!e.target.checked)}
              />
              {t('pdfEditor.keepImageResolution')}
            </label>
            {!downsampleImages && (
              <p className="text-[10px] text-muted-foreground ps-5 leading-relaxed">
                {t('toolSidebarPanel.imagesStillReEncoded')}
              </p>
            )}
          </>
        )}
      </div>

      {/* Resize pages -- the standalone tool's controls, which this panel never
          had. Its own section rather than an "advanced option": it changes the
          shape of the document, which compression never does. */}
      <div className="space-y-1.5 border-t pt-2">
        <label className="flex cursor-pointer items-center gap-2 text-[11px] font-medium">
          <input
            type="checkbox"
            checked={resizeEnabled}
            onChange={(e) => setResizeEnabled(e.target.checked)}
          />
          {t('configure.resizePages')}
        </label>

        {resizeEnabled && (
          <div className="space-y-1.5 ps-5">
            <div>
              <label className="text-[10px] font-medium text-muted-foreground">
                {t('configure.pageSize')}
              </label>
              <select
                value={pagePreset}
                onChange={(e) => setPagePreset(e.target.value as PdfPagePreset)}
                aria-label={t('configure.pageSize')}
                className="mt-0.5 w-full rounded border bg-background px-2 py-1 text-xs"
              >
                {pageSizePresets().map(({ value, label }) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>

            {pagePreset === 'custom' && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-muted-foreground">{t('configure.widthMm')}</label>
                  <input
                    type="number"
                    value={customWidthMm}
                    onChange={(e) => setCustomWidthMm(e.target.value)}
                    aria-label={t('configure.widthMm')}
                    className="mt-0.5 w-full rounded border bg-background px-2 py-1 text-xs"
                    min={1}
                  />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground">{t('configure.heightMm')}</label>
                  <input
                    type="number"
                    value={customHeightMm}
                    onChange={(e) => setCustomHeightMm(e.target.value)}
                    aria-label={t('configure.heightMm')}
                    className="mt-0.5 w-full rounded border bg-background px-2 py-1 text-xs"
                    min={1}
                  />
                </div>
              </div>
            )}

            {/* Says what Apply will touch. The standalone asks for a page list;
                here the Pages panel already holds a selection, so this reports
                that rather than asking for the same thing twice. */}
            <p className="text-[10px] leading-relaxed text-muted-foreground">
              {selectedPages.size > 0
                ? t('toolSidebarPanel.resizingSelectedPages', { count: selectedPages.size })
                : t('toolSidebarPanel.resizingAllPages', { count: state.pageCount })}
            </p>
          </div>
        )}
      </div>

      {/* Keeping the current controls under a name, below the controls being
          kept. Sits after resize because a saved setting captures that too. */}
      <div className="border-t pt-2">
        <SaveSettingAs onSave={saveCurrentAsDestination} hasSaved={destinations.length > 0} />
      </div>

      {/* Compression result feedback */}
      {compressionResult && (
        <div className="rounded border bg-muted/30 p-2 space-y-1">
          <div className="flex justify-between text-[10px]">
            <span className="text-muted-foreground">{t('imageCompare.original')}</span>
            <span className="font-medium">{formatBytes(compressionResult.originalSize)}</span>
          </div>
          <div className="flex justify-between text-[10px]">
            <span className="text-muted-foreground">{t('pdfEditor.compressed')}</span>
            <span className="font-medium">{formatBytes(compressionResult.compressedSize)}</span>
          </div>
          {compressionResult.targetBytes !== null && (
            <div className="flex justify-between text-[10px] pt-1 border-t">
              <span className="text-muted-foreground">{t('pdfEditor.target')}</span>
              <span
                className={`font-semibold ${
                  compressionResult.compressedSize <= compressionResult.targetBytes
                    ? 'text-green-500'
                    : 'text-amber-500'
                }`}
              >
                {compressionResult.compressedSize <= compressionResult.targetBytes
                  ? t('toolSidebarPanel.targetMet')
                  : t('toolSidebarPanel.targetNotMet', { size: formatBytes(compressionResult.targetBytes) })}
              </span>
            </div>
          )}
          <div className="flex justify-between text-[10px] pt-1 border-t">
            <span className="text-muted-foreground">{t('pdfEditor.reduction')}</span>
            <span className={`font-semibold ${reductionPct! > 0 ? 'text-green-500' : 'text-orange-500'}`}>
              {reductionPct! > 0 ? `−${reductionPct}%` : `+${Math.abs(reductionPct!)}%`}
            </span>
          </div>
        </div>
      )}

      {/* Compression damage lives in image detail — ringing at edges, blocking in
          gradients, softened text. None of that is visible in a 100px page
          thumbnail at any size that fits a 232px sidebar, so the sidebar carries
          the figures and the comparison happens in the canvas, which is large
          and zoomable. */}
      <button
        type="button"
        onClick={() => setCompareMode(state.compareMode === 'off' ? 'floating' : 'off')}
        className="w-full flex items-center justify-center gap-1.5 py-1.5 text-[10px] text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded border border-dashed transition-colors"
      >
        <Expand className="h-3 w-3" />
        {t('pdfEditor.compareFullSize')}
      </button>

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
/**
 * How long turning must be idle before the document is rebuilt.
 *
 * Short enough to feel immediate, long enough that tapping Right four times is
 * one pdf-lib rebuild rather than four.
 */
const TURN_COMMIT_DELAY_MS = 400;

function RotatePanel() {
  diagLog('RotatePanel.render');
  const {
    state,
    updatePdfBytes,
    markDirty,
    selectedPages,
    selectPageRange,
    clearPageSelection,
  } = useEditorContext();
  const [rotation, setRotation] = useState<RotationDegrees | 0>(0);
  const [applyToAll, setApplyToAll] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);

  // Preview: a pure CSS rotation of the already-rendered page, not a real edit.
  // Computing a real rotated preview means loading the document into pdf-lib on
  // every direction change — pdf-lib builds a full mutable object graph of the
  // whole document and never yields to the event loop while doing it, which
  // measured over two minutes with no sign of finishing on a real
  // 30MB/688-page/1300+-image PDF, freezing the app solid.
  // The "After" thumbnail is the same unrotated render as "Before"; only Apply
  // (an explicit, one-time action) does the real pdf-lib rotation.
  const previewBytes = rotation !== 0 ? state.pdfBytes : null;
  const isProcessing = false;

  // Which pages Apply will actually rotate. A selection in the Pages panel is
  // what the user pointed at, so it wins over the scroll position; without this
  // a multi-page selection silently rotated only the current page.
  const targetPages = useMemo(() => {
    if (applyToAll) return Array.from({ length: state.pageCount }, (_, i) => i);
    if (selectedPages.size > 0) return Array.from(selectedPages).sort((a, b) => a - b);
    return [state.currentPage];
  }, [applyToAll, selectedPages, state.pageCount, state.currentPage]);

  // Keep the Pages panel honest about what "Apply to all pages" means: ticking
  // it highlights every page, unticking releases them again.
  const handleApplyToAllChange = useCallback(
    (checked: boolean) => {
      setApplyToAll(checked);
      if (checked) selectPageRange(0, state.pageCount - 1);
      else clearPageSelection();
    },
    [selectPageRange, clearPageSelection, state.pageCount],
  );

  // Commit the accumulated turn to the document.
  //
  // There is no Apply button: turning a page should just turn it. The button
  // was also a trap — it disabled itself whenever the pending rotation was 0,
  // so turning a full circle back to where you started left a control that
  // looked broken.
  //
  // What the button did buy was batching, and that still matters: pdf-lib
  // rebuilds the whole document and never yields, which measured over two
  // minutes on a real 30MB/688-page PDF. So the commit is debounced rather
  // than fired per click. Four quick taps are one rebuild, not four.
  const commitRotation = useCallback(async (delta: RotationDegrees) => {
    setIsApplying(true);
    setApplyError(null);
    diagLog(`rotate.commit.start deg=${delta}`);
    const t0 = performance.now();
    try {
      const result = await rotatePdf(
        state.pdfBytes,
        targetPages.map((idx) => ({ pageIndex: idx, rotation: delta })),
      );
      diagLog(`rotate.commit.done ms=${(performance.now() - t0).toFixed(0)}`);
      updatePdfBytes(result.bytes);
      markDirty();
      // Consumed: the bytes now carry it, so the pending delta returns to zero
      // and the CSS preview stops double-counting what the page already shows.
      setRotation(0);
    } catch (err) {
      diagLog(`rotate.commit.threw ms=${(performance.now() - t0).toFixed(0)} ${err}`);
      setApplyError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsApplying(false);
    }
  }, [targetPages, state.pdfBytes, updatePdfBytes, markDirty]);

  // Turning is instant on screen (a CSS transform on the already-rendered
  // page); the document itself catches up once the turning stops. Each new
  // click clears the previous timer, so a burst commits once.
  useEffect(() => {
    if (rotation === 0 || isApplying) return;
    const id = setTimeout(() => { void commitRotation(rotation); }, TURN_COMMIT_DELAY_MS);
    return () => clearTimeout(id);
  }, [rotation, isApplying, commitRotation]);

  return (
    <div className="space-y-3">
      <PanelHeader toolId="rotate-pdf" />

      <div className="space-y-1.5">
        <label className="text-[10px] font-medium text-muted-foreground">{t('pdfEditor.direction')}</label>
        {/* Two relative turns, matching the standalone Rotate PDF step. The
            engine applies deltas, so accumulating quarter turns is the only
            control that says what it does: two rights are a half turn, and a
            left undoes a right. */}
        <div className="grid grid-cols-2 gap-1">
          <button
            type="button"
            onClick={() => { const next = turnBy(rotation, 'left'); diagLog(`rotate.turn left -> ${next}`); setRotation(next); }}
            title={t('rotate.rotateSelectedPagesLeft')}
            className="flex items-center justify-center gap-1.5 py-1.5 px-2 text-[11px] rounded border border-border hover:bg-muted/50 transition-colors"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>{t('rotate.left')}</span>
          </button>
          <button
            type="button"
            onClick={() => { const next = turnBy(rotation, 'right'); diagLog(`rotate.turn right -> ${next}`); setRotation(next); }}
            title={t('rotate.rotateSelectedPagesRight')}
            className="flex items-center justify-center gap-1.5 py-1.5 px-2 text-[11px] rounded border border-border hover:bg-muted/50 transition-colors"
          >
            <RotateCw className="h-3.5 w-3.5" />
            <span>{t('rotate.right')}</span>
          </button>
        </div>
        {/* Without this the second click has no visible effect, and the user
            cannot tell a half turn from a quarter one. */}
        <p className="text-[10px] text-muted-foreground" data-testid="pending-rotation">
          {isApplying
            ? t('toolSidebarPanel.turningPages')
            : rotation === 0
              ? t('toolSidebarPanel.noTurnYet')
              : t('toolSidebarPanel.willTurnBy', { degrees: rotation })}
        </p>
      </div>

      <label className="flex items-center gap-2 text-[11px] cursor-pointer">
        <input
          type="checkbox"
          checked={applyToAll}
          onChange={(e) => handleApplyToAllChange(e.target.checked)}
        />
        {t('pdfEditor.applyToAllPages')}
      </label>

      <p className="text-[10px] text-muted-foreground">
        {applyToAll
          ? t('toolSidebarPanel.rotatingAllPages', { count: state.pageCount })
          : targetPages.length > 1
            ? t('toolSidebarPanel.rotatingSelectedPages', { count: targetPages.length })
            : t('toolSidebarPanel.rotatingPage', { page: targetPages[0] + 1 })}
      </p>

      <ToolSidebarPreview
        originalBytes={state.pdfBytes}
        previewBytes={previewBytes}
        isProcessing={isProcessing}
        previewPageIndex={state.currentPage}
        afterImageStyle={rotation !== 0 ? { transform: `rotate(${rotation}deg)` } : undefined}
      />

      {applyError && (
        <p className="text-[10px] text-destructive" role="alert">{applyError}</p>
      )}
    </div>
  );
}

// ── Watermark Panel ──────────────────────────────────────────────────

function WatermarkPanel() {
  const { state, updatePdfBytes, markDirty, setWatermarkDraft } = useEditorContext();

  // The draft lives in context so the canvas can draw it and the user can drag
  // it. This panel and the overlay are two views of one value, which is why
  // neither can fall out of step with the other.
  const options = state.watermarkDraft ?? DEFAULT_WATERMARK_OPTIONS;

  // Read through a ref, not the closure: setOptions must stay stable for the
  // preview's dependency list, and a stale capture would silently undo a drag
  // the moment a sidebar field changed.
  const draftRef = useRef(state.watermarkDraft);
  draftRef.current = state.watermarkDraft;

  const setOptions = useCallback(
    (update: (previous: WatermarkOptions) => WatermarkOptions) => {
      setWatermarkDraft(update(draftRef.current ?? DEFAULT_WATERMARK_OPTIONS));
    },
    [setWatermarkDraft],
  );

  // Opening the tool starts a draft; leaving it takes the overlay off the
  // canvas. Null doing double duty means there is no second flag to forget.
  useEffect(() => {
    setWatermarkDraft({ ...DEFAULT_WATERMARK_OPTIONS });
    return () => setWatermarkDraft(null);
  }, [setWatermarkDraft]);

  const [isApplying, setIsApplying] = useState(false);
  const [applySuccess, setApplySuccess] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);

  // Preview: only process the current page for fast before/after comparison.
  // Avoids buffering all pages on every option change, which freezes the UI
  // for large documents (hundreds of pages).
  const runPreview = useCallback(async (bytes: Uint8Array) => {
    if (!options.text.trim()) return bytes;
    return addWatermarkSinglePage(bytes, options, state.currentPage);
  }, [options, state.currentPage]);

  const { previewBytes, isProcessing } = useDebouncedPreview(
    state.pdfBytes,
    runPreview,
    [options.text, options.fontSize, options.opacity, options.rotation, options.color,
     options.centerX, options.centerY, state.currentPage],
  );

  // Apply watermark to ALL pages (full processing, runs only on explicit user action).
  const handleApply = useCallback(async () => {
    if (!options.text.trim()) return;
    setIsApplying(true);
    setApplyError(null);
    setApplySuccess(false);
    try {
      const result = await addWatermark(state.pdfBytes, options);
      updatePdfBytes(result);
      markDirty();
      // The watermark is in the document now. Leaving the draft alive would
      // draw a live overlay on top of the one just baked in, showing two where
      // the user will get one -- and inviting a second Apply that really would
      // stack them.
      setWatermarkDraft(null);
      setApplySuccess(true);
      setTimeout(() => setApplySuccess(false), 2000);
    } catch (err) {
      setApplyError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsApplying(false);
    }
  }, [options, state.pdfBytes, updatePdfBytes, markDirty, setWatermarkDraft]);

  return (
    <div className="space-y-3">
      <PanelHeader toolId="watermark" />

      <div className="space-y-2">
        <div>
          <label className="text-[10px] font-medium text-muted-foreground">{t('watermark.text')}</label>
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
            <label className="text-[10px] font-medium text-muted-foreground">{t('common.fontSize')}</label>
            <input
              type="number"
              value={options.fontSize}
              onChange={(e) => setOptions((o) => ({ ...o, fontSize: Number(e.target.value) || 12 }))}
              className="w-full mt-0.5 px-2 py-1 text-xs border rounded bg-background"
              min={WATERMARK_FONT_SIZE_MIN}
              max={WATERMARK_FONT_SIZE_MAX}
            />
          </div>
          <div>
            <label className="text-[10px] font-medium text-muted-foreground">{t('rotateImage.rotation')}</label>
            <div className="flex items-center gap-1 mt-0.5">
              <button
                type="button"
                onClick={() => setOptions((o) => ({ ...o, rotation: turnWatermarkBy(o.rotation, 'left') }))}
                title={t('toolSidebarPanel.turnLeft')}
                aria-label={t('toolSidebarPanel.turnLeft')}
                className="px-1.5 py-1 border rounded bg-background hover:bg-accent"
              >
                <RotateCcw className="w-3 h-3" />
              </button>
              <span
                data-testid="watermark-rotation-value"
                className="flex-1 text-center text-xs tabular-nums"
              >
                {options.rotation}°
              </span>
              <button
                type="button"
                onClick={() => setOptions((o) => ({ ...o, rotation: turnWatermarkBy(o.rotation, 'right') }))}
                title={t('toolSidebarPanel.turnRight')}
                aria-label={t('toolSidebarPanel.turnRight')}
                className="px-1.5 py-1 border rounded bg-background hover:bg-accent"
              >
                <RotateCw className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>

        <div>
          <label className="text-[10px] font-medium text-muted-foreground">
            {t('toolSidebarPanel.opacity', { percent: Math.round(options.opacity * 100) })}
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
          <label className="text-[10px] font-medium text-muted-foreground">{t('watermark.color')}</label>
          <div className="mt-1">
            <ColorPicker
              value={options.color}
              onChange={(hex) => setOptions((o) => ({ ...o, color: hex }))}
            />
          </div>
        </div>
      </div>

      {/* previewPageIndex=0 because addWatermarkSinglePage returns a 1-page PDF where
          the current page is always at index 0. When text is empty runPreview returns
          the original full-document bytes, so we fall back to undefined (= state.currentPage)
          to keep before/after showing the same page. */}
      <ToolSidebarPreview
        originalBytes={state.pdfBytes}
        previewBytes={previewBytes}
        isProcessing={isProcessing}
        previewPageIndex={options.text.trim() ? 0 : undefined}
      />

      <ApplyButton
        onClick={handleApply}
        disabled={!options.text.trim()}
        isApplying={isApplying}
        success={applySuccess}
        error={applyError}
      />
    </div>
  );
}

// ── Page Numbers Panel ───────────────────────────────────────────────

function PageNumbersPanel() {
  const { state, applyPageNumbers, removePageNumbers } = useEditorContext();
  const [options, setOptions] = useState<PageNumberOptions>({
    position: 'bottom-center',
    format: 'numeric',
    fontSize: 12,
    startNumber: 1,
    margin: 30,
    color: DEFAULT_TEXT_COLOR,
  });

  // Everything derives from the bytes as they were before numbering. Once numbers
  // are applied, state.pdfBytes already carries them -- deriving from that would
  // show, and then bake in, a second overlapping set.
  const baseBytes = state.pageNumberBase ?? state.pdfBytes;
  const hasApplied = state.pageNumberBase !== null;
  const [isApplying, setIsApplying] = useState(false);
  const [applySuccess, setApplySuccess] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);

  // Preview: only process the current page for fast before/after comparison.
  // Avoids buffering all pages on every option change, which freezes the UI
  // for large documents (hundreds of pages) — see addPageNumbersSinglePage.
  const runPreview = useCallback(async (bytes: Uint8Array) => {
    return addPageNumbersSinglePage(bytes, options, state.currentPage);
  }, [options, state.currentPage]);

  const { previewBytes, isProcessing } = useDebouncedPreview(
    baseBytes,
    runPreview,
    [options.position, options.format, options.fontSize, options.startNumber, options.margin, options.color, state.currentPage],
  );

  // Apply page numbers to ALL pages (full processing, runs only on explicit user action).
  const handleApply = useCallback(async () => {
    setIsApplying(true);
    setApplyError(null);
    setApplySuccess(false);
    try {
      const result = await addPageNumbers(baseBytes, options);
      applyPageNumbers(baseBytes, result);
      setApplySuccess(true);
      setTimeout(() => setApplySuccess(false), 2000);
    } catch (err) {
      setApplyError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsApplying(false);
    }
  }, [options, baseBytes, applyPageNumbers]);

  return (
    <div className="space-y-3">
      <PanelHeader toolId="page-numbers" />

      <div className="space-y-2">
        <div>
          <label className="text-[10px] font-medium text-muted-foreground">{t('pageNumbers.position')}</label>
          <select
            value={options.position}
            onChange={(e) => setOptions((o) => ({ ...o, position: e.target.value as NumberPosition }))}
            className="w-full mt-0.5 px-2 py-1 text-xs border rounded bg-background"
          >
            <option value="bottom-center">{t('pdfEditor.bottomCenter')}</option>
            <option value="bottom-left">{t('pdfEditor.bottomLeft')}</option>
            <option value="bottom-right">{t('pdfEditor.bottomRight')}</option>
            <option value="top-center">{t('pdfEditor.topCenter')}</option>
            <option value="top-left">{t('pdfEditor.topLeft')}</option>
            <option value="top-right">{t('pdfEditor.topRight')}</option>
          </select>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] font-medium text-muted-foreground">{t('pageNumbers.format')}</label>
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
            <label className="text-[10px] font-medium text-muted-foreground">{t('pdfEditor.startAt')}</label>
            <NumberField
              aria-label={t('pdfEditor.startAt')}
              value={options.startNumber}
              onChange={(n) => setOptions((o) => ({ ...o, startNumber: n }))}
              className="w-full mt-0.5 px-2 py-1 text-xs border rounded bg-background"
              min={1}
            />
          </div>
        </div>

        <div>
          <label className="text-[10px] font-medium text-muted-foreground">{t('common.fontSize')}</label>
          <NumberField
            aria-label={t('common.fontSize')}
            value={options.fontSize}
            onChange={(n) => setOptions((o) => ({ ...o, fontSize: n }))}
            className="w-full mt-0.5 px-2 py-1 text-xs border rounded bg-background"
            min={6}
            max={48}
          />
        </div>

        <div>
          <label className="text-[10px] font-medium text-muted-foreground">{t('pageNumbers.colour')}</label>
          <div className="mt-0.5">
            <ColorPicker
              value={options.color ?? DEFAULT_TEXT_COLOR}
              onChange={(hex) => setOptions((o) => ({ ...o, color: hex }))}
            />
          </div>
        </div>
      </div>

      <ToolSidebarPreview
        originalBytes={baseBytes}
        previewBytes={previewBytes}
        isProcessing={isProcessing}
        previewPageIndex={0}
      />

      <ApplyButton
        onClick={handleApply}
        disabled={!previewBytes}
        isApplying={isApplying}
        success={applySuccess}
        error={applyError}
      />

      {hasApplied && (
        <button
          type="button"
          onClick={removePageNumbers}
          className="w-full px-2 py-1 text-xs rounded border border-border text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        >
          {t('pdfEditor.removePageNumbers')}
        </button>
      )}
    </div>
  );
}

/**
 * A number input that can actually be emptied while the user retypes it.
 *
 * The obvious spelling — `value={n}` with `Number(e.target.value) || fallback`
 * — cannot be cleared: an empty field parses to `Number('') === 0`, which is
 * falsy, so it snaps straight back to the fallback. Typing `0` hits the same
 * trap. Holding the text locally lets the field be empty mid-edit while the
 * committed value stays a number, and an empty or unparseable field falls back
 * to the last good value on blur.
 */
function NumberField({
  value,
  onChange,
  min,
  max,
  className,
  'aria-label': ariaLabel,
}: {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  className?: string;
  'aria-label'?: string;
}) {
  const [text, setText] = useState(String(value));

  // Follow programmatic changes without overwriting what is being typed.
  useEffect(() => {
    setText((prev) => (Number(prev) === value ? prev : String(value)));
  }, [value]);

  return (
    <input
      type="number"
      aria-label={ariaLabel}
      value={text}
      min={min}
      max={max}
      className={className}
      onChange={(e) => {
        const next = e.target.value;
        setText(next);
        if (next === '') return; // mid-edit; keep the last committed value
        const parsed = Number(next);
        if (Number.isFinite(parsed)) onChange(parsed);
      }}
      onBlur={() => {
        const parsed = Number(text);
        if (text === '' || !Number.isFinite(parsed)) {
          setText(String(value));
          return;
        }
        const clamped = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, parsed));
        if (clamped !== parsed) onChange(clamped);
        setText(String(clamped));
      }}
    />
  );
}

// ── Crop Panel ───────────────────────────────────────────────────────

function CropPanel() {
  const { state, updatePdfBytes, markDirty } = useEditorContext();
  const [margins, setMargins] = useState({ top: 10, bottom: 10, left: 10, right: 10 });
  const [linked, setLinked] = useState(true);
  const [isApplying, setIsApplying] = useState(false);
  const [applySuccess, setApplySuccess] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);

  const handleMarginChange = useCallback((side: 'top' | 'bottom' | 'left' | 'right', value: number) => {
    if (linked) {
      setMargins({ top: value, bottom: value, left: value, right: value });
    } else {
      setMargins((m) => ({ ...m, [side]: value }));
    }
  }, [linked]);

  // Preview: only process the current page for fast before/after comparison.
  // Avoids buffering all pages on every margin change, which freezes the UI
  // for large documents (hundreds of pages) — see cropPdfSinglePage.
  const runPreview = useCallback(async (bytes: Uint8Array) => {
    const cropMargins: CropMargins = {
      top: mmToPoints(margins.top),
      bottom: mmToPoints(margins.bottom),
      left: mmToPoints(margins.left),
      right: mmToPoints(margins.right),
    };
    return cropPdfSinglePage(bytes, cropMargins, state.currentPage);
  }, [margins, state.currentPage]);

  const { previewBytes, isProcessing } = useDebouncedPreview(
    state.pdfBytes,
    runPreview,
    [margins.top, margins.bottom, margins.left, margins.right, state.currentPage],
  );

  // Apply crop to the full document (full processing, runs only on explicit
  // user action).
  const handleApply = useCallback(async () => {
    setIsApplying(true);
    setApplyError(null);
    setApplySuccess(false);
    try {
      const cropMargins: CropMargins = {
        top: mmToPoints(margins.top),
        bottom: mmToPoints(margins.bottom),
        left: mmToPoints(margins.left),
        right: mmToPoints(margins.right),
      };
      const result = await cropPdf(state.pdfBytes, cropMargins);
      updatePdfBytes(result);
      markDirty();
      setApplySuccess(true);
      setTimeout(() => setApplySuccess(false), 2000);
    } catch (err) {
      setApplyError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsApplying(false);
    }
  }, [margins, state.pdfBytes, updatePdfBytes, markDirty]);

  return (
    <div className="space-y-3">
      <PanelHeader toolId="crop-pdf" />

      <div className="space-y-2">
        {/* The presets the standalone tool has always offered. Per-side numbers
            were here already, so the panel could do more than the tool and still
            felt like less: reaching a plain 10mm border meant typing 10 four
            times. */}
        <div className="space-y-1">
          <label className="text-[10px] font-medium text-muted-foreground">{t('imageConfigure.presets')}</label>
          <div className="flex gap-1">
            {cropMarginPresets().map((preset) => {
              const chosen = (['top', 'bottom', 'left', 'right'] as const).every((side) => margins[side] === preset.mm);
              return (
                <button
                  key={preset.label}
                  type="button"
                  data-testid="editor-crop-preset"
                  onClick={() => setMargins({ top: preset.mm, bottom: preset.mm, left: preset.mm, right: preset.mm })}
                  className={cn(
                    'flex-1 rounded-md border px-1.5 py-1 text-[10px] font-medium transition-colors',
                    chosen
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border text-muted-foreground hover:bg-accent',
                  )}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-between">
          <label className="text-[10px] font-medium text-muted-foreground">{t('convertDoc.marginsMm')}</label>
          <label className="flex items-center gap-1 text-[10px] cursor-pointer">
            <input
              type="checkbox"
              checked={linked}
              onChange={(e) => setLinked(e.target.checked)}
              className="rounded"
            />
            <span className="text-muted-foreground">{t('pdfEditor.allEqual')}</span>
          </label>
        </div>

        {linked ? (
          <div>
            <label className="text-[10px] text-muted-foreground">{t('pdfEditor.allSides')}</label>
            <input
              type="number"
              value={margins.top}
              onChange={(e) => handleMarginChange('top', Number(e.target.value) || 0)}
              className="w-full mt-0.5 px-2 py-1 text-xs border rounded bg-background"
              min={0}
              max={100}
              title={t('pdfEditor.allMarginsMm')}
            />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {(['top', 'bottom', 'left', 'right'] as const).map((side) => (
              <div key={side}>
                <label className="text-[10px] text-muted-foreground">{sideLabel(side)}</label>
                <input
                  type="number"
                  value={margins[side]}
                  onChange={(e) => handleMarginChange(side, Number(e.target.value) || 0)}
                  className="w-full mt-0.5 px-2 py-1 text-xs border rounded bg-background"
                  min={0}
                  max={100}
                  title={t('toolSidebarPanel.marginMm', { side: sideLabel(side) })}
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
        previewPageIndex={0}
      />

      <ApplyButton
        onClick={handleApply}
        disabled={!previewBytes}
        isApplying={isApplying}
        success={applySuccess}
        error={applyError}
      />
    </div>
  );
}

// ── Sign Panel (placeholder) ─────────────────────────────────────────

/** Handwriting-style fonts for typed signatures */
// Script uses the OFL font bundled with the app rather than 'Brush Script MT',
// which only exists on machines that happen to have it. Canvas falls back
// silently for a font it cannot find, so naming a system face would put a plain
// signature on the page anywhere it is missing -- the same failure, moved to
// other people's computers.
const SIGNATURE_FONTS = [
  { value: 'cursive', css: "'Dancing Script', 'Brush Script MT', cursive" },
  { value: 'serif', css: "'Georgia', 'Times New Roman', serif" },
  { value: 'sans', css: "'Helvetica Neue', Arial, sans-serif" },
] as const;

type SignatureFontValue = (typeof SIGNATURE_FONTS)[number]['value'];

function signatureFontLabel(value: SignatureFontValue): string {
  const labels = {
    cursive: t('toolSidebarPanel.script'),
    serif: t('signatureTyped.formal'),
    sans: t('toolSidebarPanel.clean'),
  };
  return labels[value];
}

/**
 * The three ways to make a signature, in the order Sign PDF lists them.
 *
 * A function would be needed for translated labels; these are keys, resolved at
 * render, for the reason PRESETS in SignatureBackground gives.
 */
const SIGNATURE_TABS = [
  { id: 'draw', key: 'signatureCreateStep.draw' },
  { id: 'type', key: 'signatureCreateStep.type' },
  { id: 'upload', key: 'signatureCreateStep.upload' },
] as const;

// Saved signatures live in the shared store, the same one Sign PDF reads.
//
// This panel used to keep its own list in localStorage under
// 'papercut_saved_signatures' -- which is the very key useSavedSignatures
// migrates out of and then deletes. So a signature saved here survived only
// until the next time Sign PDF was opened, and one saved there was never
// visible here at all. Reported as "signature should have same saved
// signatures also by edit -> signature and vice versa".
//
// The shared list holds an image rather than a recipe, so it can carry drawn
// and uploaded signatures too, which the old recipe list could not represent.

function SignPanel() {
  const { state, addImageBlock, deleteImageBlock, markDirty } = useEditorContext();
  const [placeError, setPlaceError] = useState<string | null>(null);

  const [sigText, setSigText] = useState('');
  const [sigFont, setSigFont] = useState<SignatureFontValue>(SIGNATURE_FONTS[0].value);
  const [sigColor, setSigColor] = useState('#1A365D');
  const [sigSize, setSigSize] = useState(24);
  // What sits behind the signature on the page. The editor renders the document
  // to a canvas, so the colour can be taken off the page rather than guessed.
  const [sigBackground, setSigBackground] = useState<SignatureBg>(null);
  const { signatures: savedSignatures, saveSignature, deleteSignature } = useSavedSignatures();
  // Draw and Upload were only ever in Sign PDF, so a signature made with a
  // stylus or scanned from paper could not be used in the editor at all --
  // and, before the shared store, could not even be seen here.
  const [sigTab, setSigTab] = useState<'draw' | 'type' | 'upload'>('type');
  // Which pages a signature goes on. Sign PDF has offered this since it
  // shipped; this panel could only ever stamp the page you were looking at,
  // so signing a contract meant placing it once per page by hand.
  const [applyTo, setApplyTo] = useState<'current' | 'all' | 'custom'>('current');
  const [customRange, setCustomRange] = useState('');
  // What Draw or Upload produced, waiting to be placed or saved.
  const [pendingDataUrl, setPendingDataUrl] = useState<string | null>(null);
  const [showSaved, setShowSaved] = useState(false);

  const selectedFontCss = SIGNATURE_FONTS.find(f => f.value === sigFont)?.css ?? 'cursive';

  /**
   * Puts a signature image on the current page as a draggable stamp.
   *
   * Not as PDF text: pdf-lib embeds only the 14 standard fonts, none of them a
   * script face, so a Script signature used to be silently swapped for italic
   * Helvetica while the panel went on showing a script preview over it.
   *
   * Each stamp is offset from the last one on that page. Every placement used
   * to land on exactly the same point, so pressing the button twice stacked an
   * identical copy in the identical spot -- reported as "it copy and paste the
   * signature and suddenly I have many signatures of same one". Offsetting
   * makes a second copy visible, and therefore removable.
   */
  /** The pages a Place will stamp. */
  const signatureTargets = useMemo(() => {
    if (applyTo === 'all') return Array.from({ length: state.pageCount }, (_, i) => i);
    if (applyTo === 'custom') {
      const parsed = parsePageRange(customRange, state.pageCount);
      // An empty or unreadable range means the page in front of you rather than
      // nothing at all, so pressing Place never silently does nothing.
      return parsed.length > 0 ? parsed : [state.currentPage];
    }
    return [state.currentPage];
  }, [applyTo, customRange, state.pageCount, state.currentPage]);

  /** Every stamp on the document, so they can be counted and cleared. */
  const placedStamps = useMemo(
    () => state.pages.flatMap((p, i) => p.imageBlocks.map((b) => ({ pageIndex: i, id: b.id }))),
    [state.pages],
  );

  /**
   * Takes every placed signature off the document.
   *
   * The panel's only visible delete removed a *saved* signature, and the one on
   * the stamp itself appears only once it has been clicked, so a signature put
   * on the wrong page looked permanent -- reported exactly that way. Clearing
   * one at a time is also no answer once Place can stamp every page.
   */
  const handleRemovePlaced = useCallback(() => {
    for (const { pageIndex, id } of placedStamps) deleteImageBlock(pageIndex, id);
    if (placedStamps.length > 0) markDirty();
  }, [placedStamps, deleteImageBlock, markDirty]);

  const placeSignatureImage = useCallback(async (dataUrl: string, background: SignatureBg) => {
    const composited = background ? await applySignatureBackground(dataUrl, background) : dataUrl;
    const bytes = dataUrlToBytes(composited);

    // The stored image carries no size of its own, so the height comes from the
    // size control and the width follows the image's proportions.
    const dims = await new Promise<{ w: number; h: number } | null>((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = () => resolve(null);
      img.src = composited;
    });
    if (!dims) {
      setPlaceError(t('toolSidebarPanel.couldNotDrawTheSignature'));
      return;
    }
    setPlaceError(null);

    const { width, height } = signatureBlockSize(dims.w, dims.h, sigSize);

    for (const target of signatureTargets) {
      // Stepped per page from what that page already carries, so signing every
      // page twice does not hide the second stamp under the first.
      const { x, y } = nextStampPosition(state.pages[target]?.imageBlocks.length ?? 0);
      addImageBlock(target, {
        id: crypto.randomUUID(),
        pageIndex: target,
        x,
        y,
        width,
        height,
        // The same array on every page, deliberately: applyAllEdits embeds an
        // image once per distinct buffer, so signing 438 pages costs one copy
        // in the file rather than 438.
        imageBytes: bytes,
        rotation: 0,
        flipH: false,
        flipV: false,
        isNew: true,
      });
    }
    markDirty();
  }, [signatureTargets, state.pages, sigSize, addImageBlock, markDirty]);

  /** Whether there is a signature to place at all, on whichever tab is open. */
  const canPlace = sigTab === 'type' ? sigText.trim().length > 0 : pendingDataUrl !== null;

  /** Draws what is typed in the panel, then places it. */
  const handlePlaceTyped = useCallback(async () => {
    if (!sigText.trim()) return;
    const dataUrl = await rasteriseSignatureDataUrl(sigText, selectedFontCss, sigSize, sigColor);
    if (!dataUrl) {
      setPlaceError(t('toolSidebarPanel.couldNotDrawTheSignature'));
      return;
    }
    await placeSignatureImage(dataUrl, sigBackground);
  }, [sigText, selectedFontCss, sigSize, sigColor, sigBackground, placeSignatureImage]);

  // Saved as the image, not as text-plus-font. The shared list is what Sign PDF
  // shows, and it has to be able to hold a drawn or uploaded signature too --
  // neither of which a recipe can describe.
  const handleSaveSignature = useCallback(async () => {
    if (!sigText.trim()) return;
    const dataUrl = await rasteriseSignatureDataUrl(sigText, selectedFontCss, sigSize, sigColor);
    if (!dataUrl) {
      setPlaceError(t('toolSidebarPanel.couldNotDrawTheSignature'));
      return;
    }
    setPlaceError(null);
    await saveSignature({
      name: sigText.trim(),
      type: 'typed',
      dataUrl,
      background: sigBackground,
    });
  }, [sigText, selectedFontCss, sigSize, sigColor, sigBackground, saveSignature]);

  /** Place whatever the open tab produced. */
  const handlePlace = useCallback(() => {
    if (sigTab === 'type') return void handlePlaceTyped();
    if (pendingDataUrl) return void placeSignatureImage(pendingDataUrl, sigBackground);
  }, [sigTab, pendingDataUrl, sigBackground, handlePlaceTyped, placeSignatureImage]);

  /** Save whatever the open tab produced, into the list both tools read. */
  const handleSave = useCallback(async () => {
    if (sigTab === 'type') return handleSaveSignature();
    if (!pendingDataUrl) return;
    await saveSignature({
      // Drawn and uploaded signatures have no text to name themselves with, so
      // they get the numbered name Sign PDF offers for the same reason.
      name: t('signatureCreateStep.signatureN', { n: savedSignatures.length + 1 }),
      type: sigTab === 'draw' ? 'drawn' : 'uploaded',
      dataUrl: pendingDataUrl,
      background: sigBackground,
    });
  }, [sigTab, pendingDataUrl, sigBackground, savedSignatures.length, saveSignature, handleSaveSignature]);

  return (
    <div className="space-y-3">
      <PanelHeader toolId="sign-pdf" />

      {/* The same three ways to make a signature that Sign PDF offers. */}
      <div className="flex gap-1">
        {SIGNATURE_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => { setSigTab(tab.id); setPendingDataUrl(null); }}
            className={`flex-1 rounded border py-1 text-[10px] transition-colors ${
              sigTab === tab.id
                ? 'border-primary bg-primary/10 font-medium'
                : 'border-border hover:bg-muted/50'
            }`}
          >
            {t(tab.key)}
          </button>
        ))}
      </div>

      {sigTab === 'draw' && (
        <SignatureCanvas
          color={sigColor}
          onComplete={setPendingDataUrl}
          onClear={() => setPendingDataUrl(null)}
        />
      )}

      {sigTab === 'upload' && <SignatureUpload onComplete={setPendingDataUrl} />}

      {/* Type signature */}
      {sigTab === 'type' && (
      <div className="space-y-2">
        <label className="text-[10px] font-medium text-muted-foreground">{t('pdfEditor.typeYourSignature')}</label>
        <input
          type="text"
          value={sigText}
          onChange={(e) => setSigText(e.target.value)}
          placeholder={t('pdfEditor.yourName')}
          title={t('pdfEditor.signatureText')}
          className="w-full px-2 py-1.5 text-sm border rounded bg-background"
          style={{ fontFamily: selectedFontCss, fontStyle: sigFont === 'cursive' ? 'italic' : 'normal' }}
        />

        {/* Live preview.
            The panel was hardcoded to bg-white, so a chosen background never
            appeared here and picking one looked like it had done nothing --
            reported as the colour picker not working in this panel. The colour
            was being stored and stamped correctly all along; there was simply
            nothing on screen that showed it. */}
        {sigText && (
          <div
            className="rounded border p-3 text-center overflow-hidden"
            style={{ background: sigBackground ?? '#ffffff' }}
          >
            <span
              style={{
                fontFamily: selectedFontCss,
                fontSize: `${Math.min(sigSize, 28)}px`,
                color: sigColor,
                fontStyle: sigFont === 'cursive' ? 'italic' : 'normal',
              }}
            >
              {sigText}
            </span>
          </div>
        )}

        {/* Font style */}
        <div>
          <label className="text-[10px] font-medium text-muted-foreground">{t('common.style')}</label>
          <div className="flex gap-1 mt-0.5">
            {SIGNATURE_FONTS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setSigFont(f.value)}
                className={`flex-1 py-1 text-[10px] rounded border transition-colors ${
                  sigFont === f.value ? 'border-primary bg-primary/10 font-medium' : 'border-border hover:bg-muted/50'
                }`}
              >
                {signatureFontLabel(f.value)}
              </button>
            ))}
          </div>
        </div>

        {/* Color + Size */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] font-medium text-muted-foreground">{t('watermark.color')}</label>
            <div className="mt-1">
              <ColorPicker value={sigColor} onChange={setSigColor} />
            </div>
          </div>
          <div>
            <label className="text-[10px] font-medium text-muted-foreground">{t('common.size')}</label>
            <input
              type="number"
              value={sigSize}
              onChange={(e) => setSigSize(Math.max(12, Math.min(48, Number(e.target.value) || 24)))}
              title={t('pdfEditor.signatureFontSize')}
              className="w-full mt-0.5 px-2 py-1 text-xs border rounded bg-background"
              min={12}
              max={48}
            />
          </div>
        </div>

      </div>
      )}

      {/* Outside the tabs: what sits behind the signature applies to a drawn or
          uploaded one just as much as a typed one. */}
      <SignatureBackground value={sigBackground} onChange={setSigBackground} />

      {/* Which pages, in the standalone tool's own words. This panel could only
          stamp the page you were looking at, so signing a contract meant
          placing it once per page by hand. */}
      <div className="space-y-1.5 border-t pt-2">
        <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {t('signPdf.applyTo')}
        </span>
        {([
          ['current', 'signPdf.currentPageOnly'],
          ['all', 'signPdf.allPages'],
          ['custom', 'signPdf.customRange'],
        ] as const).map(([value, key]) => (
          <label key={value} className="flex cursor-pointer items-center gap-2 text-[11px]">
            <input
              type="radio"
              name="sig-apply-to"
              checked={applyTo === value}
              onChange={() => setApplyTo(value)}
            />
            {t(key)}
          </label>
        ))}
        {applyTo === 'custom' && (
          <input
            type="text"
            value={customRange}
            onChange={(e) => setCustomRange(e.target.value)}
            placeholder="1-3, 5"
            // Not "Custom range": that is the radio's name, and two controls
            // in one panel sharing an accessible name cannot be told apart by
            // anyone reading them, by eye or by screen reader. The same
            // collision the signature swatches had.
            aria-label={t('signPdf.pageSelector')}
            className="w-full rounded border bg-background px-2 py-1 text-xs"
          />
        )}
        {signatureTargets.length > 1 && (
          <p className="text-[10px] leading-relaxed text-muted-foreground">
            {t('toolSidebarPanel.signingNPages', { count: signatureTargets.length })}
          </p>
        )}
      </div>

      {/* Place + Save buttons */}
      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={handlePlace}
          disabled={!canPlace}
          data-framed
          className="flex-1 py-1.5 px-3 text-xs font-medium bg-primary text-primary-foreground hover:brightness-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
        >
          {t('pdfEditor.placeOnPage')}
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={!canPlace}
          className="py-1.5 px-2 text-xs rounded border border-border hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
          title={t('pdfEditor.saveSignatureForReuse')}
        >
          {t('common.save')}
        </button>
      </div>

      {placeError && (
        <p className="text-[10px] leading-relaxed text-destructive">{placeError}</p>
      )}

      {/* Saved signatures -- the same list Sign PDF shows. */}
      {savedSignatures.length > 0 && (
        <div className="space-y-1.5 border-t pt-2">
          <button
            type="button"
            onClick={() => setShowSaved(!showSaved)}
            className="text-[10px] font-medium text-muted-foreground hover:text-foreground"
          >
            {t('toolSidebarPanel.savedSignaturesCount', { count: savedSignatures.length })} {showSaved ? '\u25be' : '\u25b8'}
          </button>
          {showSaved && savedSignatures.map((sig) => (
            <div key={sig.id} className="flex items-center gap-1.5 rounded border p-1.5 hover:bg-muted/50 group">
              <button
                type="button"
                onClick={() => placeSignatureImage(sig.dataUrl, sig.background ?? null)}
                className="flex min-w-0 flex-1 items-center gap-2 text-start"
                title={sig.name}
              >
                {/* The image itself: the list holds drawn and uploaded
                    signatures now, which no text preview could show. */}
                <img
                  src={sig.dataUrl}
                  alt={sig.name}
                  className="h-6 w-12 flex-none object-contain"
                />
                <span className="truncate text-[10px] text-muted-foreground">{sig.name}</span>
              </button>
              <button
                type="button"
                onClick={() => deleteSignature(sig.id)}
                className="flex-none text-[10px] text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100"
                title={t('pdfEditor.deleteSavedSignature')}
              >
                \u00d7
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Was a "Click to place mode" button that switched the editor to its
          text tool, so clicking the page made an empty text box rather than
          placing the signature. Two controls that both claimed to place it and
          neither of which let you choose where. A stamp is dragged, so the only
          thing to say is that. */}
      <div className="space-y-1.5 border-t pt-2">
        <p className="text-[10px] leading-relaxed text-muted-foreground">
          {t('toolSidebarPanel.dragTheStampIntoPlace')}
        </p>
        {/* The panel's other delete removes a saved signature, and the one on
            the stamp only appears once it has been clicked, so a signature put
            on the wrong page looked permanent. Clearing them one at a time is
            also no answer now that Place can stamp every page. */}
        {placedStamps.length > 0 && (
          <button
            type="button"
            onClick={handleRemovePlaced}
            className="w-full rounded border border-border px-2 py-1 text-[10px] hover:bg-muted"
          >
            {t('toolSidebarPanel.removePlacedSignatures', { count: placedStamps.length })}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Redact Panel ─────────────────────────────────────────────────────

function RedactPanel() {
  const { state, setRedactionDraft, setRedactionColor, updatePdfBytes, markDirty } = useEditorContext();
  // Memoised so the `?? []` fallback does not hand out a new array each render
  // and re-create every callback that depends on it.
  const draft = useMemo(() => state.redactionDraft ?? [], [state.redactionDraft]);

  // The same search the toolbar uses, so the two cannot drift. This panel used
  // to own a private copy that told the user a scan "cannot be searched" and
  // stopped, while the standalone Redact tool offered to read it -- a dead end
  // and a way forward, for the same document.
  const search = useDocumentSearch(state.pdfBytes);
  // Read a scan in the interface language: someone told their page has no text
  // wants it read, not a second form. The full picker is in Make Searchable.
  const locale = useLocale();
  const [ocrLanguage, setOcrLanguage] = useState('en-US');
  useEffect(() => {
    let cancelled = false;
    listOcrLanguages(locale).then((available) => {
      if (cancelled) return;
      const match = available.find((l) => l.tag.split('-')[0] === locale.split('-')[0]);
      setOcrLanguage(match?.tag ?? 'en-US');
    });
    return () => { cancelled = true; };
  }, [locale]);
  const { query: searchQuery, matches: searchResults, searched: searchRan, isSearching } = search;
  const setSearchQuery = search.setQuery;
  const handleSearch = search.search;
  const [scope, setScope] = useState<RedactionScope>('match');
  const [isApplying, setIsApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);

  // Opening the tool arms the canvas to take rectangles; leaving it disarms.
  useEffect(() => {
    setRedactionDraft([]);
    return () => setRedactionDraft(null);
  }, [setRedactionDraft]);

  const addMatch = useCallback(
    (match: TextMatch) => {
      if (isAlreadyMarked(match, scope, draft)) return;
      setRedactionDraft([...draft, matchToRect(match, scope, `redact-${match.id}-${scope}`)]);
    },
    [draft, scope, setRedactionDraft],
  );

  const addAllMatches = useCallback(() => {
    const added = searchResults
      .filter((m) => !isAlreadyMarked(m, scope, draft))
      .map((m) => matchToRect(m, scope, `redact-${m.id}-${scope}`));
    if (added.length > 0) setRedactionDraft([...draft, ...added]);
  }, [draft, scope, searchResults, setRedactionDraft]);

  const handleApply = useCallback(async () => {
    if (draft.length === 0) return;
    setIsApplying(true);
    setApplyError(null);
    try {
      // The same rasterising apply the standalone tool uses. Drawing a box over
      // the text would leave it in the file, selectable and extractable.
      const result = await applyRedactions(state.pdfBytes, draft, state.redactionColor);
      updatePdfBytes(result);
      markDirty();
      setRedactionDraft([]);
    } catch (err) {
      setApplyError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsApplying(false);
    }
  }, [draft, state.pdfBytes, state.redactionColor, updatePdfBytes, markDirty, setRedactionDraft]);

  return (
    <div className="space-y-3">
      <PanelHeader toolId="redact-pdf" />

      <p className="text-[10px] leading-relaxed text-muted-foreground">
        {t('toolSidebarPanel.dragOnThePageToCover')}
      </p>

      {/* Find text */}
      <div className="space-y-1.5">
        <label className="text-[10px] font-medium text-muted-foreground">{t('pdfEditor.findText')}</label>
        <div className="flex gap-1.5">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void handleSearch(); }}
            placeholder={t('pdfEditor.nameNumber')}
            title={t('pdfEditor.findTextToRedact')}
            className="flex-1 min-w-0 px-2 py-1 text-xs border rounded bg-background"
          />
          <button
            type="button"
            onClick={() => void handleSearch()}
            disabled={isSearching || !searchQuery.trim()}
            className="flex-none px-2 py-1 text-xs rounded border border-border hover:bg-muted disabled:opacity-50"
          >
            {isSearching ? '…' : t('common.find')}
          </button>
        </div>

        {searchRan && !isSearching && searchResults.length === 0 && (
          <div className="space-y-1.5">
            <p className="text-[10px] leading-relaxed text-muted-foreground">
              {search.isScanRead
                ? t('search.noMatchesInScan', { query: searchQuery })
                : t('toolSidebarPanel.noMatchesNoSelectableText')}
            </p>
            {/* Searching a scan again cannot help -- there is no text layer to
                look in. Reading the page is what makes the search possible. */}
            {!search.isScanRead && (
              <>
                <button
                  type="button"
                  onClick={() => void search.readScanAndSearch(ocrLanguage)}
                  disabled={search.isReadingScan}
                  className="flex w-full items-center justify-center gap-1.5 rounded border border-border px-2 py-1 text-[10px] hover:bg-muted disabled:opacity-50"
                >
                  {search.isReadingScan
                    ? t('redactPdf.readingScan')
                    : t('redactPdf.readScanAndSearch')}
                </button>
                {search.scanError && (
                  <p className="text-[10px] text-destructive">{search.scanError}</p>
                )}
              </>
            )}
          </div>
        )}
        {search.isScanRead && searchResults.length > 0 && (
          // Boxes derived from recognised text are approximate, and a redaction
          // that lands slightly short is a privacy failure rather than a
          // cosmetic one. Say so before the user applies it.
          <p className="text-[10px] leading-relaxed text-amber-600 dark:text-amber-400">
            {t('redactPdf.scanBoxesApproximate')}
          </p>
        )}

        {searchResults.length > 0 && (
          <div className="space-y-1.5">
            {/* Same choice the standalone tool offers, and the same helper
                decides what each one covers. */}
            <div className="flex gap-1">
              {redactionScopes().map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setScope(s.value)}
                  title={s.hint}
                  aria-pressed={scope === s.value}
                  className={`flex-1 px-1.5 py-1 text-[10px] rounded border transition-colors ${
                    scope === s.value
                      ? 'border-primary bg-primary/10 font-medium'
                      : 'border-border text-muted-foreground hover:bg-muted/50'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>

            {/* One row per match, so a single occurrence can be covered without
                covering the rest -- the standalone tool always allowed this. */}
            <div className="max-h-40 overflow-y-auto space-y-1">
              {searchResults.map((match) => {
                const added = isAlreadyMarked(match, scope, draft);
                return (
                  <button
                    key={match.id}
                    type="button"
                    onClick={() => addMatch(match)}
                    disabled={added}
                    title={added ? t('toolSidebarPanel.alreadyMarked') : t('toolSidebarPanel.markThisOne')}
                    className={`w-full flex items-center gap-1.5 px-1.5 py-1 text-[10px] rounded border text-start transition-colors ${
                      added
                        ? 'border-primary/40 bg-primary/5 text-muted-foreground'
                        : 'border-border hover:bg-muted/50'
                    }`}
                  >
                    <span className="flex-none text-muted-foreground">p{match.pageIndex + 1}</span>
                    <span className="truncate">{match.text}</span>
                    <span className="ms-auto flex-none">{added ? '✓' : '+'}</span>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={addAllMatches}
              className="w-full py-1 px-2 text-[10px] rounded border border-border hover:bg-muted"
            >
              {t('toolSidebarPanel.markAll', { count: searchResults.length })}
            </button>
          </div>
        )}
      </div>

      {/* Colour */}
      <div className="border-t pt-2">
        <label className="text-[10px] font-medium text-muted-foreground">{t('redactPdf.boxColour')}</label>
        <div className="mt-1">
          <ColorPicker value={state.redactionColor} onChange={setRedactionColor} />
        </div>
        {isLightColor(state.redactionColor) && (
          <p className="mt-1 text-[10px] leading-relaxed text-amber-600 dark:text-amber-400">
            {t('toolSidebarPanel.paleBoxWarning')}
          </p>
        )}
      </div>

      <div className="border-t pt-2 space-y-1.5">
        <p className="text-[10px] text-muted-foreground">
          {plural('count.areaMarked', draft.length)}
        </p>
        {draft.length > 0 && (
          <button
            type="button"
            onClick={() => setRedactionDraft([])}
            className="w-full py-1 px-2 text-[10px] rounded border border-border hover:bg-muted"
          >
            {t('redactPdf.clearAll')}
          </button>
        )}
        {applyError && (
          <p className="text-[10px] leading-relaxed text-destructive">{applyError}</p>
        )}
        {/* What Apply costs, said before it is pressed.
            Redaction replaces each marked page with a flat image, so the text
            on it stops being selectable, searchable and extractable -- for the
            content underneath a box that is the whole point, and for the rest
            of the page it is a side effect worth knowing about. The standalone
            tool says this, but only on its Save step, after the work is done;
            here Apply writes straight into the open document, so the moment
            that matters is before the click, not after it -- which is why this
            is its own string rather than the standalone's, whose past tense
            would be a lie on this side of the button. */}
        {draft.length > 0 && (
          <p className="text-[10px] leading-relaxed text-amber-600 dark:text-amber-400">
            {t('redactPdf.willFlattenPages')}
          </p>
        )}
        <button
          type="button"
          onClick={handleApply}
          disabled={draft.length === 0 || isApplying}
          className="w-full py-1.5 px-3 text-xs font-medium rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isApplying ? t('toolSidebarPanel.redacting') : t('toolSidebarPanel.apply')}
        </button>
      </div>
    </div>
  );
}

function RepairPanel() {
  const { state, updatePdfBytes, markDirty } = useEditorContext();
  const [isProcessing, setIsProcessing] = useState(false);
  const [resultInfo, setResultInfo] = useState<{ originalSize: number; resultSize: number } | null>(null);
  const { apply, isApplying, success, error } = useApply(null, updatePdfBytes, markDirty);

  // Within 5% of where it started: the same rule the standalone tool applies,
  // and the only signal available -- Ghostscript reports no diagnosis, it
  // simply rewrites whatever it is given.
  const isFileSizeSimilar =
    resultInfo !== null &&
    resultInfo.originalSize > 0 &&
    Math.abs(resultInfo.resultSize - resultInfo.originalSize) / resultInfo.originalSize < 0.05;

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
        {t('pdfEditor.attemptToFixCorruptedOr')}
      </p>

      {/* What repair actually does, which the standalone tool explains and this
          panel did not. Repair always "succeeds" -- it re-processes the file
          through Ghostscript whatever state it was in -- so without this the
          result reads as a verdict on the document rather than as a description
          of a process that ran. */}
      <p className="text-[10px] leading-relaxed text-muted-foreground">
        {t('repairPdf.repairExplanation')}
      </p>

      {resultInfo && (
        <>
          <ToolResultFeedback
            originalSize={resultInfo.originalSize}
            resultSize={resultInfo.resultSize}
            toolLabel="PDF repair"
          />
          {/* A file that came back the same size did not have much wrong with
              it. Saying so is the difference between "repaired" and "nothing
              needed repairing", which the size alone does not tell anyone. */}
          {isFileSizeSimilar && (
            <p className="text-[10px] leading-relaxed text-muted-foreground">
              {t('repairPdf.noIssuesDetectedFileAppears')}
            </p>
          )}
          <p className="text-[10px] italic leading-relaxed text-muted-foreground/70">
            {t('repairPdf.repairCompleteIfTheDocument')}
          </p>
        </>
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

function OcrPanel() {
  const { state, updatePdfBytes, markDirty } = useEditorContext();
  const locale = useLocale();
  const [languages, setLanguages] = useState<OcrLanguage[]>([]);
  const [language, setLanguage] = useState('en-US');
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [summary, setSummary] = useState<OcrSummary | null>(null);
  const { apply, isApplying, success, error } = useApply(null, updatePdfBytes, markDirty);

  useEffect(() => {
    let cancelled = false;
    listOcrLanguages(locale).then((list) => {
      if (cancelled) return;
      setLanguages(list);
      const match = list.find((l) => l.tag.split('-')[0] === locale.split('-')[0]);
      if (match) setLanguage(match.tag);
    });
    return () => { cancelled = true; };
  }, [locale]);

  // Recognition is seconds per page, so a long document must not look stuck.
  useEffect(() => {
    const unlisten = listen<[number, number]>('ocr-progress', (event) => {
      const [index, total] = event.payload;
      setProgress({ current: index + 1, total });
    });
    return () => { void unlisten.then((fn) => fn()); };
  }, []);

  const handleApply = useCallback(async () => {
    setIsProcessing(true);
    setSummary(null);
    setProgress(null);
    try {
      // OCR reads from a file; the editor holds bytes. Same temp-file round trip
      // the other Ghostscript-backed panels use.
      const { tempDir, join } = await import('@tauri-apps/api/path');
      const tempInputPath = await join(await tempDir(), `papercut_ocr_${Date.now()}.pdf`);

      const { writeFile, remove } = await import('@tauri-apps/plugin-fs');
      await writeFile(tempInputPath, state.pdfBytes);

      const result = await ocrPdf(tempInputPath, { languages: [language] });
      await remove(tempInputPath).catch(() => {});

      setIsProcessing(false);
      setSummary(result.summary);

      // Nothing readable means there is nothing to apply. Replacing the document
      // with a copy carrying an empty text layer would look like success.
      if (!result.summary.foundText) return;

      await apply(() => Promise.resolve(result.bytes));
    } catch (err) {
      setIsProcessing(false);
      await apply(() => Promise.reject(err));
    } finally {
      setProgress(null);
    }
  }, [state.pdfBytes, language, apply]);

  return (
    <div className="space-y-3">
      <PanelHeader toolId="ocr-pdf" />
      <p className="text-[10px] text-muted-foreground">{t('ocr.intro')}</p>

      <div className="space-y-1">
        <label htmlFor="editor-ocr-language" className="text-[10px] text-muted-foreground">
          {t('ocr.language')}
        </label>
        <select
          id="editor-ocr-language"
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          disabled={isProcessing}
          className="w-full rounded-md border border-border bg-background px-2 py-1 text-[11px]"
        >
          {languages.map((l) => (
            <option key={l.tag} value={l.tag}>{l.name}</option>
          ))}
        </select>
      </div>

      {isProcessing && progress && (
        <p className="text-[10px] text-muted-foreground">
          {t('ocr.readingPage', { current: progress.current, total: progress.total })}
        </p>
      )}

      {summary && !summary.foundText && (
        <div className="rounded-md border border-amber-500/50 bg-amber-500/10 px-2 py-1.5">
          <p className="text-[10px] font-medium text-amber-700 dark:text-amber-400">
            {t('ocr.nothingFound')}
          </p>
          <p className="text-[10px] text-amber-700/80 dark:text-amber-400/80">
            {t('ocr.nothingFoundHint')}
          </p>
        </div>
      )}

      {summary?.foundText && (
        <div className="space-y-1">
          <p className="text-[10px] text-muted-foreground">
            {t('ocr.foundWords', {
              words: plural('count.word', summary.wordCount),
              pages: plural('count.page', summary.pageCount),
            })}
          </p>
          {summary.lowConfidence && (
            <p className="text-[10px] text-amber-700 dark:text-amber-400">
              {t('ocr.lowConfidence')} {t('ocr.lowConfidenceHint')}
            </p>
          )}
        </div>
      )}

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
    case 'repair-pdf':
      return <RepairPanel />;
    case 'ocr-pdf':
      return <OcrPanel />;
    default:
      return (
        <div className="text-[10px] text-muted-foreground p-2">
          {t('pdfEditor.toolPanelNotYetImplemented')}
        </div>
      );
  }
}
