// Locked decisions (implemented exactly):
// - Centered card layout (not full-screen)
// - File picker button and drop zone hint have EQUAL visual prominence (side-by-side)
// - Visual tone: polished and modern — subtle gradients, shadows, touch of color
// - Subtle tagline (e.g. "Compress, resize, convert — stays on your device")
// - Entire window is a drop target; CARD animates in response (not just the card area)
// - Card drag-over: border glows, background shifts, subtle scale
// - Mid-drag: green for valid, red/neutral for unsupported
// - On valid drop: brief progress indicator before advancing (handle in App.tsx via 'loading' state)
// - Claude's Discretion: spacing, color palette, exact typography, icon choices

import { Upload, FolderOpen } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { DragState } from '@/types/file';

interface LandingCardProps {
  dragState: DragState;
  isLoading: boolean;
  onPickerClick: () => void;
}

export function LandingCard({ dragState, isLoading, onPickerClick }: LandingCardProps) {
  const cardClass = cn(
    'relative w-full max-w-md mx-auto transition-all duration-200 select-none',
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

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="flex flex-col items-center gap-4 w-full max-w-md">

        {/* Tagline — subtle, above the card */}
        <p className="text-sm text-muted-foreground/70 tracking-wide text-center">
          Compress, resize, convert — stays on your device
        </p>

        <Card className={cardClass}>
          <div className={dragIndicatorClass} />
          <CardContent className="flex flex-col gap-0 p-0">

            {/* Equal-prominence layout: two halves side by side */}
            <div className="grid grid-cols-2 divide-x divide-border">

              {/* File picker half */}
              <button
                onClick={onPickerClick}
                disabled={isLoading}
                className={cn(
                  'group flex flex-col items-center justify-center gap-3 p-8 rounded-l-xl',
                  'hover:bg-accent/50 transition-colors duration-150',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                )}
              >
                <div className={cn(
                  'flex h-12 w-12 items-center justify-center rounded-full',
                  'bg-primary/10 text-primary transition-transform duration-150',
                  'group-hover:scale-105 group-hover:bg-primary/20',
                )}>
                  <FolderOpen className="h-6 w-6" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-foreground">Open file</p>
                  <p className="text-xs text-muted-foreground mt-0.5">PDF, JPG, PNG, WebP</p>
                </div>
              </button>

              {/* Drop zone half */}
              <div
                className={cn(
                  'flex flex-col items-center justify-center gap-3 p-8 rounded-r-xl',
                  dragState === 'over-valid' && 'bg-primary/10',
                  dragState === 'over-invalid' && 'bg-destructive/10',
                )}
              >
                <div className={cn(
                  'flex h-12 w-12 items-center justify-center rounded-full',
                  'transition-all duration-150',
                  dragState === 'over-valid'
                    ? 'bg-primary/20 text-primary scale-110'
                    : dragState === 'over-invalid'
                      ? 'bg-destructive/20 text-destructive'
                      : 'bg-muted text-muted-foreground',
                )}>
                  <Upload className="h-6 w-6" />
                </div>
                <div className="text-center">
                  <p className={cn(
                    'text-sm font-medium transition-colors',
                    dragState === 'over-valid' && 'text-primary',
                    dragState === 'over-invalid' && 'text-destructive',
                    dragState === 'idle' && 'text-foreground',
                  )}>
                    {dragState === 'over-valid' && 'Drop to open'}
                    {dragState === 'over-invalid' && 'Unsupported file'}
                    {dragState === 'idle' && 'Drop file here'}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {dragState === 'idle' ? 'Anywhere on the window' : '\u00a0'}
                  </p>
                </div>
              </div>
            </div>

            {/* Loading bar — visible briefly after valid drop before advancing */}
            {isLoading && (
              <div className="px-6 pb-4 pt-2">
                <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
                  <div className="h-full bg-primary animate-pulse rounded-full" />
                </div>
                <p className="text-xs text-muted-foreground text-center mt-2">Loading file...</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
