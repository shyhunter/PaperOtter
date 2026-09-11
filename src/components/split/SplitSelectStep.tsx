// SplitSelectStep: Page selection with 3 modes — by range, every N pages, extract all.
// Visual page grid + text input with bidirectional sync.
import { useState, useCallback, useMemo, useRef } from 'react';

import { Button } from '@/components/ui/button';
import { LazyPageThumbnail } from '@/components/shared/LazyPageThumbnail';
import { parsePageRangeText } from '@/lib/pdfSplit';
import type { SplitMode } from '@/lib/pdfSplit';
import { plural, t } from '@/i18n';
import { usePdfDocument } from '@/hooks/usePdfDocument';
import { OtterSpinner } from '@/components/brand/OtterSpinner';
import { PRIMARY_ACTION } from '@/components/ui/primaryAction';

type TabMode = 'range' | 'every-n' | 'individual';

interface SplitSelectStepProps {
  pdfBytes: Uint8Array;
  pageCount: number;
  fileName: string;
  onSplit: (mode: SplitMode) => void;
  onBack: () => void;
  isProcessing: boolean;
}

export function SplitSelectStep({
  pdfBytes,
  pageCount,
  fileName,
  onSplit,
  onBack,
  isProcessing,
}: SplitSelectStepProps) {
  // One document for the whole grid. Each tile used to parse the file itself.
  const pdfDoc = usePdfDocument(pdfBytes);
  const [mode, setMode] = useState<TabMode>('range');
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Range mode state
  const [selectedPages, setSelectedPages] = useState<Set<number>>(new Set());
  const [rangeText, setRangeText] = useState('');
  const [rangeError, setRangeError] = useState<string | null>(null);

  // Every-N mode state
  const [everyN, setEveryN] = useState(1);

  // Sync: grid selection → range text
  const updateTextFromSelection = useCallback((pages: Set<number>) => {
    if (pages.size === 0) {
      setRangeText('');
      return;
    }
    const sorted = Array.from(pages).sort((a, b) => a - b);
    const parts: string[] = [];
    let start = sorted[0];
    let end = sorted[0];
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] === end + 1) {
        end = sorted[i];
      } else {
        parts.push(start === end ? `${start}` : `${start}-${end}`);
        start = sorted[i];
        end = sorted[i];
      }
    }
    parts.push(start === end ? `${start}` : `${start}-${end}`);
    setRangeText(parts.join(', '));
  }, []);

  // Toggle page selection (grid click)
  const togglePage = useCallback((pageNum: number) => {
    setSelectedPages((prev) => {
      const next = new Set(prev);
      if (next.has(pageNum)) {
        next.delete(pageNum);
      } else {
        next.add(pageNum);
      }
      updateTextFromSelection(next);
      setRangeError(null);
      return next;
    });
  }, [updateTextFromSelection]);

  // Sync: text input → grid selection
  const handleRangeTextChange = useCallback((text: string) => {
    setRangeText(text);
    setRangeError(null);
    if (!text.trim()) {
      setSelectedPages(new Set());
      return;
    }
    try {
      const ranges = parsePageRangeText(text, pageCount);
      const pages = new Set<number>();
      for (const r of ranges) {
        for (let p = r.start; p <= r.end; p++) pages.add(p);
      }
      setSelectedPages(pages);
    } catch (err) {
      // Don't clear selection on parse error — user is still typing
      if (err instanceof Error) setRangeError(err.message);
    }
  }, [pageCount]);

  // Build SplitMode from current UI state
  const currentSplitMode = useMemo((): SplitMode | null => {
    switch (mode) {
      case 'range': {
        if (selectedPages.size === 0) return null;
        try {
          const ranges = rangeText.trim() ? parsePageRangeText(rangeText, pageCount) : null;
          if (!ranges) return null;
          return { type: 'ranges', ranges };
        } catch {
          return null;
        }
      }
      case 'every-n':
        return everyN >= 1 ? { type: 'every-n', n: everyN } : null;
      case 'individual':
        return { type: 'individual' };
    }
  }, [mode, selectedPages, rangeText, pageCount, everyN]);

  // Preview info
  const previewInfo = useMemo(() => {
    if (!currentSplitMode) return null;
    switch (currentSplitMode.type) {
      case 'ranges': {
        const groups = currentSplitMode.ranges.map((r) => {
          const pages: number[] = [];
          for (let p = r.start; p <= r.end; p++) pages.push(p);
          return pages;
        });
        return groups.map((pages) => ({
          label: pages.length === 1
            ? t('split.pageN', { page: pages[0] })
            : t('split.pagesRange', { from: pages[0], to: pages[pages.length - 1] }),
          count: pages.length,
        }));
      }
      case 'every-n': {
        const groups: { label: string; count: number }[] = [];
        for (let i = 1; i <= pageCount; i += everyN) {
          const end = Math.min(i + everyN - 1, pageCount);
          groups.push({
            label: i === end ? t('split.pageN', { page: i }) : t('split.pagesRange', { from: i, to: end }),
            count: end - i + 1,
          });
        }
        return groups;
      }
      case 'individual':
        return Array.from({ length: pageCount }, (_, i) => ({
          label: t('split.pageN', { page: i + 1 }),
          count: 1,
        }));
    }
  }, [currentSplitMode, pageCount, everyN]);

  const handleSplit = useCallback(() => {
    if (currentSplitMode) {
      onSplit(currentSplitMode);
    }
  }, [currentSplitMode, onSplit]);

  return (
    <div className="flex flex-1 flex-col p-6 min-h-0">
      <div ref={scrollContainerRef} className="w-full max-w-2xl mx-auto space-y-4 flex-1 overflow-y-auto min-h-0">
        <div className="text-center space-y-1">
          <h2 className="text-lg font-semibold text-foreground">{t('pdfToJpg.selectPages')}</h2>
          <p className="text-sm text-muted-foreground">{fileName}, {plural('count.page', pageCount)}</p>
        </div>

        {/* Mode tabs */}
        <div className="flex gap-1 p-1 rounded-lg bg-muted">
          {([['range', t('splitSelectStep.byRange')], ['every-n', t('splitSelectStep.everyNPages')], ['individual', t('splitSelectStep.extractAll')]] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setMode(key)}
              className={`flex-1 px-3 py-1.5 text-sm rounded-md transition-colors ${
                mode === key ? 'bg-background text-foreground shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Range mode: page grid + text input */}
        {mode === 'range' && (
          <div className="space-y-3">
            {/* Text input */}
            <div>
              <label htmlFor="range-input" className="text-xs font-medium text-muted-foreground mb-1 block">
                {t('split.pageRangesEG1')}
              </label>
              <input
                id="range-input"
                type="text"
                value={rangeText}
                onChange={(e) => handleRangeTextChange(e.target.value)}
                placeholder="1-3, 5, 7-10"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              {rangeError && <p className="text-xs text-destructive mt-1">{rangeError}</p>}
            </div>

            {/* Page grid — each thumbnail renders lazily as it scrolls into view */}
            <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-2">
              {Array.from({ length: pageCount }, (_, i) => {
                const pageNum = i + 1;
                const isSelected = selectedPages.has(pageNum);
                return (
                  <button
                    key={pageNum}
                    type="button"
                    onClick={() => togglePage(pageNum)}
                    className={`relative aspect-[3/4] rounded-lg border overflow-hidden cursor-pointer transition-all ${
                      isSelected ? 'border-primary ring-2 ring-primary/30' : 'border-border hover:border-primary/50'
                    }`}
                  >
                    <LazyPageThumbnail
                      doc={pdfDoc}
                      pageIndex={i}
                      scale={0.3}
                      scrollContainerRef={scrollContainerRef}
                      className="w-full h-full"
                      canvasClassName="w-full h-full object-cover"
                    />
                    <span className="absolute bottom-0 start-0 end-0 bg-black/60 text-white text-[10px] text-center py-0.5">
                      {pageNum}
                    </span>
                    {isSelected && (
                      <div className="absolute top-1 end-1 w-4 h-4 rounded-full bg-primary flex items-center justify-center">
                        <svg viewBox="0 0 12 12" className="w-3 h-3 text-primary-foreground"><path d="M2 6l3 3 5-5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Every-N mode */}
        {mode === 'every-n' && (
          <div className="space-y-3">
            <div>
              <label htmlFor="every-n-input" className="text-xs font-medium text-muted-foreground mb-1 block">
                {t('split.splitEveryNPages')}
              </label>
              <input
                id="every-n-input"
                type="number"
                min={1}
                max={pageCount}
                value={everyN}
                onChange={(e) => setEveryN(Math.max(1, parseInt(e.target.value, 10) || 1))}
                className="w-24 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <p className="text-sm text-muted-foreground">
              {t('split.thisWillCreate', { files: plural('count.file', Math.ceil(pageCount / everyN)) })}
            </p>
          </div>
        )}

        {/* Individual mode */}
        {mode === 'individual' && (
          <div className="text-center py-4">
            <p className="text-sm text-muted-foreground">
              {t('split.extractEachPageAsA')}
            </p>
            <p className="text-sm font-medium text-foreground mt-1">
              {t('split.thisWillCreate', { files: plural('count.file', pageCount) })}
            </p>
          </div>
        )}

        {/* Preview panel */}
        {previewInfo && previewInfo.length > 0 && previewInfo.length <= 20 && (
          <div className="rounded-lg border border-border bg-card p-3">
            <p className="text-xs font-medium text-muted-foreground mb-2">{t('split.outputFiles', { count: previewInfo.length })}</p>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {previewInfo.map((item, i) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <span className="text-foreground">{item.label}</span>
                  <span className="text-muted-foreground">{plural('count.page', item.count)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Bottom bar */}
      <div className="border-t bg-background px-4 py-3 flex items-center gap-3 mt-4">
        <Button variant="outline" size="sm" onClick={onBack} className="flex-none">
          {t('common.back')}
        </Button>
        <Button data-testid="apply-btn" size="sm" onClick={handleSplit} disabled={!currentSplitMode || isProcessing}
          className={PRIMARY_ACTION}
        >
          {isProcessing ? (
            <>
              <OtterSpinner className="size-4" />
              {t('split.splitting')}
            </>
          ) : (
            t('split.split')
          )}
        </Button>
      </div>
    </div>
  );
}
