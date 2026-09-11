import { useState, useId, useMemo } from 'react';
import { Info, AlertTriangle, Crosshair } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { parsePageRange, formatBytes } from '@/lib/pdfUtils';
import { SavedSettingsRow, SaveSettingAs } from '@/components/destinations/DestinationPicker';
import { targetSizeInput, type DestinationRequirement } from '@/lib/destinations';
import { useDestinations } from '@/hooks/useDestinations';
import {
  recommendQualityForTarget,
  estimateOutputSizeBytes,
  getNonCompressibleReason,
  nonCompressibleMessage,
} from '@/lib/pdfProcessor';
import { offersKbUnit, smallestReachableTarget } from '@/lib/compressTargetSize';
import type { PdfQualityLevel, PdfPagePreset, PdfProcessingOptions } from '@/types/file';
import { plural, t } from '@/i18n';
import { OtterSpinner } from '@/components/brand/OtterSpinner';
import { PRIMARY_ACTION } from '@/components/ui/primaryAction';

export interface ConfigureStepProps {
  fileName: string;
  pageCount: number;        // total pages in source PDF (for range validation)
  fileSizeBytes: number;    // original file size — shown in header so users know what target to set
  compressibilityScore: number;  // 0.0–1.0 from pre-scan (0 = text-only, 1 = image-heavy)
  imageCount: number;            // number of image XObjects found
  jpxByteShare: number;          // 0.0–1.0 share of image bytes that are JPEG2000-encoded —
                                 // Ghostscript won't meaningfully re-encode these
  isProcessing: boolean;
  progress: { current: number; total: number } | null;
  error: string | null;
  onGeneratePreview: (options: Omit<PdfProcessingOptions, 'onProgress'>) => void;
  /**
   * What the document is being prepared for. Held by the caller because the
   * verdict on the Compare step needs the same answer — the point of a
   * destination is the check at the end, not the settings at the start.
   */
  destination?: DestinationRequirement | null;
  /** Absent for a flow that does not offer destinations; the picker is then hidden. */
  onDestinationChange?: (destination: DestinationRequirement | null) => void;
  onBack: () => void;
  onCancel?: () => void;    // fires immediately when Cancel clicked during processing
}

/**
 * Slider zone boundaries and their quality mappings.
 *
 * Boundaries and DPI figures only. The label and description are translated and
 * so must be resolved per render -- see zoneLabel/zoneDesc below.
 */
type ZoneQuality = Exclude<PdfQualityLevel, 'custom'>;

const ZONES: { min: number; max: number; quality: ZoneQuality; dpi: string }[] = [
  { min: 0,  max: 25,  quality: 'web',     dpi: '72 dpi'   },
  { min: 25, max: 50,  quality: 'screen',  dpi: '150 dpi'  },
  { min: 50, max: 75,  quality: 'print',   dpi: '300 dpi'  },
  // The archive zone's figure is a word, not a number, so it is resolved at
  // render by zoneFigure below. Left literal here it shipped untranslated in
  // all eight non-English locales.
  { min: 75, max: 100, quality: 'archive', dpi: '' },
];

/**
 * The figure shown beside the zone label.
 *
 * Three of the four are numerals plus an international unit and need no
 * translation. The archive zone reads "Lossless", which is an English word, and
 * a module-level const cannot call t(): it would resolve once at import and
 * keep whatever language was active then.
 */
function zoneFigure(quality: ZoneQuality, dpi: string): string {
  return quality === 'archive' ? t('configureStep.lossless') : dpi;
}

function zoneLabel(quality: ZoneQuality): string {
  const labels: Record<ZoneQuality, string> = {
    web: t('imageConfigureStep.web'),
    screen: t('configureStep.screen'),
    print: t('configureStep.print'),
    archive: t('configureStep.archive'),
  };
  return labels[quality];
}

function zoneDesc(quality: ZoneQuality): string {
  const descriptions: Record<ZoneQuality, string> = {
    web: t('configureStep.smallestFile'),
    screen: t('configureStep.balanced'),
    print: t('configureStep.highQuality'),
    archive: t('configureStep.noRecompression'),
  };
  return descriptions[quality];
}

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

function pagePresets(): { value: PdfPagePreset; label: string }[] {
  return [
    { value: 'A4',     label: t('configureStep.a4210297Mm') },
    { value: 'A3',     label: t('configureStep.a3297420Mm') },
    { value: 'Letter', label: t('configureStep.letter216279Mm') },
    { value: 'custom', label: t('configureStep.custom') },
  ];
}


export function ConfigureStep({
  fileName,
  pageCount,
  fileSizeBytes,
  compressibilityScore,
  imageCount,
  jpxByteShare,
  isProcessing,
  progress,
  error,
  onGeneratePreview,
  destination,
  onDestinationChange,
  onBack,
  onCancel,
}: ConfigureStepProps) {
  const formId = useId();

  // Slider value 0-100, default to screen zone midpoint (37)
  const [sliderValue, setSliderValue] = useState(37);
  const qualityLevel = useMemo(() => sliderToQuality(sliderValue), [sliderValue]);
  const activeZone = useMemo(() => getActiveZone(sliderValue), [sliderValue]);

  // Estimated output sizes per zone — shown under each label so users can gauge impact
  const estimatedZoneSizes = useMemo(
    () =>
      ZONES.reduce<Record<PdfQualityLevel, number>>(
        (acc, z) => ({
          ...acc,
          [z.quality]: estimateOutputSizeBytes(z.quality, fileSizeBytes, compressibilityScore, jpxByteShare),
        }),
        {} as Record<PdfQualityLevel, number>,
      ),
    [fileSizeBytes, compressibilityScore, jpxByteShare],
  );

  // Custom target size toggle & state
  const [customMode, setCustomMode] = useState(false);
  const [customSizeValue, setCustomSizeValue] = useState<string>('');
  const [customUnit, setCustomUnit] = useState<'MB' | 'KB'>(fileSizeBytes >= 1024 * 1024 ? 'MB' : 'KB');
  const [customError, setCustomError] = useState<string | null>(null);

  // The most aggressive preset's estimate is the floor: nothing goes below it.
  // KB is only worth offering when a KB-scale target is actually reachable, so
  // the unit in force is derived from the floor rather than trusted from state.
  const floorBytes = estimatedZoneSizes['web'];
  const offerKb = offersKbUnit(floorBytes);
  const unit: 'MB' | 'KB' = offerKb ? customUnit : 'MB';

  // Metadata stripping — off by default

  // Resize state — off by default, toggled via prominent switch
  const [resizeEnabled, setResizeEnabled] = useState(false);
  // The editor's compress panel has had this since it shipped; the standalone
  // tool never did, so the same document compressed two ways offered two
  // different sets of choices. Held as the mechanism (downsample) and shown as
  // the outcome (keep resolution), which is the way round the user thinks.
  const [downsampleImages, setDownsampleImages] = useState(true);
  const [pagePreset, setPagePreset] = useState<PdfPagePreset>('A4');
  const [customWidthMm, setCustomWidthMm] = useState<string>('210');
  const [customHeightMm, setCustomHeightMm] = useState<string>('297');
  const [pageRangeInput, setPageRangeInput] = useState('');

  const { destinations, save: saveDestination, remove: removeDestination } = useDestinations();

  /**
   * Apply a destination by moving the ordinary controls, not by overriding them.
   *
   * The user can see exactly what was set and change any of it, which matters
   * because a destination is a starting point for their document rather than a
   * mode the app enters.
   */
  function applyDestination(d: DestinationRequirement | null) {
    onDestinationChange?.(d);
    if (!d) return;
    // Restore the compression mode it was saved in, and only that one. Target
    // size and quality are alternatives here -- handleSubmit resolves a target
    // into a quality -- so putting both back would leave the form in a state the
    // user was never in.
    if (d.maxBytes !== undefined) {
      const { value, unit: u } = targetSizeInput(d.maxBytes);
      setCustomMode(true);
      setCustomSizeValue(value);
      setCustomUnit(u);
      setCustomError(null);
    } else if (d.qualityLevel !== undefined) {
      // Reported after first use: choosing a setting saved at Web left the
      // slider on Print. A setting that restores the size limit but not the
      // quality is not the setting that was saved.
      setCustomMode(false);
      setSliderValue(qualityToSlider(d.qualityLevel));
      setCustomError(null);
    }

    if (d.pageSize !== undefined) {
      setResizeEnabled(true);
      setPagePreset(d.pageSize);
    } else {
      // Saved with resizing off, so it goes back off. Leaving a previous
      // tool's A4 in place would silently resize a document the setting never
      // asked to resize.
      setResizeEnabled(false);
    }
  }

  /** Save what the controls currently say, under the user's own name. */
  function saveCurrentAsDestination(name: string) {
    const parsed = parseInt(customSizeValue, 10);
    const maxBytes = customMode && !isNaN(parsed) && parsed > 0
      ? parsed * (unit === 'MB' ? 1024 * 1024 : 1024)
      : undefined;
    void saveDestination({
      name,
      maxBytes,
      // Only when a target size is not what was chosen: the two are
      // alternatives, and saving both would restore a form nobody filled in.
      qualityLevel: !customMode && qualityLevel !== 'custom' ? qualityLevel : undefined,
      pageSize: resizeEnabled && pagePreset !== 'custom' ? pagePreset : undefined,
    });
  }

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
        setCustomError(t('configureStep.enterAValidTargetSize'));
        return;
      }
      const customBytes = parsed * (unit === 'MB' ? 1024 * 1024 : 1024);
      if (customBytes >= fileSizeBytes) {
        setCustomError(t('configureStep.targetMustBeSmaller', { size: formatBytes(fileSizeBytes) }));
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
      downsampleImages,
    };

    onGeneratePreview(options);
  }

  // A single source of truth for "compression is predictably futile" — text-only or
  // JPX-dominated. Drives the warning message, the disabled controls below, and (in
  // pdfProcessor.ts) skipping the Ghostscript pass entirely, all from the same
  // threshold. Gated on fileSizeBytes > 0 (the pre-scan hasn't resolved yet before
  // that, same signal already used for the file-size line above) — otherwise the
  // default compressibilityScore=0 briefly reads as "text-only" for every file.
  const preScanLoaded = fileSizeBytes > 0;
  const nonCompressibleReason = preScanLoaded ? getNonCompressibleReason(compressibilityScore, jpxByteShare) : null;
  const nonCompressibleMsg = nonCompressibleMessage(nonCompressibleReason, imageCount);
  const isNonCompressible = nonCompressibleReason !== null && !resizeEnabled;

  const progressPct = progress ? Math.round((progress.current / progress.total) * 100) : 0;

  return (
    <div data-testid="configure-step" className="flex flex-1 flex-col min-h-0">
      <div className="flex-1 overflow-y-auto p-6 flex flex-col items-center">
      <div className="w-full max-w-[clamp(28rem,80vw,58rem)] space-y-4 mx-auto py-2">

        {/* File name header */}
        <div className="text-center">
          <p className="text-sm font-medium text-foreground truncate">{fileName}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {plural('count.page', pageCount)}
            {fileSizeBytes > 0 && (
              <span className="ms-2 font-medium text-foreground">{formatBytes(fileSizeBytes)}</span>
            )}
          </p>
        </div>

        {/* Applying a saved setting sits *above* the controls it rewrites: a
            click moves the quality, the target size and the page size, and the
            user should be able to watch that happen rather than scroll up to
            find out. Renders nothing until something has been saved. */}
        {onDestinationChange && destinations.length > 0 && (
          <div className="rounded-lg border border-border bg-card p-4">
            <SavedSettingsRow
              destinations={destinations}
              selectedId={destination?.id ?? null}
              onSelect={applyDestination}
              onRemove={(id: string) => void removeDestination(id)}
            />
          </div>
        )}

        {/* Compression section */}
        <div className="rounded-lg border border-border bg-card p-4 space-y-4">
          <h2 className="text-[clamp(0.8rem,1vw,1rem)] font-semibold text-foreground">{t('configure.optimiseSize')}</h2>

          {/* Non-compressible warning — shown prominently at top, at most once */}
          {nonCompressibleMsg && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 flex-none mt-0.5" />
              <p className="text-xs text-amber-700 dark:text-amber-400">
                {nonCompressibleMsg}
                {!resizeEnabled && ` ${t('configureStep.enableResizeToStillProcess')}`}
              </p>
            </div>
          )}

          {/* Compression slider */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{t('configure.compressionLevel')}</span>
              <span className="text-xs font-medium text-foreground">
                {zoneLabel(activeZone.quality)} ({zoneFigure(activeZone.quality, activeZone.dpi)})
              </span>
            </div>

            {/* Zone labels above slider */}
            <div className="relative h-8">
              {ZONES.map((zone) => (
                <span
                  key={zone.quality}
                  className={cn(
                    'absolute flex flex-col items-center -translate-x-1/2 select-none transition-colors',
                    zone.quality === activeZone.quality
                      ? 'text-foreground font-semibold'
                      : 'text-muted-foreground/60',
                  )}
                  style={{ left: `${(zone.min + zone.max) / 2}%` }}
                >
                  <span className="text-[10px]">{zoneLabel(zone.quality)}</span>
                  <span
                    data-testid={`zone-estimate-${zone.quality}`}
                    className="text-[9px] text-muted-foreground/70 font-normal"
                  >
                    ~{formatBytes(estimatedZoneSizes[zone.quality])}
                  </span>
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
                        ? 'bg-[var(--primary)]'
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
                disabled={isProcessing || isNonCompressible}
                aria-label={t('configure.compressionLevel')}
                data-testid="compression-slider"
                className="relative w-full h-6 appearance-none bg-transparent cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-background [&::-webkit-slider-thumb]:cursor-pointer [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-primary [&::-moz-range-thumb]:shadow-md [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-background [&::-moz-range-thumb]:cursor-pointer [&::-webkit-slider-runnable-track]:bg-transparent [&::-moz-range-track]:bg-transparent"
              />
            </div>

            {/* Zone description */}
            <p className="text-xs text-muted-foreground text-center">
              {zoneDesc(activeZone.quality)}
            </p>
          </div>

          {/* Custom target size toggle */}
          <div className="space-y-2">
            <button
              type="button"
              data-testid="custom-target-toggle"
              onClick={() => setCustomMode((v) => !v)}
              disabled={isProcessing || isNonCompressible}
              className={cn(
                'flex items-center gap-2 rounded-md border px-3 py-2 text-xs w-full transition-colors',
                customMode
                  ? 'border-primary bg-primary/5 text-foreground'
                  : 'border-border text-muted-foreground hover:border-primary/50',
                'disabled:opacity-50 disabled:cursor-not-allowed',
              )}
            >
              <Crosshair className="w-3.5 h-3.5 flex-none" />
              <span className="font-medium">{t('configure.customTargetSize')}</span>
              {customMode && (
                <span className="ms-auto text-[10px] text-muted-foreground">
                  {t('configure.bestPresetAuto')}
                </span>
              )}
            </button>

            {customMode && (
              <div className="space-y-1 ps-1">
                <div className="flex gap-2">
                  <input
                    id={`${formId}-custom-size`}
                    data-testid="custom-target-size"
                    type="number"
                    min={smallestReachableTarget(floorBytes, unit)}
                    step="1"
                    value={customSizeValue}
                    onChange={(e) => { setCustomSizeValue(e.target.value); setCustomError(null); }}
                    placeholder={`e.g. ${smallestReachableTarget(floorBytes, unit)}`}
                    disabled={isProcessing || isNonCompressible}
                    className="flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
                  />
                  {offerKb ? (
                    <button
                      type="button"
                      data-testid="custom-target-unit"
                      onClick={() => setCustomUnit((u) => u === 'MB' ? 'KB' : 'MB')}
                      disabled={isProcessing || isNonCompressible}
                      className="border-2 border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50 min-w-[3.5rem]"
                    >
                      {customUnit}
                    </button>
                  ) : (
                    // Not a disabled toggle: a control that looks pressable but
                    // refuses to change reads as a bug. Plain text states the
                    // true thing — this file is measured in megabytes.
                    <span
                      data-testid="custom-target-unit"
                      className="flex items-center justify-center rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground min-w-[3.5rem]"
                    >
                      MB
                    </span>
                  )}
                </div>
                {customError && (
                  <p className="text-xs text-destructive">{customError}</p>
                )}
                {/* Pre-estimate warning: show when the entered target is below the minimum achievable size */}
                {customMode && customSizeValue.trim() !== '' && (() => {
                  const parsed = parseInt(customSizeValue, 10);
                  if (isNaN(parsed) || parsed < 1) return null;
                  const targetBytes = parsed * (unit === 'MB' ? 1024 * 1024 : 1024);
                  const minAchievable = floorBytes;
                  if (targetBytes < minAchievable) {
                    return (
                      <div data-testid="target-below-min-warning" className="flex items-start gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1.5">
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 flex-none mt-0.5" />
                        <p className="text-xs text-amber-700 dark:text-amber-400">
                          {t('configureStep.targetMayNotBeAchievable', { size: formatBytes(minAchievable) })}
                        </p>
                      </div>
                    );
                  }
                  return null;
                })()}
                {/* The floor is known as soon as the estimates are, so making
                    the user discover it by entering a rejected value is a
                    choice, not a limitation. */}
                <p className="text-xs text-muted-foreground">
                  {t('configureStep.canCompressToAboutMax', { size: formatBytes(floorBytes) })}
                </p>
              </div>
            )}
          </div>

          {/* Only meaningful when there are images to keep the resolution of.
              Phrased as the thing the user wants rather than the mechanism they
              must switch off to get it: every preset bundles resolution
              reduction with re-encoding, and this is the only way to have the
              second without the first. Same control, same words and same
              caveat as the editor's compress panel -- two screens doing one
              job should not disagree about what they offer. */}
          {imageCount > 0 && (
            <div className="space-y-1.5 border-t border-border pt-3">
              <label className="flex cursor-pointer items-center gap-2 text-xs text-foreground">
                <input
                  type="checkbox"
                  data-testid="keep-image-resolution"
                  checked={!downsampleImages}
                  onChange={(e) => setDownsampleImages(!e.target.checked)}
                  disabled={isProcessing}
                  className="h-3.5 w-3.5 accent-[var(--primary)] disabled:opacity-50"
                />
                {t('pdfEditor.keepImageResolution')}
              </label>
              {!downsampleImages && (
                <p className="ps-5 text-xs leading-relaxed text-muted-foreground">
                  {t('toolSidebarPanel.imagesStillReEncoded')}
                </p>
              )}
            </div>
          )}

          {/* Compressibility guidance — only shown when the banner above isn't already
              covering the reason, so the same fact is never stated twice on this screen. */}
          {!nonCompressibleMsg && (
            <div className="flex items-start gap-1.5">
              <Info className="h-3.5 w-3.5 text-muted-foreground flex-none mt-0.5" />
              <p className="text-xs text-muted-foreground">
                {compressibilityScore >= 0.5
                  ? t('configureStep.containsImagesHighSavings', { images: plural('count.image', imageCount) })
                  : t('configureStep.containsImagesModerateSavings', { images: plural('count.image', imageCount) })}
              </p>
            </div>
          )}
        </div>

        {/* Resize pages section — always visible, toggled via switch */}
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-[clamp(0.8rem,1vw,1rem)] font-semibold text-foreground">{t('configure.resizePages')}</h2>

            {/* Prominent pill toggle switch */}
            <button
              type="button"
              role="switch"
              data-testid="resize-toggle"
              aria-checked={resizeEnabled ? 'true' : 'false'}
              aria-label={t('configure.enablePageResize')}
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
                  {t('configure.pageSize')}
                </label>
                <select
                  id={`${formId}-preset`}
                  data-testid="page-preset-select"
                  value={pagePreset}
                  onChange={(e) => setPagePreset(e.target.value as PdfPagePreset)}
                  disabled={isProcessing}
                  className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
                >
                  {pagePresets().map(({ value, label }) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>

              {/* Custom width × height fields */}
              {pagePreset === 'custom' && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label htmlFor={`${formId}-width`} className="text-xs text-muted-foreground">{t('configure.widthMm')}</label>
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
                    <label htmlFor={`${formId}-height`} className="text-xs text-muted-foreground">{t('configure.heightMm')}</label>
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
                    {t('configure.pagesToResize')}
                  </label>
                  {selectedPageIndices.length > 0 && (
                    <Badge variant="secondary" className="text-xs">
                      {plural('count.page', selectedPageIndices.length)}
                    </Badge>
                  )}
                </div>
                <input
                  id={`${formId}-page-range`}
                  type="text"
                  value={pageRangeInput}
                  onChange={(e) => setPageRangeInput(e.target.value)}
                  placeholder={t('configure.pagesPlaceholder')}
                  disabled={isProcessing}
                  className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
                />
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              {t('configure.enablePageResizeHint')}
            </p>
          )}
        </div>


        {/* Processing progress */}
        {isProcessing && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground text-center">
              {progress
                ? t('configureStep.processingPageOf', { current: progress.current, total: progress.total })
                : t('common.processing')}
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

        {/* Saving sits *under* the controls being saved. It is the last thing
            you do -- configure, like it, keep it -- and putting a save
            affordance above the thing it saves is backwards. */}
        {onDestinationChange && (
          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <h2 className="text-[clamp(0.8rem,1vw,1rem)] font-semibold text-foreground">
              {t('destination.label')}
            </h2>
            <SaveSettingAs onSave={saveCurrentAsDestination} hasSaved={destinations.length > 0} />
          </div>
        )}

      </div>
      </div>

      {/* Sticky bottom action bar */}
      <div className="border-t-[3px] bg-background px-6 py-3 flex items-center gap-3 flex-none">
        <Button variant="outline" size="sm" data-testid="back-btn" onClick={onBack} disabled={isProcessing} className="flex-none">
          {t('common.back')}
        </Button>
        {isProcessing && onCancel && (
          <button
            type="button"
            data-testid="cancel-btn"
            onClick={onCancel}
            className="text-sm text-muted-foreground hover:text-destructive transition-colors flex-none"
          >
            {t('common.cancel')}
          </button>
        )}
        <Button
          size="sm"
          data-testid="generate-preview-btn"
          onClick={handleSubmit}
          disabled={isProcessing || isNonCompressible}
          className={PRIMARY_ACTION}
        >
          {isProcessing ? (
            <>
              <OtterSpinner className="size-5" />
              {t('common.processing')}
            </>
          ) : isNonCompressible ? (
            t('configureStep.compressionNotAvailable')
          ) : (
            t('imageConfigureStep.generatePreview')
          )}
        </Button>
      </div>
    </div>
  );
}
