// @vitest-environment jsdom
/**
 * Tests for EditorCanvas — PDF page virtualization and page navigation.
 *
 * Acceptance criteria from the bug report:
 *   - When you click on a page in the page-panel side menu after the 5th page,
 *     that page must also be shown (rendered) in the main edit canvas.
 *
 * Root cause: EditorCanvas uses a VIRTUALIZATION_WINDOW of 3, so only pages
 * within ±3 positions of currentPage are rendered.  Originally, updating
 * currentPage relied solely on the IntersectionObserver which could be delayed
 * or not fire correctly (e.g. in WKWebView / Tauri).  The fix is to call
 * setCurrentPage(idx) immediately inside scrollToPageRef so the target page
 * enters the render window right away.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, act, waitFor } from '@testing-library/react';
import { useEffect, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { EditorCanvas } from '@/components/pdf-editor/EditorCanvas';
import {
  EditorProvider,
  useEditorContext,
  createEditorViewState,
} from '@/context/EditorContext';

afterEach(cleanup);

// ── Mocks ─────────────────────────────────────────────────────────────────────

// Mock TextEditingLayer — not needed for navigation tests.
vi.mock('@/components/pdf-editor/TextEditingLayer', () => ({
  TextEditingLayer: () => null,
}));

// Mock pdfjs-dist — canvas rendering is unavailable in jsdom.
vi.mock('pdfjs-dist', () => {
  const mockPage = {
    getViewport: vi.fn().mockReturnValue({ width: 612, height: 792 }),
    render: vi.fn().mockReturnValue({ promise: Promise.resolve() }),
  };
  const mockPdfDoc = {
    numPages: 10,
    getPage: vi.fn().mockResolvedValue(mockPage),
    destroy: vi.fn(),
  };
  return {
    getDocument: vi.fn().mockReturnValue({ promise: Promise.resolve(mockPdfDoc) }),
    GlobalWorkerOptions: { workerSrc: '' },
  };
});

// Stub IntersectionObserver — not available in jsdom.
// Must be a class (not an arrow function) because components instantiate it with `new`.
vi.stubGlobal(
  'IntersectionObserver',
  class IntersectionObserver {
    observe = vi.fn();
    disconnect = vi.fn();
    unobserve = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-useless-constructor
    constructor(_callback: IntersectionObserverCallback, _options?: IntersectionObserverInit) {}
  },
);

// Stub ResizeObserver — not available in jsdom.
// Must be a class (not an arrow function) because components instantiate it with `new`.
vi.stubGlobal(
  'ResizeObserver',
  class ResizeObserver {
    observe = vi.fn();
    disconnect = vi.fn();
    unobserve = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-useless-constructor
    constructor(_callback: ResizeObserverCallback) {}
  },
);

// Stub scrollIntoView — not implemented in jsdom.
const scrollIntoViewMock = vi.fn();
beforeEach(() => {
  scrollIntoViewMock.mockClear();
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    writable: true,
    value: scrollIntoViewMock,
  });
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Minimal non-empty PDF bytes (header only — pdfjs-dist is mocked). */
function fakePdfBytes(): Uint8Array {
  return new Uint8Array([0x25, 0x50, 0x44, 0x46]); // %PDF
}

type EditorCtx = ReturnType<typeof useEditorContext>;

/**
 * Renders EditorCanvas inside an EditorProvider and initialises the context
 * with a fake PDF of `pageCount` pages.  `onContextReady` is called every
 * render cycle with the current context value so tests can read or mutate it.
 */
function CanvasWithContext({
  pageCount = 10,
  onContextReady,
}: {
  pageCount?: number;
  onContextReady?: (ctx: EditorCtx) => void;
}) {
  const ctx = useEditorContext();
  const initialised = useRef(false);

  useEffect(() => {
    if (!initialised.current) {
      initialised.current = true;
      ctx.initState(
        createEditorViewState(
          fakePdfBytes(),
          pageCount,
          'test.pdf',
          '/tmp/test.pdf',
          1.0,
        ),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Expose context to the test on every render.
  useEffect(() => {
    onContextReady?.(ctx);
  });

  return <EditorCanvas />;
}

function renderWithProvider(
  pageCount: number,
  onContextReady: (ctx: EditorCtx) => void,
) {
  return render(
    <EditorProvider>
      <CanvasWithContext pageCount={pageCount} onContextReady={onContextReady} />
    </EditorProvider>,
  );
}

// ── Virtualization tests ──────────────────────────────────────────────────────

describe('EditorCanvas — virtualization', () => {
  it('EC-01: pages beyond the virtualization window show a numeric placeholder', async () => {
    // VIRTUALIZATION_WINDOW = 3, initial currentPage = 0.
    // Pages 0–3 are rendered; pages 4–9 show a placeholder with the page number.
    renderWithProvider(10, () => {});

    // Wait for pageInfos to load (async via mocked pdfjs-dist).
    await waitFor(() => {
      // Page 8 (idx=7) is outside the window → should show its page number.
      expect(screen.getByText('8')).toBeInTheDocument();
    });

    // Page 10 (idx=9) should also be a placeholder.
    expect(screen.getByText('10')).toBeInTheDocument();
  });

  it('EC-02: page 5 (idx=4) is a placeholder when starting on page 1', async () => {
    // |4 - 0| = 4 > VIRTUALIZATION_WINDOW(3) → placeholder for the 5th page.
    renderWithProvider(10, () => {});

    await waitFor(() => {
      expect(screen.getByText('5')).toBeInTheDocument();
    });

    // The page-5 div should contain a plain number, not a canvas.
    const page5Placeholder = screen.getByText('5');
    expect(page5Placeholder.tagName).not.toBe('CANVAS');
  });

  it('EC-09: multiple simultaneously-visible pages share one parsed document, not one each', async () => {
    // Regression: PageCanvasRenderer called pdfjsLib.getDocument() (a full parse,
    // including a full-size copy of the document's bytes) independently for every
    // single visible page. With the ±3 virtualization window, that alone meant
    // several concurrent full-document re-parses at once — and again every time
    // the visible window shifted while scrolling. For a large, image-heavy real
    // document this was expensive enough, repeated often enough, to make the app
    // unresponsive to clicks for extended stretches. Pages 0-3 (4 pages) are
    // within the default virtualization window around page 0 and render at once.
    vi.mocked(pdfjsLib.getDocument).mockClear();

    renderWithProvider(10, () => {});

    await waitFor(() => expect(screen.getByText('8')).toBeInTheDocument());
    // Let all four in-window pages finish their (debounced) render.
    await new Promise((r) => setTimeout(r, 250));

    // One parse for placeholder dimensions + one shared parse reused by every
    // visible page's canvas render — never one per visible page.
    expect(vi.mocked(pdfjsLib.getDocument).mock.calls.length).toBeLessThanOrEqual(2);
  });
});

// ── Navigation tests ──────────────────────────────────────────────────────────

describe('EditorCanvas — scrollToPageRef navigation', () => {
  it('EC-03: scrollToPageRef immediately sets currentPage without waiting for IntersectionObserver', async () => {
    let latestCtx: EditorCtx | null = null;

    renderWithProvider(10, (ctx) => {
      latestCtx = ctx;
    });

    // Wait for context to be initialised.
    await waitFor(() => expect(latestCtx?.state.pageCount).toBe(10));
    expect(latestCtx!.state.currentPage).toBe(0);

    // Navigate to page 7 (zero-based idx = 6) — well past the 5th page.
    await act(async () => {
      latestCtx!.scrollToPageRef.current?.(6);
    });

    // currentPage must be updated to 6 immediately (the core fix).
    expect(latestCtx!.state.currentPage).toBe(6);
  });

  it('EC-04: after navigating to page 7, that page is within the render window', async () => {
    const VIRTUALIZATION_WINDOW = 3;
    let latestCtx: EditorCtx | null = null;

    renderWithProvider(10, (ctx) => {
      latestCtx = ctx;
    });

    await waitFor(() => expect(latestCtx?.state.pageCount).toBe(10));

    // Navigate to page 7 (idx=6).
    await act(async () => {
      latestCtx!.scrollToPageRef.current?.(6);
    });

    const currentPage = latestCtx!.state.currentPage;
    expect(currentPage).toBe(6);

    // Page 7 (idx=6) must be within [currentPage - WINDOW, currentPage + WINDOW].
    expect(Math.abs(6 - currentPage)).toBeLessThanOrEqual(VIRTUALIZATION_WINDOW);

    // Page 1 (idx=0) is now outside the window: |0 - 6| = 6 > 3.
    expect(Math.abs(0 - currentPage)).toBeGreaterThan(VIRTUALIZATION_WINDOW);
  });

  it('EC-05: scrollToPageRef calls scrollIntoView on the target page element', async () => {
    let latestCtx: EditorCtx | null = null;

    renderWithProvider(10, (ctx) => {
      latestCtx = ctx;
    });

    await waitFor(() => expect(latestCtx?.state.pageCount).toBe(10));

    // Wait for pageInfos so page elements are in the DOM.
    await waitFor(() => expect(screen.queryByText('9')).toBeInTheDocument());

    scrollIntoViewMock.mockClear();

    // Navigate to page 9 (idx=8) — well beyond the 5th page.
    await act(async () => {
      latestCtx!.scrollToPageRef.current?.(8);
    });

    // scrollIntoView must be called to bring the page into the viewport.
    expect(scrollIntoViewMock).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'start',
    });
  });

  it('EC-06: navigating to the last page (idx=9) updates currentPage to 9', async () => {
    let latestCtx: EditorCtx | null = null;

    renderWithProvider(10, (ctx) => {
      latestCtx = ctx;
    });

    await waitFor(() => expect(latestCtx?.state.pageCount).toBe(10));

    await act(async () => {
      latestCtx!.scrollToPageRef.current?.(9);
    });

    expect(latestCtx!.state.currentPage).toBe(9);
  });
});

describe('EditorCanvas — large PDF page-dimension loading', () => {
  it('EC-07: for docs over 50 pages, only page 1 is fetched for placeholder dimensions', async () => {
    // Regression: fetching every page's real dimensions up front — even one page
    // at a time with a yield in between — meant hundreds of sequential pdf.js
    // calls that starved click handling for the whole loading window on a real
    // 688-page PDF. Placeholder sizing now uses page 1's dimensions for every
    // page; PageCanvasRenderer still renders each page at its own real size once
    // it's actually scrolled into view.
    const mockPage = {
      getViewport: vi.fn().mockReturnValue({ width: 612, height: 792 }),
      render: vi.fn().mockReturnValue({ promise: Promise.resolve() }),
    };
    const mockPdfDoc = {
      numPages: 60,
      getPage: vi.fn().mockResolvedValue(mockPage),
      destroy: vi.fn(),
    };
    vi.mocked(pdfjsLib.getDocument).mockReturnValue({
      promise: Promise.resolve(mockPdfDoc),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    let latestCtx: EditorCtx | null = null;
    renderWithProvider(60, (ctx) => { latestCtx = ctx; });

    await waitFor(() => expect(latestCtx?.state.pageCount).toBe(60));
    // Let any pending effects/microtasks (e.g. PageCanvasRenderer's own renders
    // for the virtualization window) settle.
    await new Promise((r) => setTimeout(r, 50));

    const requestedPages = mockPdfDoc.getPage.mock.calls.map((call) => call[0]);
    expect(requestedPages).toContain(1);
    // Nothing beyond the virtualization window around page 0 (±3, i.e. pages
    // 1-4) should ever be requested — never all the way through 60.
    expect(requestedPages).not.toContain(10);
    expect(requestedPages).not.toContain(60);
  });
});
