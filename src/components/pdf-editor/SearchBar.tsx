// SearchBar: find text across the whole document, from the editor's toolbar row.
//
// Sits beside the font controls but is deliberately not part of them: those act
// on the selected text block and grey out when nothing is selected, while search
// is document-level and has to stay live.
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { ChevronDown, ChevronUp, ScanText, Search, X, Loader2 } from 'lucide-react';
import { useEditorContext } from '@/context/EditorContext';
import { useDocumentSearch } from '@/hooks/useDocumentSearch';
import { listOcrLanguages } from '@/lib/ocrLanguages';
import { isToolAvailableHere } from '@/lib/platform';
import { TOOL_REGISTRY } from '@/types/tools';
import { useLocale } from '@/i18n/context';
import { t } from '@/i18n';

export function SearchBar() {
  const { state, setSearchMatches, setSearchCurrent, setCurrentPage, scrollToPageRef } =
    useEditorContext();
  const locale = useLocale();
  const inputRef = useRef<HTMLInputElement>(null);
  const search = useDocumentSearch(state.pdfBytes);

  const { matches, searched, isSearching, isScanRead, isReadingScan, scanError } = search;

  // Publish results to the canvas: the highlights are drawn by a layer on each
  // page, not by this control.
  useEffect(() => {
    setSearchMatches(matches);
  }, [matches, setSearchMatches]);

  /**
   * Which language to read a scan in.
   *
   * Taken from the interface language rather than asked for: someone who has
   * just been told their page cannot be searched wants it searched, not a second
   * form to fill in. The full picker stays in the Make Searchable panel for
   * anyone whose document is in a language other than the one they read.
   */
  const ocrLanguageRef = useRef('en-US');
  useEffect(() => {
    let cancelled = false;
    listOcrLanguages(locale).then((available) => {
      if (cancelled) return;
      const match = available.find((l) => l.tag.split('-')[0] === locale.split('-')[0]);
      ocrLanguageRef.current = match?.tag ?? 'en-US';
    });
    return () => { cancelled = true; };
  }, [locale]);

  const goTo = useCallback(
    (index: number) => {
      setSearchCurrent(index);
    },
    [setSearchCurrent],
  );

  // Follow the current match onto its page. Reads from state rather than from
  // the click handler so it also fires for the first result of a fresh search.
  // Absent as well as empty: EditorViewState objects built by older test
  // harnesses have no search fields, and the toolbar has to render regardless.
  const current = (state.searchMatches ?? [])[state.searchCurrent];
  const currentPage = current?.pageIndex;
  useEffect(() => {
    if (currentPage === undefined) return;
    setCurrentPage(currentPage);
    scrollToPageRef.current?.(currentPage);
  }, [currentPage, setCurrentPage, scrollToPageRef]);

  const handleClear = useCallback(() => {
    search.setQuery('');
    search.clear();
    setSearchMatches([]);
  }, [search, setSearchMatches]);

  // Cmd/Ctrl+F focuses the field, the way it does in every other reader.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const counter = useMemo(
    () =>
      matches.length > 0
        ? t('search.currentOfTotal', { current: (state.searchCurrent ?? -1) + 1, total: matches.length })
        : null,
    [matches.length, state.searchCurrent],
  );

  // Read per render, not once at module load. navigator.userAgent is synchronous
  // and constant for the session, so this cannot cause the appear-then-vanish
  // flicker an async lookup would -- and unlike a module-scope constant, a test
  // can stub the platform it is exercising.
  const canReadScans = isToolAvailableHere(TOOL_REGISTRY['ocr-pdf']);

  /** A scan is only worth offering to read once, and only when nothing was found.
   *  On a platform with no OCR engine it is never worth offering at all. */
  const offerScanRead =
    canReadScans && searched && !isSearching && matches.length === 0 && !isScanRead;

  return (
    <div className="relative flex items-center gap-1">
      <div className="relative flex items-center">
        <Search className="pointer-events-none absolute start-2 h-3 w-3 text-muted-foreground" />
        <input
          ref={inputRef}
          type="search"
          value={search.query}
          onChange={(e) => search.setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') { handleClear(); return; }
            if (e.key !== 'Enter') return;
            e.preventDefault();
            // Enter runs the search the first time and steps through it after.
            if (searched && matches.length > 0) goTo(state.searchCurrent + (e.shiftKey ? -1 : 1));
            else void search.search();
          }}
          placeholder={t('search.placeholder')}
          aria-label={t('search.placeholder')}
          className="h-7 w-40 rounded border border-border bg-background ps-7 pe-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      {isSearching && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}

      {counter && (
        <>
          <span className="text-[10px] tabular-nums text-muted-foreground">{counter}</span>
          <button
            type="button"
            onClick={() => goTo(state.searchCurrent - 1)}
            title={t('search.previous')}
            aria-label={t('search.previous')}
            className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => goTo(state.searchCurrent + 1)}
            title={t('search.next')}
            aria-label={t('search.next')}
            className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        </>
      )}

      {search.query && (
        <button
          type="button"
          onClick={handleClear}
          title={t('search.clear')}
          aria-label={t('search.clear')}
          className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}

      {/* Nothing found. On a scan that is not a result, it is a missing text
          layer -- searching again cannot help, reading the page can. */}
      {(offerScanRead || (searched && matches.length === 0)) && (
        <div className="absolute top-full end-0 z-20 mt-1 w-72 rounded border border-border bg-popover p-2 shadow-md">
          <p className="text-[11px] text-muted-foreground">
            {isScanRead
              ? t('search.noMatchesInScan', { query: search.query })
              : t('search.noMatches', { query: search.query })}
          </p>
          {offerScanRead && (
            <>
              <button
                type="button"
                onClick={() => void search.readScanAndSearch(ocrLanguageRef.current)}
                disabled={isReadingScan}
                className="mt-2 flex w-full items-center justify-center gap-1.5 rounded border border-border px-2 py-1 text-[11px] hover:bg-muted disabled:opacity-50"
              >
                {isReadingScan ? (
                  <><Loader2 className="h-3 w-3 animate-spin" />{t('redactPdf.readingScan')}</>
                ) : (
                  <><ScanText className="h-3 w-3" />{t('redactPdf.readScanAndSearch')}</>
                )}
              </button>
              <p className="mt-1 text-[10px] text-muted-foreground/70">{t('search.readScanHint')}</p>
            </>
          )}
          {scanError && <p className="mt-1 text-[11px] text-destructive">{scanError}</p>}
        </div>
      )}
    </div>
  );
}
