// RotateStep: Page grid with rotation controls — click to cycle, bulk rotate buttons.
import { useState, useCallback, useEffect } from 'react';
import { RotateCw, RotateCcw, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { renderAllPdfPages } from '@/lib/pdfThumbnail';
import { cycleRotation } from '@/lib/pdfRotate';
import type { RotationDegrees } from '@/lib/pdfRotate';

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

  const handleClickPage = useCallback((pageIndex: number) => {
    setRotations((prev) => {
      const next = new Map(prev);
      next.set(pageIndex, cycleRotation(next.get(pageIndex) ?? 0));
      return next;
    });
  }, []);

  const handleRotateAll = useCallback((direction: 'cw' | 'ccw') => {
    setRotations((prev) => {
      const next = new Map(prev);
      for (let i = 0; i < pageCount; i++) {
        const current = next.get(i) ?? 0;
        if (direction === 'cw') {
          next.set(i, cycleRotation(current));
        } else {
          // Counter-clockwise = cycle 3 times forward (90 → 0, 0 → 270, 270 → 180, 180 → 90)
          let r = current as RotationDegrees;
          r = cycleRotation(r);
          r = cycleRotation(r);
          r = cycleRotation(r);
          next.set(i, r);
        }
      }
      return next;
    });
  }, [pageCount]);

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
            Click a page to rotate 90°. {rotatedCount > 0 ? `${rotatedCount} page${rotatedCount !== 1 ? 's' : ''} rotated.` : 'No pages rotated yet.'}
          </p>
        </div>

        {/* Bulk controls */}
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" onClick={() => handleRotateAll('ccw')}>
            <RotateCcw className="w-4 h-4 mr-1" />
            All Left
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleRotateAll('cw')}>
            <RotateCw className="w-4 h-4 mr-1" />
            All Right
          </Button>
          <Button variant="outline" size="sm" onClick={handleResetAll} disabled={rotatedCount === 0}>
            Reset All
          </Button>
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
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => handleClickPage(i)}
                  className={`relative aspect-[3/4] rounded-lg border overflow-hidden cursor-pointer transition-all ${
                    isRotated ? 'border-primary ring-2 ring-primary/30' : 'border-border hover:border-primary/50'
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
                  <span className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] text-center py-0.5">
                    {i + 1}
                  </span>
                  {isRotated && (
                    <span className="absolute top-1 right-1 bg-primary text-primary-foreground text-[9px] font-medium px-1.5 py-0.5 rounded-full">
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
