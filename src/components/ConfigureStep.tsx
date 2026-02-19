import { useState, useId } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import type { PdfQualityLevel, PdfPagePreset, PdfProcessingOptions } from '@/types/file';

export interface ConfigureStepProps {
  fileName: string;
  pageCount: number;  // total pages in source PDF (for range validation)
  isProcessing: boolean;
  progress: { current: number; total: number } | null;
  error: string | null;
  onGeneratePreview: (options: Omit<PdfProcessingOptions, 'onProgress'>) => void;
  onBack: () => void;
}

const QUALITY_LEVELS: { value: PdfQualityLevel; label: string; description: string }[] = [
  { value: 'low',     label: 'Low',     description: 'Smallest possible file — structural optimisation only' },
  { value: 'medium',  label: 'Medium',  description: 'Default — re-save with structural packing' },
  { value: 'high',    label: 'High',    description: 'Prioritise quality — resize only if configured' },
  { value: 'maximum', label: 'Maximum', description: 'No optimisation — resize only if configured' },
];

const PAGE_PRESETS: { value: PdfPagePreset; label: string }[] = [
  { value: 'A4',     label: 'A4 (210 × 297 mm)' },
  { value: 'A3',     label: 'A3 (297 × 420 mm)' },
  { value: 'Letter', label: 'Letter (216 × 279 mm)' },
  { value: 'custom', label: 'Custom…' },
];

/** Parse page range string like "1-3, 5, 7-9" into 0-indexed page indices */
function parsePageRange(input: string, maxPages: number): number[] {
  const indices = new Set<number>();
  const parts = input.split(',').map((s) => s.trim()).filter(Boolean);
  for (const part of parts) {
    const rangeMatch = part.match(/^(\d+)-(\d+)$/);
    if (rangeMatch) {
      const start = parseInt(rangeMatch[1], 10);
      const end = parseInt(rangeMatch[2], 10);
      for (let i = start; i <= end; i++) {
        if (i >= 1 && i <= maxPages) indices.add(i - 1); // convert to 0-indexed
      }
    } else {
      const page = parseInt(part, 10);
      if (!isNaN(page) && page >= 1 && page <= maxPages) indices.add(page - 1);
    }
  }
  return Array.from(indices).sort((a, b) => a - b);
}

/** Parse "2 MB", "500 KB", "1.5 GB" into bytes. Returns null on invalid input. */
function parseSizeInput(input: string): number | null {
  const match = input.trim().match(/^(\d+(?:\.\d+)?)\s*(KB|MB|GB)?$/i);
  if (!match) return null;
  const value = parseFloat(match[1]);
  const unit = (match[2] ?? 'MB').toUpperCase();
  const multipliers: Record<string, number> = { KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3 };
  return Math.round(value * multipliers[unit]);
}

export function ConfigureStep({
  fileName,
  pageCount,
  isProcessing,
  progress,
  error,
  onGeneratePreview,
  onBack,
}: ConfigureStepProps) {
  const formId = useId();

  // Compression state
  const [compressionEnabled, setCompressionEnabled] = useState(true);
  const [qualityLevel, setQualityLevel] = useState<PdfQualityLevel>('medium');
  const [targetSizeInput, setTargetSizeInput] = useState('');
  const [sizeInputError, setSizeInputError] = useState<string | null>(null);

  // Resize state
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
    setSizeInputError(null);

    let targetSizeBytes: number | null = null;
    if (compressionEnabled && targetSizeInput.trim() !== '') {
      targetSizeBytes = parseSizeInput(targetSizeInput);
      if (targetSizeBytes === null) {
        setSizeInputError('Enter a valid size like "2 MB", "500 KB", or "1.5 GB"');
        return;
      }
    }

    const options: Omit<PdfProcessingOptions, 'onProgress'> = {
      compressionEnabled,
      qualityLevel,
      targetSizeBytes,
      resizeEnabled,
      pagePreset,
      customWidthMm: pagePreset === 'custom' ? parseFloat(customWidthMm) : null,
      customHeightMm: pagePreset === 'custom' ? parseFloat(customHeightMm) : null,
      selectedPageIndices,
    };

    onGeneratePreview(options);
  }

  // Progress percentage for progress bar
  const progressPct = progress ? Math.round((progress.current / progress.total) * 100) : 0;

  return (
    <div className="flex flex-1 flex-col items-center justify-center p-6">
      <div className="w-full max-w-lg space-y-6">

        {/* File name header */}
        <div className="text-center">
          <p className="text-sm font-medium text-foreground truncate">{fileName}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{pageCount} page{pageCount !== 1 ? 's' : ''}</p>
        </div>

        {/* Compression section */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Optimise file size</h2>
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                checked={compressionEnabled}
                onChange={(e) => setCompressionEnabled(e.target.checked)}
                className="rounded"
              />
              Enable
            </label>
          </div>

          {compressionEnabled && (
            <div className="space-y-3">
              {/* Quality level selector */}
              <fieldset>
                <legend className="sr-only">Quality level</legend>
                <div className="grid grid-cols-4 gap-1">
                  {QUALITY_LEVELS.map(({ value, label, description }) => (
                    <label
                      key={value}
                      title={description}
                      className={`flex flex-col items-center gap-1 rounded-md border px-2 py-2 cursor-pointer text-xs transition-colors select-none ${
                        qualityLevel === value
                          ? 'border-primary bg-primary/5 text-foreground'
                          : 'border-border text-muted-foreground hover:border-primary/50'
                      }`}
                    >
                      <input
                        type="radio"
                        name={`${formId}-quality`}
                        value={value}
                        checked={qualityLevel === value}
                        onChange={() => setQualityLevel(value)}
                        className="sr-only"
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </fieldset>

              {/* Target size input */}
              <div className="space-y-1">
                <label htmlFor={`${formId}-target-size`} className="text-xs text-muted-foreground">
                  Target size (optional, e.g. 2 MB)
                </label>
                <input
                  id={`${formId}-target-size`}
                  type="text"
                  value={targetSizeInput}
                  onChange={(e) => { setTargetSizeInput(e.target.value); setSizeInputError(null); }}
                  placeholder="e.g. 2 MB"
                  disabled={isProcessing}
                  className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
                />
                {sizeInputError && (
                  <p className="text-xs text-destructive">{sizeInputError}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  Note: PDF optimisation is structural only — exact target size is not guaranteed.
                </p>
              </div>
            </div>
          )}
        </section>

        {/* Page resize section */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Resize pages</h2>
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                checked={resizeEnabled}
                onChange={(e) => setResizeEnabled(e.target.checked)}
                className="rounded"
              />
              Enable
            </label>
          </div>

          {resizeEnabled && (
            <div className="space-y-3">
              {/* Preset dropdown */}
              <div className="space-y-1">
                <label htmlFor={`${formId}-preset`} className="text-xs text-muted-foreground">
                  Page size
                </label>
                <select
                  id={`${formId}-preset`}
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

              {/* Custom width × height fields — only shown when preset is 'custom' */}
              {pagePreset === 'custom' && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label htmlFor={`${formId}-width`} className="text-xs text-muted-foreground">Width (mm)</label>
                    <input
                      id={`${formId}-width`}
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
          )}
        </section>

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
          <Button variant="outline" size="sm" onClick={onBack} disabled={isProcessing} className="flex-none">
            Back
          </Button>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={isProcessing || (!compressionEnabled && !resizeEnabled)}
            className="flex-1"
          >
            {isProcessing ? 'Processing…' : 'Generate Preview'}
          </Button>
        </div>

      </div>
    </div>
  );
}
