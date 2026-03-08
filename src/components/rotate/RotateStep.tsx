// RotateStep: Page grid with selection + rotation controls.
// Click to select/deselect pages, then rotate selected or all pages left/right.
import { useState, useCallback, useEffect } from 'react';
import { RotateCw, RotateCcw, Loader2, CheckSquare, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { renderAllPdfPages } from '@/lib/pdfThumbnail';
import { cycleRotation } from '@/lib/pdfRotate';
import type { RotationDegrees } from '@/lib/pdfRotate';

/** Rotate counter-clockwise: cycle 3 forward = 1 backward */
function rotateCCW(r: RotationDegrees): RotationDegrees {
  let v = r;
  v = cycleRotation(v);
  v = cycleRotation(v);
  v = cycleRotation(v);
  return v;
}

interface RotateStepProps {
  pdfBytes: Uint8Array;
  pageCount: number;
  onApplied: (rotations: Map<number, RotationDegrees>) => void;
  onBack: () => void;
  isProcessing: boolean;
}

export function RotateStep({ pdfBytes, pageCount, onApplied, onBack, isProcessing }: RotateStepProps) {
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [isLoadingThumbs, setIsLoadingThumbs] = useState(true);
  const [rotations, setRotations] = useState<Map<number, RotationDegrees>>(() => {
    const map = new Map<number, RotationDegrees>();
    for (let i = 0; i < pageCount; i++) map.set(i, 0);
    return map;
  });
  const [selected, setSelected] = useState<Set<number>>(new Set());

  // Load thumbnails
  useEffect(() => {
    let cancelled = false;
    setIsLoadingThumbs(true);
    renderAllPdfPages(pdfBytes, 0.3)
      .then((urls) => {
        if (!cancelled) {
          setThumbnails(urls);
          setIsLoadingThumbs(false);
        }
      })
      .catch(() => {
        if (!cancelled) setIsLoadingThumbs(false);
      });
    return () => { cancelled = true; };
  }, [pdfBytes]);

  const rotatedCount = Array.from(rotations.values()).filter((r) => r !== 0).length;
  const selectedCount = selected.size;
  const allSelected = selectedCount === pageCount;

  const handleToggleSelect = useCallback((pageIndex: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(pageIndex)) {
        next.delete(pageIndex);
      } else {
        next.add(pageIndex);
      }
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      const all = new Set<number>();
      for (let i = 0; i < pageCount; i++) all.add(i);
      setSelected(all);
    }
  }, [allSelected, pageCount]);

  /** Rotate a set of page indices in a given direction */
  const rotatePages = useCallback((indices: Iterable<number>, direction: 'cw' | 'ccw') => {
    setRotations((prev) => {
      const next = new Map(prev);
      for (const i of indices) {
        const current = next.get(i) ?? 0;
        next.set(i, direction === 'cw' ? cycleRotation(current) : rotateCCW(current));
      }
      return next;
    });
  }, []);

  const handleRotateSelected = useCallback((direction: 'cw' | 'ccw') => {
    if (selectedCount === 0) return;
    rotatePages(selected, direction);
  }, [selected, selectedCount, rotatePages]);

  const handleRotateAll = useCallback((direction: 'cw' | 'ccw') => {
    const allIndices = Array.from({ length: pageCount }, (_, i) => i);
    rotatePages(allIndices, direction);
  }, [pageCount, rotatePages]);

  const handleResetAll = useCallback(() => {
    setRotations(() => {
      const map = new Map<number, RotationDegrees>();
      for (let i = 0; i < pageCount; i++) map.set(i, 0);
      return map;
    });
  }, [pageCount]);

  const handleApply = useCallback(() => {
    onApplied(rotations);
  }, [rotations, onApplied]);

  return (
    <div className="flex flex-1 flex-col p-6">
      <div className="w-full max-w-2xl mx-auto space-y-4 flex-1 overflow-y-auto">
        <div className="text-center space-y-1">
          <h2 className="text-lg font-semibold text-foreground">Rotate Pages</h2>
          <p className="text-sm text-muted-foreground">
            Select pages, then rotate them left or right.
            {rotatedCount > 0 && ` ${rotatedCount} page${rotatedCount !== 1 ? 's' : ''} rotated.`}
          </p>
        </div>

        {/* Controls */}
        <div className="space-y-2">
          {/* Selection controls */}
          <div className="flex items-center justify-center gap-2">
            <Button variant="outline" size="sm" onClick={handleSelectAll}>
              {allSelected ? (
                <><Square className="w-3.5 h-3.5 mr-1" /> Deselect All</>
              ) : (
                <><CheckSquare className="w-3.5 h-3.5 mr-1" /> Select All</>
              )}
            </Button>
            {selectedCount > 0 && (
              <Badge variant="secondary" className="text-xs">
                {selectedCount} selected
              </Badge>
            )}
          </div>

          {/* Rotation controls */}
          <div className="flex items-center justify-center gap-2 flex-wrap">
            {/* Selected pages rotation */}
            <Button
              variant="default"
              size="sm"
              onClick={() => handleRotateSelected('ccw')}
              disabled={selectedCount === 0}
              title="Rotate selected pages left"
            >
              <RotateCcw className="w-4 h-4 mr-1" />
              Left
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={() => handleRotateSelected('cw')}
              disabled={selectedCount === 0}
              title="Rotate selected pages right"
            >
              <RotateCw className="w-4 h-4 mr-1" />
              Right
            </Button>

            <span className="text-muted-foreground/40 mx-1">|</span>

            {/* All pages rotation */}
            <Button variant="outline" size="sm" onClick={() => handleRotateAll('ccw')}>
              <RotateCcw className="w-4 h-4 mr-1" />
              All Left
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleRotateAll('cw')}>
              <RotateCw className="w-4 h-4 mr-1" />
              All Right
            </Button>
            <Button variant="outline" size="sm" onClick={handleResetAll} disabled={rotatedCount === 0}>
              Reset
            </Button>
          </div>
        </div>

        {/* Page grid */}
        {isLoadingThumbs ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
            {thumbnails.map((url, i) => {
              const rotation = rotations.get(i) ?? 0;
              const isRotated = rotation !== 0;
              const isSelected = selected.has(i);
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => handleToggleSelect(i)}
                  className={`relative aspect-[3/4] rounded-lg border overflow-hidden cursor-pointer transition-all ${
                    isSelected
                      ? 'border-primary ring-2 ring-primary/30'
                      : isRotated
                        ? 'border-blue-400 ring-1 ring-blue-200'
                        : 'border-border hover:border-primary/50'
                  }`}
                >
                  <div className="w-full h-full flex items-center justify-center bg-muted/30">
                    <img
                      src={url}
                      alt={`Page ${i + 1}`}
                      className="max-w-full max-h-full object-contain transition-transform duration-200"
                      style={{ transform: `rotate(${rotation}deg)` }}
                    />
                  </div>
                  {/* Page number */}
                  <span className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] text-center py-0.5">
                    {i + 1}
                  </span>
                  {/* Selection checkbox indicator */}
                  <span className={`absolute top-1 left-1 w-4 h-4 rounded-sm border flex items-center justify-center text-[10px] transition-colors ${
                    isSelected
                      ? 'bg-primary border-primary text-primary-foreground'
                      : 'bg-background/70 border-border text-transparent'
                  }`}>
                    {isSelected && '✓'}
                  </span>
                  {/* Rotation badge */}
                  {isRotated && (
                    <span className="absolute top-1 right-1 bg-blue-500 text-white text-[9px] font-medium px-1.5 py-0.5 rounded-full">
                      {rotation}°
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Bottom bar */}
      <div className="border-t bg-background px-4 py-3 flex items-center gap-3 mt-4">
        <Button variant="outline" size="sm" onClick={onBack} className="flex-none">
          Back
        </Button>
        <div className="flex-1" />
        <Button size="sm" onClick={handleApply} disabled={rotatedCount === 0 || isProcessing}>
          {isProcessing ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Applying…
            </>
          ) : (
            'Apply & Save'
          )}
        </Button>
      </div>
    </div>
  );
}
