import { useCallback, useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { findTextMatches, type TextMatch } from '@/lib/pdfTextSearch';
import { findTextMatchesInOcr } from '@/lib/ocrTextSearch';
import { recognisePdf, type OcrPage } from '@/lib/ocrProcessor';

/**
 * Find text in a PDF, and read it first when there is nothing to find.
 *
 * Shared by the editor's toolbar search and its redact panel so the two cannot
 * disagree -- which they did: the standalone redact tool offered to read a scan
 * when a search came back empty, and the editor's copy of the same panel just
 * said scans "cannot be searched" and stopped there. A dead end in one place and
 * a way forward in the other, for the same document.
 *
 * The OCR pass is the point. On a scanned page pdf.js has nothing to return, so
 * searching harder cannot help; reading the page is what makes the search
 * possible at all.
 */
export interface DocumentSearch {
  query: string;
  setQuery: (value: string) => void;
  matches: TextMatch[];
  /** True once a search has completed, so "no matches" is distinguishable from
   *  "nothing searched yet" -- the two want very different copy. */
  searched: boolean;
  isSearching: boolean;
  /** The document has been read by OCR, so searches now run against that text. */
  isScanRead: boolean;
  isReadingScan: boolean;
  scanError: string | null;
  search: () => Promise<void>;
  readScanAndSearch: (language: string) => Promise<void>;
  clear: () => void;
}

/** Writes bytes somewhere OCR can open them: it reads a path, the editor holds bytes. */
async function withTempPdf<T>(bytes: Uint8Array, run: (path: string) => Promise<T>): Promise<T> {
  const { tempDir, join } = await import('@tauri-apps/api/path');
  const { writeFile, remove } = await import('@tauri-apps/plugin-fs');
  const path = await join(await tempDir(), `papercut_search_${Date.now()}.pdf`);
  await writeFile(path, bytes);
  try {
    return await run(path);
  } finally {
    await remove(path).catch(() => {});
  }
}

export function useDocumentSearch(pdfBytes: Uint8Array): DocumentSearch {
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<TextMatch[]>([]);
  const [searched, setSearched] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [ocrPages, setOcrPages] = useState<OcrPage[] | null>(null);
  const [isReadingScan, setIsReadingScan] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  const clear = useCallback(() => {
    setMatches([]);
    setSearched(false);
    setScanError(null);
  }, []);

  // An edit changes the document under the results: a match found before a page
  // was deleted points at a page that has moved or gone. Stale highlights on the
  // wrong words are worse than none, so they are dropped rather than kept.
  //
  // Keyed on identity, which is right for the editor -- `state.pdfBytes` is
  // replaced only by UPDATE_PDF_BYTES, so a new reference means a new document.
  // The updates are functional and return the previous value unchanged when
  // there is nothing to clear: a caller that hands over a freshly built array on
  // every render would otherwise set state, re-render, and set it again forever.
  // That is a caller bug either way, but it should degrade to a cleared search
  // rather than a hung tab.
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    setMatches((prev) => (prev.length > 0 ? [] : prev));
    setSearched((prev) => (prev ? false : prev));
    setOcrPages((prev) => (prev !== null ? null : prev));
  }, [pdfBytes]);

  const search = useCallback(async () => {
    if (!query.trim()) return;
    setIsSearching(true);
    setMatches([]);
    setSearched(false);

    // Once a scan has been read, search what was read. Asking pdf.js again
    // returns nothing however many times it is asked.
    if (ocrPages) {
      setMatches(findTextMatchesInOcr(ocrPages, query));
      setSearched(true);
      setIsSearching(false);
      return;
    }

    // Opened here rather than shared from elsewhere: pdf.js transfers the buffer
    // to its worker, so a document built from these bytes elsewhere may hold a
    // detached one. `.slice()` for the same reason.
    let doc: pdfjsLib.PDFDocumentProxy | null = null;
    try {
      doc = await pdfjsLib.getDocument({ data: pdfBytes.slice() }).promise;
      setMatches(await findTextMatches(doc, query));
    } catch {
      setMatches([]);
    } finally {
      doc?.destroy();
      setSearched(true);
      setIsSearching(false);
    }
  }, [query, pdfBytes, ocrPages]);

  const readScanAndSearch = useCallback(
    async (language: string) => {
      setIsReadingScan(true);
      setScanError(null);
      try {
        const pages = await withTempPdf(pdfBytes, (path) =>
          recognisePdf(path, { languages: [language] }),
        );
        setOcrPages(pages);
        setMatches(findTextMatchesInOcr(pages, query));
        setSearched(true);
      } catch (err) {
        setScanError(err instanceof Error ? err.message : String(err));
      } finally {
        setIsReadingScan(false);
      }
    },
    [pdfBytes, query],
  );

  return {
    query, setQuery, matches, searched, isSearching,
    isScanRead: ocrPages !== null, isReadingScan, scanError,
    search, readScanAndSearch, clear,
  };
}
