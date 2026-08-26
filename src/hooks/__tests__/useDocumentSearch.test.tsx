// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import * as pdfjsLib from 'pdfjs-dist';
import { useDocumentSearch } from '@/hooks/useDocumentSearch';
import { findTextMatches } from '@/lib/pdfTextSearch';
import { findTextMatchesInOcr } from '@/lib/ocrTextSearch';
import { recognisePdf } from '@/lib/ocrProcessor';

vi.mock('pdfjs-dist', () => ({
  getDocument: vi.fn(),
  GlobalWorkerOptions: { workerSrc: '' },
}));
vi.mock('@/lib/pdfTextSearch', () => ({ findTextMatches: vi.fn() }));
vi.mock('@/lib/ocrTextSearch', () => ({ findTextMatchesInOcr: vi.fn() }));
vi.mock('@/lib/ocrProcessor', () => ({ recognisePdf: vi.fn() }));
vi.mock('@tauri-apps/api/path', () => ({
  tempDir: vi.fn().mockResolvedValue('/tmp'),
  join: vi.fn(async (...parts: string[]) => parts.join('/')),
}));
vi.mock('@tauri-apps/plugin-fs', () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
  remove: vi.fn().mockResolvedValue(undefined),
}));

// Stable references: the hook treats a new Uint8Array identity as a new
// document and drops its results, which is the contract SRCH-07 pins down.
const BYTES = new Uint8Array([1, 2, 3]);
const ONE = new Uint8Array([1]);

const destroy = vi.fn();
function match(text: string, pageIndex = 0) {
  return { id: text, pageIndex, text, x: 0, y: 0, width: 1, height: 1,
    line: { x: 0, y: 0, width: 1, height: 1 } };
}

beforeEach(() => {
  vi.mocked(pdfjsLib.getDocument).mockReturnValue(
    { promise: Promise.resolve({ numPages: 1, destroy }) } as never,
  );
  vi.mocked(findTextMatches).mockResolvedValue([]);
  vi.mocked(findTextMatchesInOcr).mockReturnValue([]);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('useDocumentSearch', () => {
  it('[SRCH-01] finds text in a document with a text layer', async () => {
    vi.mocked(findTextMatches).mockResolvedValue([match('invoice')]);
    const { result } = renderHook(({ bytes }) => useDocumentSearch(bytes), { initialProps: { bytes: BYTES } });

    act(() => result.current.setQuery('invoice'));
    await act(() => result.current.search());

    expect(result.current.matches).toHaveLength(1);
    expect(result.current.searched).toBe(true);
  });

  it('[SRCH-02] passes a copy of the bytes to pdf.js', async () => {
    // pdf.js transfers the ArrayBuffer to its worker. Handing it the editor's
    // own array detaches the buffer the canvas is still rendering from.
    const bytes = new Uint8Array([1, 2, 3]);
    const { result } = renderHook(() => useDocumentSearch(bytes));

    act(() => result.current.setQuery('x'));
    await act(() => result.current.search());

    const passed = vi.mocked(pdfjsLib.getDocument).mock.calls[0][0] as { data: Uint8Array };
    expect(passed.data).not.toBe(BYTES);
    expect(Array.from(passed.data)).toEqual([1, 2, 3]);
  });

  it('[SRCH-03] an empty query does not open the document at all', async () => {
    const { result } = renderHook(({ bytes }) => useDocumentSearch(bytes), { initialProps: { bytes: ONE } });

    act(() => result.current.setQuery('   '));
    await act(() => result.current.search());

    expect(pdfjsLib.getDocument).not.toHaveBeenCalled();
  });

  it('[SRCH-04] reading a scan makes a previously unsearchable page searchable', async () => {
    // The whole reason OCR belongs behind search: pdf.js returns nothing for a
    // scan no matter how often it is asked.
    vi.mocked(findTextMatches).mockResolvedValue([]);
    vi.mocked(recognisePdf).mockResolvedValue([{ pageIndex: 0, width: 1, height: 1, words: [] }] as never);
    vi.mocked(findTextMatchesInOcr).mockReturnValue([match('passport')]);

    const { result } = renderHook(({ bytes }) => useDocumentSearch(bytes), { initialProps: { bytes: ONE } });
    act(() => result.current.setQuery('passport'));
    await act(() => result.current.search());
    expect(result.current.matches).toEqual([]);

    await act(() => result.current.readScanAndSearch('en-US'));

    expect(result.current.matches).toHaveLength(1);
    expect(result.current.isScanRead).toBe(true);
  });

  it('[SRCH-05] once read, later searches use the scan and never reopen the PDF', async () => {
    vi.mocked(recognisePdf).mockResolvedValue([] as never);
    const { result } = renderHook(({ bytes }) => useDocumentSearch(bytes), { initialProps: { bytes: ONE } });

    act(() => result.current.setQuery('a'));
    await act(() => result.current.readScanAndSearch('en-US'));
    vi.mocked(pdfjsLib.getDocument).mockClear();

    act(() => result.current.setQuery('b'));
    await act(() => result.current.search());

    expect(pdfjsLib.getDocument).not.toHaveBeenCalled();
    expect(findTextMatchesInOcr).toHaveBeenCalledWith(expect.anything(), 'b');
  });

  it('[SRCH-06] a failed read reports why and leaves the document unread', async () => {
    vi.mocked(recognisePdf).mockRejectedValue(new Error('no recognition engine'));
    const { result } = renderHook(({ bytes }) => useDocumentSearch(bytes), { initialProps: { bytes: ONE } });

    act(() => result.current.setQuery('a'));
    await act(() => result.current.readScanAndSearch('en-US'));

    expect(result.current.scanError).toBe('no recognition engine');
    expect(result.current.isScanRead).toBe(false);
  });

  it('[SRCH-07] editing the document drops the results', async () => {
    // A match found before a page was deleted points at a page that has moved or
    // gone. A highlight on the wrong word is worse than no highlight.
    vi.mocked(findTextMatches).mockResolvedValue([match('invoice')]);
    const { result, rerender } = renderHook(({ bytes }) => useDocumentSearch(bytes), {
      initialProps: { bytes: new Uint8Array([1]) },
    });

    act(() => result.current.setQuery('invoice'));
    await act(() => result.current.search());
    expect(result.current.matches).toHaveLength(1);

    rerender({ bytes: new Uint8Array([9, 9]) });

    expect(result.current.matches).toEqual([]);
    expect(result.current.searched).toBe(false);
  });

  it('[SRCH-08] the temp file written for OCR is always removed', async () => {
    const { remove } = await import('@tauri-apps/plugin-fs');
    vi.mocked(recognisePdf).mockRejectedValue(new Error('boom'));
    const { result } = renderHook(({ bytes }) => useDocumentSearch(bytes), { initialProps: { bytes: ONE } });

    await act(() => result.current.readScanAndSearch('en-US'));

    // Even when recognition throws: the document is the user's, and leaving a
    // copy of it in temp is a privacy leak, not just untidiness.
    expect(remove).toHaveBeenCalled();
  });
});
