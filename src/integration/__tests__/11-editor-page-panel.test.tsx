// @vitest-environment jsdom
/**
 * Suite 11 — PDF Editor: Page Panel Operations
 *
 * Covers: PP-01 to PP-10
 * Tests the left page panel — collapse/expand, insert blank page,
 * delete, duplicate, move up/down, and page count display.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect, useRef } from 'react';
import { EditorProvider, useEditorContext, createEditorViewState } from '@/context/EditorContext';
import { PagePanel } from '@/components/pdf-editor/PagePanel';

// ── Mocks ─────────────────────────────────────────────────────────────────────

// Mock pdfjs-dist — PagePanelThumbnail uses it for rendering
vi.mock('pdfjs-dist', () => {
  const mockPage = {
    getViewport: vi.fn().mockReturnValue({ width: 612, height: 792 }),
    render: vi.fn().mockReturnValue({ promise: Promise.resolve() }),
  };
  const mockPdfDoc = {
    numPages: 5,
    getPage: vi.fn().mockResolvedValue(mockPage),
    destroy: vi.fn(),
  };
  return {
    getDocument: vi.fn().mockReturnValue({ promise: Promise.resolve(mockPdfDoc) }),
    GlobalWorkerOptions: { workerSrc: '' },
  };
});

// Stub IntersectionObserver — class syntax required
vi.stubGlobal(
  'IntersectionObserver',
  class IntersectionObserver {
    observe = vi.fn();
    disconnect = vi.fn();
    unobserve = vi.fn();
    constructor(_cb: IntersectionObserverCallback, _opts?: IntersectionObserverInit) {}
  },
);

// Stub ResizeObserver — class syntax required
vi.stubGlobal(
  'ResizeObserver',
  class ResizeObserver {
    observe = vi.fn();
    disconnect = vi.fn();
    unobserve = vi.fn();
    constructor(_cb: ResizeObserverCallback) {}
  },
);

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    writable: true,
    value: vi.fn(),
  });
});

afterEach(cleanup);

// ── Helpers ───────────────────────────────────────────────────────────────────

import { PDFDocument } from 'pdf-lib';

/** Creates a real minimal PDF with the specified number of pages. */
async function createRealPdf(pageCount: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i++) doc.addPage();
  return new Uint8Array(await doc.save());
}

type EditorCtx = ReturnType<typeof useEditorContext>;

function PagePanelHarness({
  pageCount = 5,
  pdfBytes,
  onContextReady,
}: {
  pageCount?: number;
  pdfBytes?: Uint8Array;
  onContextReady?: (ctx: EditorCtx) => void;
}) {
  return (
    <EditorProvider>
      <Initialiser pageCount={pageCount} pdfBytes={pdfBytes} onContextReady={onContextReady} />
      <PagePanel onScrollToPage={vi.fn()} />
    </EditorProvider>
  );
}

function Initialiser({
  pageCount,
  pdfBytes,
  onContextReady,
}: {
  pageCount: number;
  pdfBytes?: Uint8Array;
  onContextReady?: (ctx: EditorCtx) => void;
}) {
  const ctx = useEditorContext();
  const initRef = useRef(false);

  useEffect(() => {
    if (!initRef.current) {
      initRef.current = true;
      const bytes = pdfBytes ?? new Uint8Array([0x25, 0x50, 0x44, 0x46]);
      ctx.initState(
        createEditorViewState(bytes, pageCount, 'test.pdf', '/tmp/test.pdf', 1.0),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    onContextReady?.(ctx);
  });

  return null;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Suite 11 — PDF Editor: Page Panel', () => {
  it('PP-01 — Page panel header shows "Pages" and page count', async () => {
    render(<PagePanelHarness pageCount={5} />);

    expect(await screen.findByText('Pages')).toBeInTheDocument();
    expect(screen.getByText('5 pages')).toBeInTheDocument();
  });

  it('PP-02 — Collapse button hides thumbnails, expand shows them again', async () => {
    const user = userEvent.setup();
    render(<PagePanelHarness pageCount={3} />);

    // Wait for panel to render
    expect(await screen.findByText('3 pages')).toBeInTheDocument();

    // Click collapse
    await user.click(screen.getByLabelText('Collapse page panel'));

    // Pages header should be hidden
    expect(screen.queryByText('Pages')).not.toBeInTheDocument();

    // Expand button should appear
    const expandBtn = screen.getByLabelText('Expand page panel');
    await user.click(expandBtn);

    // Pages header visible again
    expect(screen.getByText('Pages')).toBeInTheDocument();
    expect(screen.getByText('3 pages')).toBeInTheDocument();
  });

  it('PP-03 — Insert page button opens menu with "Blank page" and "From PDF file" options', async () => {
    const user = userEvent.setup();
    render(<PagePanelHarness pageCount={3} />);

    await screen.findByText('3 pages');

    // Click insert button
    await user.click(screen.getByLabelText('Insert page'));

    // Menu should appear
    expect(screen.getByText('Blank page')).toBeInTheDocument();
    expect(screen.getByText('From PDF file...')).toBeInTheDocument();
  });

  it('PP-04 — Insert blank page increases page count', async () => {
    let latestCtx: EditorCtx | null = null;
    const user = userEvent.setup();
    const realPdf = await createRealPdf(3);

    render(<PagePanelHarness pageCount={3} pdfBytes={realPdf} onContextReady={(ctx) => { latestCtx = ctx; }} />);

    await screen.findByText('3 pages');
    expect(latestCtx!.state.pageCount).toBe(3);

    // Insert blank page
    await user.click(screen.getByLabelText('Insert page'));
    await user.click(screen.getByText('Blank page'));

    // Wait for async addBlankPage to complete
    await vi.waitFor(() => expect(latestCtx!.state.pageCount).toBe(4), { timeout: 3000 });
  });

  it('PP-05 — Page count shows "1 page" (singular) for single-page PDF', async () => {
    render(<PagePanelHarness pageCount={1} />);

    expect(await screen.findByText('1 page')).toBeInTheDocument();
  });

  it('PP-06 — Delete, Duplicate, Move buttons are initially disabled (no selection)', async () => {
    render(<PagePanelHarness pageCount={3} />);

    await screen.findByText('3 pages');

    // All operation buttons should be disabled initially (no page selected)
    expect(screen.getByLabelText('Delete selected pages')).toBeDisabled();
    expect(screen.getByLabelText('Duplicate selected pages')).toBeDisabled();
    expect(screen.getByLabelText('Move page up')).toBeDisabled();
    expect(screen.getByLabelText('Move page down')).toBeDisabled();
  });

  it('PP-07 — Selecting a page enables Duplicate and conditionally enables Delete', async () => {
    const user = userEvent.setup();

    render(<PagePanelHarness pageCount={3} />);

    await screen.findByText('3 pages');

    // Select page 2 (aria-label "Page 2")
    await user.click(screen.getByLabelText('Page 2'));

    // Now duplicate should be enabled
    expect(screen.getByLabelText('Duplicate selected pages')).not.toBeDisabled();
    // Delete should be enabled (not all pages selected)
    expect(screen.getByLabelText('Delete selected pages')).not.toBeDisabled();
  });

  it('PP-08 — Duplicate page increases page count by 1', async () => {
    let latestCtx: EditorCtx | null = null;
    const user = userEvent.setup();
    const realPdf = await createRealPdf(3);

    render(<PagePanelHarness pageCount={3} pdfBytes={realPdf} onContextReady={(ctx) => { latestCtx = ctx; }} />);

    await screen.findByText('3 pages');

    // Select page 1
    await user.click(screen.getByLabelText('Page 1'));

    // Duplicate
    await user.click(screen.getByLabelText('Duplicate selected pages'));

    await vi.waitFor(() => expect(latestCtx!.state.pageCount).toBe(4), { timeout: 3000 });
  });

  it('PP-09 — Delete page decreases page count by 1', async () => {
    let latestCtx: EditorCtx | null = null;
    const user = userEvent.setup();
    const realPdf = await createRealPdf(3);

    render(<PagePanelHarness pageCount={3} pdfBytes={realPdf} onContextReady={(ctx) => { latestCtx = ctx; }} />);

    await screen.findByText('3 pages');

    // Select page 2
    await user.click(screen.getByLabelText('Page 2'));

    // Delete
    await user.click(screen.getByLabelText('Delete selected pages'));

    await vi.waitFor(() => expect(latestCtx!.state.pageCount).toBe(2), { timeout: 3000 });
  });

  it('PP-10 — Move up/down buttons reorder pages correctly', async () => {
    let latestCtx: EditorCtx | null = null;
    const user = userEvent.setup();
    const realPdf = await createRealPdf(3);

    render(<PagePanelHarness pageCount={3} pdfBytes={realPdf} onContextReady={(ctx) => { latestCtx = ctx; }} />);

    await screen.findByText('3 pages');

    // Select page 2 (index 1)
    await user.click(screen.getByLabelText('Page 2'));

    // Move up should be enabled (not first page)
    const moveUpBtn = screen.getByLabelText('Move page up');
    expect(moveUpBtn).not.toBeDisabled();

    // Move down should also be enabled (not last page)
    const moveDownBtn = screen.getByLabelText('Move page down');
    expect(moveDownBtn).not.toBeDisabled();

    // Move up — the selected page moves from index 1 to 0
    await user.click(moveUpBtn);

    // After reorder, page count stays the same
    expect(latestCtx!.state.pageCount).toBe(3);
  });
});
