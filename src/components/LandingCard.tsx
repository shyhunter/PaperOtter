// Locked decisions (implemented exactly):
// - Centered card layout (not full-screen)
// - File picker button and drop zone hint have EQUAL visual prominence (side-by-side)
// - Visual tone: polished and modern — subtle gradients, shadows, touch of color
// - Tagline prominent above card (large, readable)
// - Entire window is a drop target; CARD animates in response (not just the card area)
// - Card drag-over: border glows, background shifts, subtle scale
// - Mid-drag: green for valid, red/neutral for unsupported
// - On valid drop: brief progress indicator before advancing (handle in App.tsx via 'loading' state)
// - Claude's Discretion: spacing, color palette, exact typography, icon choices

import { Upload, FolderOpen } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { DragState } from '@/types/file';
import { RecentDirsButton } from '@/components/RecentDirsButton';

interface LandingCardProps {
  dragState: DragState;
  isLoading: boolean;
  onPickerClick: () => void;
  recentDirs?: string[];
  onRecentDirClick?: (filePath: string) => void;
  invalidDropError?: string | null;
  emptyFileError?: string | null;
  corruptFileError?: string | null;
  /** Non-null when the selected file exceeds the 100 MB limit. Contains the actual file size in bytes. */
  fileSizeLimitBytes?: number | null;
  onFileSizeLimitDismiss?: () => void;
  /** Non-null when the selected PDF has invalid magic bytes — hard block with Repair PDF CTA. */
  corruptPdfBlock?: { name: string } | null;
  onCorruptPdfDismiss?: () => void;
  onCorruptPdfRepair?: () => void;
}

/** Format bytes as a rounded MB string, e.g. "105 MB" */
function formatMB(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

export function LandingCard({
  dragState,
  isLoading,
  corruptPdfBlock,
  onCorruptPdfDismiss,
  onCorruptPdfRepair,
  onPickerClick,
  recentDirs,
  onRecentDirClick,
  invalidDropError,
  emptyFileError,
  corruptFileError,
  fileSizeLimitBytes,
  onFileSizeLimitDismiss,
}: LandingCardProps) {
  const cardClass = cn(
    'relative w-full max-w-[clamp(20rem,55vw,42rem)] mx-auto transition-all duration-200 select-none',
    dragState === 'over-valid' &&
      'border-primary/70 bg-primary/5 shadow-primary/20 shadow-xl scale-[1.015]',
    dragState === 'over-invalid' &&
      'border-destructive/50 bg-destructive/5 shadow-destructive/10 shadow-lg',
    dragState === 'idle' && 'border-border shadow-lg',
  );

  const dragIndicatorClass = cn(
    'absolute inset-0 rounded-xl pointer-events-none transition-opacity duration-150',
    dragState === 'over-valid' && 'opacity-100 ring-2 ring-primary/40',
    dragState === 'over-invalid' && 'opacity-100 ring-2 ring-destructive/30',
    dragState === 'idle' && 'opacity-0',
  );

  // Single inline error slot — priority: emptyFileError > corruptFileError > invalidDropError
  const inlineError = emptyFileError ?? corruptFileError ?? invalidDropError ?? null;

  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="flex flex-col items-center gap-6 w-full max-w-2xl">

        {/* Tagline — prominent, above the card */}
        <p className="text-[clamp(1rem,1.5vw,1.25rem)] font-medium text-foreground text-center">
          Compress, resize, convert — stays on your device
        </p>

        <Card className={cardClass}>
          <div className={dragIndicatorClass} />
          <CardContent className="flex flex-col gap-0 p-0">

            {/* Equal-prominence layout: two halves side by side */}
            <div className="grid grid-cols-2 divide-x divide-border">

              {/* File picker half */}
              <button
                type="button"
                data-testid="open-file-btn"
                onClick={onPickerClick}
                disabled={isLoading}
                className={cn(
                  'group flex flex-col items-center justify-center gap-5 p-[clamp(1.5rem,3vw,3.5rem)] rounded-l-xl',
                  'hover:bg-accent/50 transition-colors duration-150',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                )}
              >
                <div className={cn(
                  'flex h-[clamp(3rem,5vw,5rem)] w-[clamp(3rem,5vw,5rem)] items-center justify-center rounded-full',
                  'bg-primary/10 text-primary transition-transform duration-150',
                  'group-hover:scale-105 group-hover:bg-primary/20',
                )}>
                  <FolderOpen className="h-[clamp(2rem,3vw,3rem)] w-[clamp(2rem,3vw,3rem)]" />
                </div>
                <div className="text-center">
                  <p className="text-base font-medium text-foreground">Open file</p>
                  <p className="text-sm text-muted-foreground mt-1">PDF, JPG, PNG, WebP</p>
                </div>
              </button>

              {/* Drop zone half */}
              <div
                data-testid="drop-zone"
                className={cn(
                  'flex flex-col items-center justify-center gap-5 p-[clamp(1.5rem,3vw,3.5rem)] rounded-r-xl',
                  dragState === 'over-valid' && 'bg-primary/10',
                  dragState === 'over-invalid' && 'bg-destructive/10',
                )}
              >
                <div className={cn(
                  'flex h-[clamp(3rem,5vw,5rem)] w-[clamp(3rem,5vw,5rem)] items-center justify-center rounded-full',
                  'transition-all duration-150',
                  dragState === 'over-valid'
                    ? 'bg-primary/20 text-primary scale-110'
                    : dragState === 'over-invalid'
                      ? 'bg-destructive/20 text-destructive'
                      : 'bg-muted text-muted-foreground',
                )}>
                  <Upload className="h-[clamp(2rem,3vw,3rem)] w-[clamp(2rem,3vw,3rem)]" />
                </div>
                <div className="text-center">
                  <p className={cn(
                    'text-base font-medium transition-colors',
                    dragState === 'over-valid' && 'text-primary',
                    dragState === 'over-invalid' && 'text-destructive',
                    dragState === 'idle' && 'text-foreground',
                  )}>
                    {dragState === 'over-valid' && 'Drop to open'}
                    {dragState === 'over-invalid' && 'Unsupported file'}
                    {dragState === 'idle' && 'Drop file here'}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {dragState === 'idle' ? 'Anywhere on the window' : '\u00a0'}
                  </p>
                </div>
              </div>
            </div>

            {/* Loading bar — visible briefly after valid drop before advancing */}
            {isLoading && (
              <div data-testid="loading-spinner" className="px-8 pb-6 pt-3 animate-bounce-in">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div className="h-full w-2/3 bg-primary rounded-full animate-pulse" />
                </div>
                <p className="text-sm text-muted-foreground text-center mt-2">Loading file...</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent dirs button — below the card, left-aligned */}
        {(recentDirs?.length ?? 0) > 0 && (
          <div className="w-full flex justify-start">
            <RecentDirsButton
              dirs={recentDirs ?? []}
              onFileSelected={onRecentDirClick ?? (() => {})}
              disabled={isLoading}
            />
          </div>
        )}

        {/* Inline error slot — emptyFileError > corruptFileError > invalidDropError */}
        {inlineError && (
          <p
            data-testid={
              emptyFileError
                ? 'empty-file-error'
                : corruptFileError
                ? 'corrupt-file-error'
                : 'invalid-drop-error'
            }
            className="text-sm text-destructive text-center animate-in fade-in"
          >
            {inlineError}
          </p>
        )}
      </div>

      {/* File size limit modal — blocking overlay, no "proceed anyway" */}
      {fileSizeLimitBytes != null && (
        <div
          data-testid="file-size-limit-modal"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="file-size-modal-title"
        >
          <div className="bg-background rounded-xl shadow-2xl border border-border w-full max-w-sm mx-4 p-6 flex flex-col gap-4">
            <div>
              <h2 id="file-size-modal-title" className="text-lg font-semibold text-foreground">
                File too large
              </h2>
              <p className="text-sm text-muted-foreground mt-2">
                This file is {formatMB(fileSizeLimitBytes)}.{' '}
                Files over 100 MB are not supported. Please use a smaller file.
              </p>
            </div>
            <div className="flex justify-end">
              <Button
                type="button"
                data-testid="file-size-limit-dismiss"
                variant="outline"
                onClick={onFileSizeLimitDismiss}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Corrupt PDF hard block modal — shown when magic bytes check fails */}
      {corruptPdfBlock != null && (
        <div
          data-testid="corrupt-pdf-modal"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="corrupt-pdf-modal-title"
        >
          <div className="bg-background rounded-xl shadow-2xl border border-border w-full max-w-sm mx-4 p-6 flex flex-col gap-4">
            <div>
              <h2 id="corrupt-pdf-modal-title" className="text-lg font-semibold text-foreground">
                Damaged or Invalid PDF
              </h2>
              <p className="text-sm text-muted-foreground mt-2">
                "{corruptPdfBlock.name}" could not be opened — it appears to be damaged or not a valid PDF.
                The Repair PDF tool may be able to recover it.
              </p>
            </div>
            <div className="flex gap-2 justify-end">
              <Button
                type="button"
                data-testid="corrupt-pdf-dismiss"
                variant="outline"
                onClick={onCorruptPdfDismiss}
              >
                Pick a Different File
              </Button>
              <Button
                type="button"
                data-testid="corrupt-pdf-repair"
                onClick={onCorruptPdfRepair}
              >
                Repair with Repair PDF →
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
