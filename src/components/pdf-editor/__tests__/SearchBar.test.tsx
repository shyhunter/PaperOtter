// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect, useRef } from 'react';
import { EditorProvider, useEditorContext, createEditorViewState } from '@/context/EditorContext';
import { SearchBar } from '@/components/pdf-editor/SearchBar';
import { SearchHighlightLayer } from '@/components/pdf-editor/SearchHighlightLayer';
import { findTextMatches } from '@/lib/pdfTextSearch';
import { findTextMatchesInOcr } from '@/lib/ocrTextSearch';
import { recognisePdf } from '@/lib/ocrProcessor';

/**
 * OCR is macOS-only (Vision), and the platform gate in src/lib/platform.ts now
 * hides every OCR entry point elsewhere. jsdom's default user agent is not a
 * Mac, so these tests must say which platform they are exercising -- otherwise
 * they assert on an offer the gate correctly withholds.
 */
Object.defineProperty(window.navigator, 'userAgent', {
  value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
  configurable: true,
});


vi.mock('pdfjs-dist', () => ({
  getDocument: vi.fn(() => ({ promise: Promise.resolve({ numPages: 3, destroy: vi.fn() }) })),
  GlobalWorkerOptions: { workerSrc: '' },
}));
vi.mock('@/lib/pdfTextSearch', () => ({ findTextMatches: vi.fn() }));
vi.mock('@/lib/ocrTextSearch', () => ({ findTextMatchesInOcr: vi.fn() }));
vi.mock('@/lib/ocrProcessor', () => ({ recognisePdf: vi.fn() }));
vi.mock('@/lib/ocrLanguages', () => ({
  listOcrLanguages: vi.fn().mockResolvedValue([{ tag: 'en-US', name: 'English' }]),
  nameForLanguageTag: vi.fn((tag: string) => tag),
}));
vi.mock('@tauri-apps/api/path', () => ({
  tempDir: vi.fn().mockResolvedValue('/tmp'),
  join: vi.fn(async (...parts: string[]) => parts.join('/')),
}));
vi.mock('@tauri-apps/plugin-fs', () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
  remove: vi.fn().mockResolvedValue(undefined),
}));

function match(text: string, pageIndex: number) {
  return { id: `${text}-${pageIndex}`, pageIndex, text, x: 10, y: 20, width: 5, height: 2,
    line: { x: 0, y: 20, width: 100, height: 2 } };
}

function Harness() {
  const ctx = useEditorContext();
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    ctx.initState(createEditorViewState(new Uint8Array([0x25, 0x50, 0x44, 0x46]), 3, 'a.pdf', '/tmp/a.pdf', 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

function renderSearch() {
  return render(
    <EditorProvider>
      <Harness />
      <SearchBar />
      <SearchHighlightLayer pageIndex={1} />
    </EditorProvider>,
  );
}

beforeEach(() => {
  vi.mocked(findTextMatches).mockResolvedValue([]);
  vi.mocked(findTextMatchesInOcr).mockReturnValue([]);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('Suite SRCH — find text in the editor', () => {
  it('[SRCH-09] Enter searches and reports how many were found', async () => {
    const user = userEvent.setup();
    vi.mocked(findTextMatches).mockResolvedValue([match('invoice', 0), match('invoice', 1)]);
    renderSearch();

    await user.type(screen.getByRole('searchbox'), 'invoice{Enter}');

    expect(await screen.findByText('1 of 2')).toBeInTheDocument();
  });

  it('[SRCH-10] next wraps from the last match back to the first', async () => {
    const user = userEvent.setup();
    vi.mocked(findTextMatches).mockResolvedValue([match('a', 0), match('a', 1)]);
    renderSearch();

    await user.type(screen.getByRole('searchbox'), 'a{Enter}');
    await screen.findByText('1 of 2');

    await user.click(screen.getByRole('button', { name: /next match/i }));
    expect(screen.getByText('2 of 2')).toBeInTheDocument();

    // Wrapping is what every find bar does; stopping dead at the end is a bug
    // report from anyone who has used one before.
    await user.click(screen.getByRole('button', { name: /next match/i }));
    expect(screen.getByText('1 of 2')).toBeInTheDocument();
  });

  it('[SRCH-11] previous wraps backwards from the first match', async () => {
    const user = userEvent.setup();
    vi.mocked(findTextMatches).mockResolvedValue([match('a', 0), match('a', 1)]);
    renderSearch();

    await user.type(screen.getByRole('searchbox'), 'a{Enter}');
    await screen.findByText('1 of 2');

    await user.click(screen.getByRole('button', { name: /previous match/i }));
    expect(screen.getByText('2 of 2')).toBeInTheDocument();
  });

  it('[SRCH-12] only the matches on this page are drawn, and the current one differs', async () => {
    const user = userEvent.setup();
    vi.mocked(findTextMatches).mockResolvedValue([
      match('a', 0), match('a', 1), match('b', 1),
    ]);
    const { container } = renderSearch();

    await user.type(screen.getByRole('searchbox'), 'a{Enter}');
    await screen.findByText('1 of 3');

    // The layer is mounted for page 1, so only the two matches on page 1 appear.
    const highlights = container.querySelectorAll('[aria-hidden="true"] > div');
    expect(highlights).toHaveLength(2);

    // Current is match 0, which is on page 0 — so nothing on this page is the
    // current one, and none of these carry the current styling.
    expect([...highlights].filter((h) => h.className.includes('orange'))).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: /next match/i }));
    await waitFor(() => {
      const after = container.querySelectorAll('[aria-hidden="true"] > div');
      expect([...after].filter((h) => h.className.includes('orange'))).toHaveLength(1);
    });
  });

  it('[SRCH-13] boxes are positioned as percentages so zoom cannot move them', async () => {
    const user = userEvent.setup();
    vi.mocked(findTextMatches).mockResolvedValue([match('a', 1)]);
    const { container } = renderSearch();

    await user.type(screen.getByRole('searchbox'), 'a{Enter}');
    await screen.findByText('1 of 1');

    const box = container.querySelector('[aria-hidden="true"] > div') as HTMLElement;
    expect(box.style.left).toBe('10%');
    expect(box.style.top).toBe('20%');
    expect(box.style.width).toBe('5%');
  });

  it('[SRCH-14] a scan offers to be read, and reading it finds the text', async () => {
    // The reason OCR belongs behind search: this is a page pdf.js can say
    // nothing about, so searching again is not the answer.
    const user = userEvent.setup();
    vi.mocked(findTextMatches).mockResolvedValue([]);
    vi.mocked(recognisePdf).mockResolvedValue([{ pageIndex: 0, width: 1, height: 1, words: [] }] as never);
    vi.mocked(findTextMatchesInOcr).mockReturnValue([match('passport', 1)]);
    renderSearch();

    await user.type(screen.getByRole('searchbox'), 'passport{Enter}');
    const offer = await screen.findByRole('button', { name: /read the text and search again/i });

    await user.click(offer);

    expect(await screen.findByText('1 of 1')).toBeInTheDocument();
    // Reads a temp copy, not state.filePath: the editor's bytes have usually
    // moved on from whatever is on disk.
    expect(recognisePdf).toHaveBeenCalledWith(
      expect.stringMatching(/^\/tmp\/papercut_search_\d+\.pdf$/),
      { languages: ['en-US'] },
    );
  });

  it('[SRCH-15] once read, the offer is gone and the wording changes', async () => {
    const user = userEvent.setup();
    vi.mocked(findTextMatches).mockResolvedValue([]);
    vi.mocked(recognisePdf).mockResolvedValue([] as never);
    vi.mocked(findTextMatchesInOcr).mockReturnValue([]);
    renderSearch();

    await user.type(screen.getByRole('searchbox'), 'ghost{Enter}');
    await user.click(await screen.findByRole('button', { name: /read the text and search again/i }));

    // Still nothing — but "no text to search" and "searched the text and it is
    // not there" are different facts, and offering the read a second time would
    // be asking the user to repeat something that already happened.
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /read the text and search again/i })).toBeNull();
    });
    expect(screen.getByText(/in the text read from this scan/i)).toBeInTheDocument();
  });

  it('[SRCH-16] clearing removes the highlights from the page', async () => {
    const user = userEvent.setup();
    vi.mocked(findTextMatches).mockResolvedValue([match('a', 1)]);
    const { container } = renderSearch();

    await user.type(screen.getByRole('searchbox'), 'a{Enter}');
    await screen.findByText('1 of 1');

    await user.click(screen.getByRole('button', { name: /clear search/i }));

    await waitFor(() => {
      expect(container.querySelectorAll('[aria-hidden="true"] > div')).toHaveLength(0);
    });
  });
});
