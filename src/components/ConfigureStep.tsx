import { useState, useId, useMemo } from 'react';
import { Info, AlertTriangle, Crosshair } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { parsePageRange, formatBytes } from '@/lib/pdfUtils';
import { recommendQualityForTarget } from '@/lib/pdfProcessor';
import type { PdfQualityLevel, PdfPagePreset, PdfProcessingOptions } from '@/types/file';

export interface ConfigureStepProps {
  fileName: string;
  pageCount: number;        // total pages in source PDF (for range validation)
  fileSizeBytes: number;    // original file size — shown in header so users know what target to set
  compressibilityScore: number;  // 0.0–1.0 from pre-scan (0 = text-only, 1 = image-heavy)
  imageCount: number;            // number of image XObjects found
  isProcessing: boolean;
  progress: { current: number; total: number } | null;
  error: string | null;
  onGeneratePreview: (options: Omit<PdfProcessingOptions, 'onProgress'>) => void;
  onBack: () => void;
  onCancel?: () => void;    // fires immediately when Cancel clicked during processing
}

/** Slider zone boundaries and their quality mappings */
const ZONES = [
  { min: 0,  max: 25,  quality: 'web' as PdfQualityLevel,     label: 'Web',     dpi: '72 dpi',  desc: 'Smallest file' },
  { min: 25, max: 50,  quality: 'screen' as PdfQualityLevel,  label: 'Screen',  dpi: '150 dpi', desc: 'Balanced' },
  { min: 50, max: 75,  quality: 'print' as PdfQualityLevel,   label: 'Print',   dpi: '300 dpi', desc: 'High quality' },
  { min: 75, max: 100, quality: 'archive' as PdfQualityLevel, label: 'Archive', dpi: 'Lossless', desc: 'No recompression' },
];

/** Map slider value (0-100) to quality level */
function sliderToQuality(value: number): PdfQualityLevel {
  for (const zone of ZONES) {
    if (value < zone.max) return zone.quality;
  }
  return 'archive';
}

/** Map quality level to slider value (zone midpoint) */
function qualityToSlider(quality: PdfQualityLevel): number {
  const zone = ZONES.find(z => z.quality === quality);
  return zone ? Math.round((zone.min + zone.max) / 2) : 37; // default to screen midpoint
}

/** Get the current zone for a slider value */
function getActiveZone(value: number) {
  for (const zone of ZONES) {
    if (value < zone.max) return zone;
  }
  return ZONES[ZONES.length - 1];
}

const PAGE_PRESETS: { value: PdfPagePreset; label: string }[] = [
  { value: 'A4',     label: 'A4 (210 × 297 mm)' },
  { value: 'A3',     label: 'A3 (297 × 420 mm)' },
  { value: 'Letter', label: 'Letter (216 × 279 mm)' },
  { value: 'custom', label: 'Custom…' },
];


export function ConfigureStep({
  fileName,
  pageCount,
  fileSizeBytes,
  compressibilityScore,
  imageCount,
  isProcessing,
  progress,
  error,
  onGeneratePreview,
  onBack,
  onCancel,
}: ConfigureStepProps) {
  const formId = useId();

  // Slider value 0-100, default to screen zone midpoint (37)
  const [sliderValue, setSliderValue] = useState(37);
  const qualityLevel = useMemo(() => sliderToQuality(sliderValue), [sliderValue]);
  const activeZone = useMemo(() => getActiveZone(sliderValue), [sliderValue]);

  // Custom target size toggle & state
  const [customMode, setCustomMode] = useState(false);
  const [customSizeValue, setCustomSizeValue] = useState<string>('');
  const [customUnit, setCustomUnit] = useState<'MB' | 'KB'>(fileSizeBytes >= 1024 * 1024 ? 'MB' : 'KB');
  const [customError, setCustomError] = useState<string | null>(null);

  // Metadata stripping — off by default
  const [stripMetadata, setStripMetadata] = useState(false);

  // Resize state — off by default, toggled via prominent switch
  const [resizeEnabled, setResizeEnabled] = useState(false);
  const [pagePreset, setPagePreset] = useState<PdfPagePreset>('A4');
  const [customWidthMm, setCustomWidthMm] = useState<string>('210');
  const [customHeightMm, setCustomHeightMm] = useState<string>('297');
  const [pageRangeInput, setPageRangeInput] = useState('');

  // Derived: selected page indices (empty = all pages)
  const selectedPageIndices =
    pageRangeInput.trim() === ''
      ? Array.from({ length: pageCount }, (_, i) => i)
      : parsePageRange(pageRangeInput, pageCount);

  function handleSubmit() {
    setCustomError(null);

    let resolvedQuality = qualityLevel;
    let targetSizeBytes: number | null = null;

    if (customMode) {
      // Validate custom target size
      const parsed = parseInt(customSizeValue, 10);
      if (!customSizeValue.trim() || isNaN(parsed) || parsed < 1) {
        setCustomError('Enter a valid target size');
        return;
      }
      const customBytes = parsed * (customUnit === 'MB' ? 1024 * 1024 : 1024);
      if (customBytes >= fileSizeBytes) {
        setCustomError(`Target must be smaller than original (${formatBytes(fileSizeBytes)})`);
        return;
      }
      // Resolve custom to a real quality preset
      resolvedQuality = recommendQualityForTarget(customBytes, fileSizeBytes, compressibilityScore);
      targetSizeBytes = customBytes;
      // Sync slider to show the resolved zone
      setSliderValue(qualityToSlider(resolvedQuality));
    }

    const options: Omit<PdfProcessingOptions, 'onProgress'> = {
      compressionEnabled: true, // always on
      qualityLevel: resolvedQuality,
      targetSizeBytes,
      resizeEnabled,
      pagePreset,
      customWidthMm: pagePreset === 'custom' ? parseFloat(customWidthMm) : null,
      customHeightMm: pagePreset === 'custom' ? parseFloat(customHeightMm) : null,
      selectedPageIndices,
      stripMetadata,
    };

    onGeneratePreview(options);
  }

  // Block progression for text-only PDFs unless resize is enabled
  const isNonCompressible = compressibilityScore < 0.1 && !resizeEnabled;

  const progressPct = progress ? Math.round((progress.current / progress.total) * 100) : 0;

  return (
    <div data-testid="configure-step" className="flex flex-1 flex-col items-center overflow-y-auto p-6">
      <div className="w-full max-w-[clamp(24rem,45vw,36rem)] space-y-4 my-auto">

        {/* File name header */}
        <div className="text-center">
          <p className="text-sm font-medium text-foreground truncate">{fileName}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {pageCount} page{pageCount !== 1 ? 's' : ''}
            {fileSizeBytes > 0 && (
              <span className="ml-2 font-medium text-foreground">{formatBytes(fileSizeBytes)}</span>
            )}
          </p>
        </div>

        {/* Compression section */}
        <div className="rounded-lg border border-border bg-card p-4 space-y-4">
          <h2 className="text-[clamp(0.8rem,1vw,1rem)] font-semibold text-foreground">Optimise file size</h2>

          {/* Non-compressible warning — shown prominently at top */}
          {compressibilityScore < 0.1 && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 flex-none mt-0.5" />
              <p className="text-xs text-amber-700 dark:text-amber-400">
                This file is mostly text with no embedded images. Compression has minimal effect on text-only PDFs.
                {!resizeEnabled && ' Enable page resize below to still process this file.'}
              </p>
            </div>
          )}

          {/* Compression slider */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Compression level</span>
              <span className="text-xs font-medium text-foreground">
                {activeZone.label} ({activeZone.dpi})
              </span>
            </div>

            {/* Zone labels above slider */}
            <div className="relative h-5">
              {ZONES.map((zone) => (
                <span
                  key={zone.quality}
                  className={cn(
                    'absolute text-[10px] -translate-x-1/2 select-none transition-colors',
                    zone.quality === activeZone.quality
                      ? 'text-foreground font-semibold'
                      : 'text-muted-foreground/60',
                  )}
                  style={{ left: `${(zone.min + zone.max) / 2}%` }}
                >
                  {zone.label}
                </span>
              ))}
            </div>

            {/* Range slider */}
            <div className="relative">
              {/* Zone background segments */}
              <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-2 rounded-full overflow-hidden flex">
                {ZONES.map((zone) => (
                  <div
                    key={zone.quality}
                    className={cn(
                      'h-full transition-colors',
                      zone.quality === activeZone.quality
                        ? 'bg-primary/30'
                        : 'bg-muted',
                    )}
                    style={{ width: `${zone.max - zone.min}%` }}
                  />
                ))}
              </div>

              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={sliderValue}
                onChange={(e) => {
                  setSliderValue(Number(e.target.value));
                  if (customMode) setCustomMode(false);
                }}
                disabled={isProcessing}
                aria-label="Compression level"
                data-testid="compression-slider"
                className="relative w-full h-6 appearance-none bg-transparent cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-background [&::-webkit-slider-thumb]:cursor-pointer [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-primary [&::-moz-range-thumb]:shadow-md [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-background [&::-moz-range-thumb]:cursor-pointer [&::-webkit-slider-runnable-track]:bg-transparent [&::-moz-range-track]:bg-transparent"
              />
            </div>

            {/* Zone description */}
            <p className="text-xs text-muted-foreground text-center">
              {activeZone.desc}
            </p>
          </div>

          {/* Custom target size toggle */}
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setCustomMode((v) => !v)}
              disabled={isProcessing}
              className={cn(
                'flex items-center gap-2 rounded-md border px-3 py-2 text-xs w-full transition-colors',
                customMode
                  ? 'border-primary bg-primary/5 text-foreground'
                  : 'border-border text-muted-foreground hover:border-primary/50',
                'disabled:opacity-50 disabled:cursor-not-allowed',
              )}
            >
              <Crosshair className="w-3.5 h-3.5 flex-none" />
              <span className="font-medium">Custom target size</span>
              {customMode && (
                <span className="ml-auto text-[10px] text-muted-foreground">
                  Best preset auto-selected
                </span>
              )}
            </button>

            {customMode && (
              <div className="space-y-1 pl-1">
                <div className="flex gap-2">
                  <input
                    id={`${formId}-custom-size`}
                    type="number"
                    min="1"
                    step="1"
                    value={customSizeValue}
                    onChange={(e) => { setCustomSizeValue(e.target.value); setCustomError(null); }}
                    placeholder="e.g. 2"
                    disabled={isProcessing}
                    className="flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
                  />
                  <button
                    type="button"
                    onClick={() => setCustomUnit((u) => u === 'MB' ? 'KB' : 'MB')}
                    disabled={isProcessing}
                    className="rounded-md border border-border bg-muted px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted/80 disabled:opacity-50 min-w-[3.5rem]"
                  >
                    {customUnit}
                  </button>
                </div>
                {customError && (
                  <p className="text-xs text-destructive">{customError}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  Maximum file size — the best compression preset will be chosen automatically.
                </p>
              </div>
            )}
          </div>

          {/* Compressibility guidance */}
          <div className="flex items-start gap-1.5">
            <Info className="h-3.5 w-3.5 text-muted-foreground flex-none mt-0.5" />
            <p className="text-xs text-muted-foreground">
              {compressibilityScore >= 0.5
                ? `This PDF contains ${imageCount} image${imageCount !== 1 ? 's' : ''} — compression will reduce file size significantly.`
                : compressibilityScore >= 0.1
                  ? `This PDF contains ${imageCount} image${imageCount !== 1 ? 's' : ''} — moderate compression savings expected.`
                  : 'This PDF is mostly text — compression savings will be minimal.'}
            </p>
          </div>
        </div>

        {/* Resize pages section — always visible, toggled via switch */}
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-[clamp(0.8rem,1vw,1rem)] font-semibold text-foreground">Resize pages</h2>

            {/* Prominent pill toggle switch */}
            <button
              type="button"
              role="switch"
              data-testid="resize-toggle"
              aria-checked={resizeEnabled ? 'true' : 'false'}
              aria-label="Enable page resize"
              onClick={() => setResizeEnabled((v) => !v)}
              disabled={isProcessing}
              className={cn(
                'relative inline-flex h-6 w-11 flex-none items-center rounded-full transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                'disabled:cursor-not-allowed disabled:opacity-50',
                resizeEnabled ? 'bg-primary' : 'bg-muted-foreground/30',
              )}
            >
              <span
                className={cn(
                  'inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform',
                  resizeEnabled ? 'translate-x-6' : 'translate-x-1',
                )}
              />
            </button>
          </div>

          {resizeEnabled ? (
            <div className="space-y-3">
              {/* Preset dropdown */}
              <div className="space-y-1">
                <label htmlFor={`${formId}-preset`} className="text-xs text-muted-foreground">
                  Page size
                </label>
                <select
                  id={`${formId}-preset`}
                  data-testid="page-preset-select"
                  value={pagePreset}
                  onChange={(e) => setPagePreset(e.target.value as PdfPagePreset)}
                  disabled={isProcessing}
                  className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
                >
                  {PAGE_PRESETS.map(({ value, label }) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>

              {/* Custom width × height fields */}
              {pagePreset === 'custom' && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label htmlFor={`${formId}-width`} className="text-xs text-muted-foreground">Width (mm)</label>
                    <input
                      id={`${formId}-width`}
                      data-testid="custom-width-input"
                      type="number"
                      min="10"
                      max="5000"
                      value={customWidthMm}
                      onChange={(e) => setCustomWidthMm(e.target.value)}
                      disabled={isProcessing}
                      className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
                    />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor={`${formId}-height`} className="text-xs text-muted-foreground">Height (mm)</label>
                    <input
                      id={`${formId}-height`}
                      data-testid="custom-height-input"
                      type="number"
                      min="10"
                      max="5000"
                      value={customHeightMm}
                      onChange={(e) => setCustomHeightMm(e.target.value)}
                      disabled={isProcessing}
                      className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
                    />
                  </div>
                </div>
              )}

              {/* Page range input */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label htmlFor={`${formId}-page-range`} className="text-xs text-muted-foreground">
                    Pages to resize (leave blank for all)
                  </label>
                  {selectedPageIndices.length > 0 && (
                    <Badge variant="secondary" className="text-xs">
                      {selectedPageIndices.length} page{selectedPageIndices.length !== 1 ? 's' : ''}
                    </Badge>
                  )}
                </div>
                <input
                  id={`${formId}-page-range`}
                  type="text"
                  value={pageRangeInput}
                  onChange={(e) => setPageRangeInput(e.target.value)}
                  placeholder="e.g. 1-3, 5, 7-9"
                  disabled={isProcessing}
                  className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
                />
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Enable to change page dimensions — A4, A3, Letter, or custom size.
            </p>
          )}
        </div>

        {/* Strip metadata toggle */}
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-[clamp(0.8rem,1vw,1rem)] font-semibold text-foreground">Strip metadata</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Remove title, author, subject, keywords, creator, and producer fields.
              </p>
            </div>

            <button
              type="button"
              role="switch"
              data-testid="strip-metadata-toggle"
              aria-checked={stripMetadata ? 'true' : 'false'}
              aria-label="Strip PDF metadata"
              onClick={() => setStripMetadata((v) => !v)}
              disabled={isProcessing}
              className={cn(
                'relative inline-flex h-6 w-11 flex-none items-center rounded-full transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                'disabled:cursor-not-allowed disabled:opacity-50',
                stripMetadata ? 'bg-primary' : 'bg-muted-foreground/30',
              )}
            >
              <span
                className={cn(
                  'inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform',
                  stripMetadata ? 'translate-x-6' : 'translate-x-1',
                )}
              />
            </button>
          </div>
        </div>

        {/* Processing progress */}
        {isProcessing && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground text-center">
              {progress
                ? `Processing page ${progress.current} of ${progress.total}…`
                : 'Processing…'}
            </p>
            <Progress value={progressPct} className="h-1.5" />
          </div>
        )}

        {/* Inline processing error */}
        {error && !isProcessing && (
          <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </p>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <Button variant="outline" size="sm" data-testid="back-btn" onClick={onBack} disabled={isProcessing} className="flex-none">
            Back
          </Button>
          <Button
            size="sm"
            data-testid="generate-preview-btn"
            onClick={handleSubmit}
            disabled={isProcessing || isNonCompressible}
            className="flex-1"
          >
            {isProcessing ? 'Processing…' : isNonCompressible ? 'Compression not available' : 'Generate Preview'}
          </Button>
          {isProcessing && onCancel && (
            <button
              type="button"
              data-testid="cancel-btn"
              onClick={onCancel}
              className="text-sm text-muted-foreground hover:text-destructive transition-colors flex-none"
            >
              Cancel
            </button>
          )}
        </div>

      </div>
    </div>
  );
}
