// RedactStep: Page navigation + rectangle drawing + text search UI for PDF redaction.
import { useState, useCallback, useRef, useEffect } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { Search, ChevronLeft, ChevronRight, Trash2, Loader2 } from 'lucide-react';
import { PagePreview } from '@/components/shared/PagePreview';
import { RedactOverlay, type RedactionRect } from './RedactOverlay';
import { findTextMatches, type TextMatch } from '@/lib/pdfTextSearch';
import { ColorPicker } from '@/components/ColorPicker';
import { isLightColor } from '@/lib/colorPresets';
import { DEFAULT_REDACTION_COLOR } from '@/lib/pdfRedact';
import { Button } from '@/components/ui/button';

interface RedactStepProps {
  pdfBytes: Uint8Array;
  onComplete: (redactions: RedactionRect[], color: string) => void;
  onBack: () => void;
}

let nextId = 1;
function genId(prefix: string): string {
  return `${prefix}-${nextId++}`;
}

export function RedactStep({ pdfBytes, onComplete, onBack }: RedactStepProps) {
  const [allRedactions, setAllRedactions] = useState<RedactionRect[]>([]);
  const [boxColor, setBoxColor] = useState(DEFAULT_REDACTION_COLOR);
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<TextMatch[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  // So "nothing found" can be said out loud instead of the panel just staying blank.
  const [searchRan, setSearchRan] = useState(false);
  const [pageDimensions, setPageDimensions] = useState<{ width: number; height: number } | null>(null);

  // Keep PDF doc reference for text search
  const pdfDocRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);

  // Load PDF once and store reference
  useEffect(() => {
    let cancelled = false;

    async function loadDoc() {
      try {
        const loadingTask = pdfjsLib.getDocument({ data: pdfBytes.slice() });
        const doc = await loadingTask.promise;
        if (cancelled) {
          doc.destroy();
          return;
        }
        pdfDocRef.current = doc;
        setTotalPages(doc.numPages);
      } catch {
        // PDF loading failed — will be handled by PagePreview
      }
    }

    loadDoc();

    return () => {
      cancelled = true;
      pdfDocRef.current?.destroy();
      pdfDocRef.current = null;
    };
  }, [pdfBytes]);

  const currentPageRedactions = allRedactions.filter((r) => r.pageIndex === currentPage);

  const handleAddRedaction = useCallback(
    (rect: Omit<RedactionRect, 'id' | 'source'>) => {
      const newRect: RedactionRect = {
        ...rect,
        id: genId('drawn'),
        pageIndex: currentPage,
        source: 'drawn',
      };
      setAllRedactions((prev) => [...prev, newRect]);
    },
    [currentPage],
  );

  const handleRemoveRedaction = useCallback((id: string) => {
    setAllRedactions((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const handleClearAll = useCallback(() => {
    setAllRedactions([]);
    setSearchResults([]);
  }, []);

  // Text search across all pages
  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    setSearchResults([]);
    setSearchRan(false);

    // Opens the document here rather than reaching for one loaded elsewhere: a
    // ref that has not been populated yet -- or was nulled by a cleanup -- made
    // this return silently, which looks exactly like "no matches".
    let doc: pdfjsLib.PDFDocumentProxy | null = null;
    try {
      doc = await pdfjsLib.getDocument({ data: pdfBytes.slice() }).promise;
      setSearchResults(await findTextMatches(doc, searchQuery));
    } catch {
      setSearchResults([]);
    } finally {
      doc?.destroy();
      setSearchRan(true);
      setIsSearching(false);
    }
  }, [searchQuery, pdfBytes]);

  const handleAddSearchResult = useCallback(
    (match: TextMatch) => {
      // Check if already added
      const existing = allRedactions.find(
        (r) =>
          r.source === 'search' &&
          r.pageIndex === match.pageIndex &&
          Math.abs(r.x - match.x) < 0.5 &&
          Math.abs(r.y - match.y) < 0.5,
      );
      if (existing) return;

      const newRect: RedactionRect = {
        id: genId('search'),
        pageIndex: match.pageIndex,
        x: match.x,
        y: match.y,
        width: match.width,
        height: match.height,
        source: 'search',
      };
      setAllRedactions((prev) => [...prev, newRect]);
    },
    [allRedactions],
  );

  const handleAddAllSearchResults = useCallback(() => {
    const newRects: RedactionRect[] = [];
    for (const match of searchResults) {
      const existing = allRedactions.find(
        (r) =>
          r.source === 'search' &&
          r.pageIndex === match.pageIndex &&
          Math.abs(r.x - match.x) < 0.5 &&
          Math.abs(r.y - match.y) < 0.5,
      );
      if (!existing) {
        newRects.push({
          id: genId('search'),
          pageIndex: match.pageIndex,
          x: match.x,
          y: match.y,
          width: match.width,
          height: match.height,
          source: 'search',
        });
      }
    }
    if (newRects.length > 0) {
      setAllRedactions((prev) => [...prev, ...newRects]);
    }
  }, [searchResults, allRedactions]);

  // Count redactions per page
  const redactionsByPage = new Map<number, number>();
  for (const r of allRedactions) {
    redactionsByPage.set(r.pageIndex, (redactionsByPage.get(r.pageIndex) ?? 0) + 1);
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex flex-1 overflow-hidden">
        {/* Main area: page preview with overlay */}
        <div className="flex-1 flex flex-col items-center overflow-auto p-4 bg-muted/30">
          {/* Page navigation */}
          <div className="flex items-center gap-3 mb-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
              disabled={currentPage === 0}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {currentPage + 1} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={currentPage >= totalPages - 1}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>

          <PagePreview
            pdfBytes={pdfBytes}
            pageIndex={currentPage}
            scale={1.5}
            onDimensionsReady={(dims) => setPageDimensions({ width: dims.width, height: dims.height })}
            className="shadow-md rounded-md border border-border"
          >
            {pageDimensions && (
              <RedactOverlay
                redactions={currentPageRedactions}
                onAddRedaction={handleAddRedaction}
                onRemoveRedaction={handleRemoveRedaction}
                color={boxColor}
                width={pageDimensions.width}
                height={pageDimensions.height}
              />
            )}
          </PagePreview>
        </div>

        {/* Side panel: search + summary */}
        <div className="w-72 flex-none overflow-y-auto border-l border-border p-4 space-y-5">
          <h3 className="text-sm font-semibold text-foreground">Redaction Tools</h3>

          {/* Drawing instructions */}
          <div className="rounded-md border border-border bg-muted/50 px-3 py-2">
            <p className="text-xs text-muted-foreground">
              Draw rectangles on the page to mark areas for redaction. Use text search below to find and redact specific text.
            </p>
          </div>

          {/* Text search */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Text Search</label>
            <div className="flex gap-1.5">
              <input
                type="text"
                placeholder="Search text..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={handleSearch}
                disabled={isSearching || !searchQuery.trim()}
              >
                {isSearching ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Search className="w-3.5 h-3.5" />
                )}
              </Button>
            </div>
          </div>

          {/* Search results */}
          {searchRan && !isSearching && searchResults.length === 0 && (
            <p className="text-xs text-muted-foreground">
              No matches for &ldquo;{searchQuery}&rdquo;. Scanned pages with no
              selectable text — an image-only scan, for instance — cannot be
              searched.
            </p>
          )}

          {searchResults.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground">
                  {searchResults.length} match{searchResults.length !== 1 ? 'es' : ''} found
                </p>
                <button
                  type="button"
                  onClick={handleAddAllSearchResults}
                  className="text-xs text-primary hover:text-primary/80 underline"
                >
                  Add all
                </button>
              </div>
              <div className="max-h-48 overflow-y-auto space-y-1">
                {searchResults.map((match) => {
                  const alreadyAdded = allRedactions.some(
                    (r) =>
                      r.source === 'search' &&
                      r.pageIndex === match.pageIndex &&
                      Math.abs(r.x - match.x) < 0.5 &&
                      Math.abs(r.y - match.y) < 0.5,
                  );
                  return (
                    <div
                      key={match.id}
                      className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5 text-xs"
                    >
                      <span className="flex-none text-muted-foreground">p{match.pageIndex + 1}</span>
                      <span className="flex-1 truncate text-foreground">{match.text}</span>
                      <button
                        type="button"
                        onClick={() => {
                          if (!alreadyAdded) handleAddSearchResult(match);
                          setCurrentPage(match.pageIndex);
                        }}
                        className={
                          alreadyAdded
                            ? 'text-xs text-muted-foreground cursor-default'
                            : 'text-xs text-primary hover:text-primary/80 underline'
                        }
                        disabled={alreadyAdded}
                      >
                        {alreadyAdded ? 'Added' : 'Add'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Box colour */}
          <div className="space-y-2">
            <h4 className="text-xs font-medium text-muted-foreground">Box colour</h4>
            <ColorPicker value={boxColor} onChange={setBoxColor} />
            {isLightColor(boxColor) && (
              // The content underneath is destroyed whatever colour this is --
              // the page is replaced by a flat image. What a pale box costs is
              // the reader's ability to tell that anything was removed at all.
              <p className="text-xs text-amber-600 dark:text-amber-400">
                A box this pale is hard to see on a white page. The content
                underneath is still permanently removed.
              </p>
            )}
          </div>

          {/* Redaction summary */}
          <div className="space-y-2">
            <h4 className="text-xs font-medium text-muted-foreground">Summary</h4>
            <div className="rounded-md border border-border px-3 py-2 space-y-1">
              <p className="text-sm font-semibold text-foreground">
                {allRedactions.length} redaction{allRedactions.length !== 1 ? 's' : ''}
              </p>
              {redactionsByPage.size > 0 && (
                <div className="text-xs text-muted-foreground">
                  {Array.from(redactionsByPage.entries())
                    .sort((a, b) => a[0] - b[0])
                    .map(([page, count]) => (
                      <span key={page} className="mr-2">
                        Page {page + 1}: {count}
                      </span>
                    ))}
                </div>
              )}
            </div>
          </div>

          {/* Clear all */}
          {allRedactions.length > 0 && (
            <Button variant="outline" size="sm" onClick={handleClearAll} className="w-full">
              <Trash2 className="w-3.5 h-3.5 mr-1.5" />
              Clear All
            </Button>
          )}
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-border bg-background px-4 py-3 flex items-center gap-3 flex-none">
        <Button variant="outline" size="sm" onClick={onBack} className="flex-none">
          Back
        </Button>
        <div className="flex-1" />
        <Button
          size="sm"
          onClick={() => onComplete(allRedactions, boxColor)}
          disabled={allRedactions.length === 0}
        >
          Apply Redactions ({allRedactions.length})
        </Button>
      </div>
    </div>
  );
}
