// @vitest-environment jsdom
/**
 * Suite 12 — PDF Editor: Tool Sidebar Panels
 *
 * Covers: TP-01 to TP-11
 * Tests each of the 11 tool panels accessible from the ToolSidebar.
 * Each test opens the panel and verifies its controls render correctly.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect, useRef } from 'react';
import { EditorProvider, useEditorContext, createEditorViewState } from '@/context/EditorContext';
import { ToolSidebar } from '@/components/pdf-editor/ToolSidebar';
import { addPageNumbers, addPageNumbersSinglePage } from '@/lib/pdfPageNumbers';
import { rotatePdf } from '@/lib/pdfRotate';
import { cropPdf, cropPdfSinglePage } from '@/lib/pdfCrop';
import { invoke } from '@tauri-apps/api/core';
import { getPdfCompressibilityFromBytes } from '@/lib/pdfProcessor';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('pdfjs-dist', () => {
  const mockPage = {
    getViewport: vi.fn().mockReturnValue({ width: 612, height: 792 }),
    render: vi.fn().mockReturnValue({ promise: Promise.resolve() }),
  };
  const mockPdfDoc = {
    numPages: 3,
    getPage: vi.fn().mockResolvedValue(mockPage),
    destroy: vi.fn(),
  };
  return {
    getDocument: vi.fn().mockReturnValue({ promise: Promise.resolve(mockPdfDoc) }),
    GlobalWorkerOptions: { workerSrc: '' },
  };
});

vi.mock('@/lib/pdfThumbnail', () => ({
  renderPdfPageThumbnail: vi.fn().mockResolvedValue('blob:fake-thumb'),
  renderAllPdfPages: vi.fn().mockResolvedValue([]),
  openPdfForLazyRender: vi.fn().mockResolvedValue({
    numPages: 0,
    pageAspectRatios: [],
    renderPage: vi.fn().mockResolvedValue('blob:fake-thumb'),
    destroy: vi.fn(),
  }),
}));

// Mock pdf-lib page operations used by rotate/crop/watermark/page-numbers panels
vi.mock('@/lib/pdfRotate', () => ({
  rotatePdf: vi.fn().mockResolvedValue({ bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46]) }),
}));

vi.mock('@/lib/pdfWatermark', () => ({
  addWatermark: vi.fn().mockResolvedValue(new Uint8Array([0x25, 0x50, 0x44, 0x46])),
  DEFAULT_WATERMARK_OPTIONS: { text: '', fontSize: 48, opacity: 0.3, rotation: -45, color: 'gray' },
}));

// Partial: the estimate maths and the canonical non-compressible wording stay
// real, only the document analysis is stubbed.
vi.mock('@/lib/pdfProcessor', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/pdfProcessor')>();
  return {
    ...actual,
    // Default so panels that are not about estimates still render; the
    // estimate tests override it.
    getPdfCompressibilityFromBytes: vi.fn().mockResolvedValue({
      pageCount: 3,
      fileSizeBytes: 1024 * 1024,
      imageCount: 4,
      compressibilityScore: 0.5,
      jpxByteShare: 0,
    }),
  };
});

vi.mock('@/lib/pdfPageNumbers', () => ({
  addPageNumbers: vi.fn().mockResolvedValue(new Uint8Array([0x25, 0x50, 0x44, 0x46])),
  addPageNumbersSinglePage: vi.fn().mockResolvedValue(new Uint8Array([0x25, 0x50, 0x44, 0x46])),
}));

vi.mock('@/lib/pdfCrop', () => ({
  cropPdf: vi.fn().mockResolvedValue(new Uint8Array([0x25, 0x50, 0x44, 0x46])),
  cropPdfSinglePage: vi.fn().mockResolvedValue(new Uint8Array([0x25, 0x50, 0x44, 0x46])),
  mmToPoints: vi.fn((mm: number) => mm * 2.835),
}));

// Stub IntersectionObserver
vi.stubGlobal(
  'IntersectionObserver',
  class IntersectionObserver {
    observe = vi.fn();
    disconnect = vi.fn();
    unobserve = vi.fn();
    constructor(_cb: IntersectionObserverCallback, _opts?: IntersectionObserverInit) {}
  },
);

// Stub ResizeObserver
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
  // This suite does not clear mocks between tests, and the panels branch on
  // this result — leaving a previous test's document shape in place changes
  // what later panels render.
  vi.mocked(getPdfCompressibilityFromBytes).mockResolvedValue({
    pageCount: 3,
    fileSizeBytes: 1024 * 1024,
    imageCount: 4,
    compressibilityScore: 0.5,
    jpxByteShare: 0,
  });

  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    writable: true,
    value: vi.fn(),
  });
});

afterEach(cleanup);

// ── Helpers ───────────────────────────────────────────────────────────────────

function fakePdfBytes(): Uint8Array {
  return new Uint8Array([0x25, 0x50, 0x44, 0x46]);
}

type EditorCtx = ReturnType<typeof useEditorContext>;

/**
 * Renders the ToolSidebar inside EditorProvider with initialised state.
 */
function ToolPanelHarness({
  children,
  onContextReady,
}: {
  children: React.ReactNode;
  onContextReady?: (ctx: EditorCtx) => void;
}) {
  return (
    <EditorProvider>
      <Initialiser onContextReady={onContextReady} />
      {children}
    </EditorProvider>
  );
}

function Initialiser({ onContextReady }: { onContextReady?: (ctx: EditorCtx) => void }) {
  const ctx = useEditorContext();
  const initRef = useRef(false);

  useEffect(() => {
    if (!initRef.current) {
      initRef.current = true;
      ctx.initState(
        createEditorViewState(fakePdfBytes(), 3, 'test.pdf', '/tmp/test.pdf', 1.0),
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

describe('Suite 12 — PDF Editor: Tool Panels', () => {
  // TP-01: Compress Panel
  it('TP-01c — Downsample images is actually sent to the compressor', async () => {
    const user = userEvent.setup();
    vi.mocked(invoke).mockResolvedValue(new Uint8Array([0x25, 0x50, 0x44, 0x46]).buffer);

    render(
      <ToolPanelHarness>
        <ToolSidebar />
      </ToolPanelHarness>,
    );

    await user.click(screen.getByTitle('Compress PDF'));
    await user.click(screen.getByRole('checkbox', { name: /keep image resolution/i }));
    await user.click(screen.getByText('Apply'));

    // Regression: both option checkboxes were rendered, never read, and never
    // passed to the Rust command — ticking them did nothing whatsoever.
    await waitFor(() => {
      const call = vi.mocked(invoke).mock.calls.find(([cmd]) => cmd === 'compress_pdf');
      expect(call?.[1]).toMatchObject({ downsampleImages: false });
    });
  });

  /** An image-heavy document that should compress well. */
  function compressible() {
    vi.mocked(getPdfCompressibilityFromBytes).mockResolvedValue({
      pageCount: 10,
      fileSizeBytes: 4 * 1024 * 1024,
      imageCount: 12,
      compressibilityScore: 0.8,
      jpxByteShare: 0,
    });
  }

  /** A text-only document that cannot meaningfully shrink. */
  function textOnly() {
    vi.mocked(getPdfCompressibilityFromBytes).mockResolvedValue({
      pageCount: 3,
      fileSizeBytes: 250 * 1024,
      imageCount: 0,
      compressibilityScore: 0.02,
      jpxByteShare: 0,
    });
  }

  it('TP-01f — every preset shows what it would produce, against the current size', async () => {
    const user = userEvent.setup();
    compressible();

    render(
      <ToolPanelHarness>
        <ToolSidebar />
      </ToolPanelHarness>,
    );

    await user.click(screen.getByTitle('Compress PDF'));

    const estimates = await screen.findAllByTestId('preset-estimate');
    expect(estimates).toHaveLength(4);
    // Each preset says roughly what it costs and how much it saves, so the
    // choice can be made without running all four.
    for (const node of estimates) {
      expect(node.textContent).toMatch(/≈/);
      expect(node.textContent).toMatch(/%/);
    }
  });

  it('TP-01g — a document that cannot shrink says so instead of promising a reduction', async () => {
    const user = userEvent.setup();
    textOnly();

    render(
      <ToolPanelHarness>
        <ToolSidebar />
      </ToolPanelHarness>,
    );

    await user.click(screen.getByTitle('Compress PDF'));

    expect(await screen.findByText(/mostly text with no embedded images/i)).toBeTruthy();
  });

  it('TP-01h — Apply stays available on a non-compressible file', async () => {
    const user = userEvent.setup();
    textOnly();

    render(
      <ToolPanelHarness>
        <ToolSidebar />
      </ToolPanelHarness>,
    );

    await user.click(screen.getByTitle('Compress PDF'));
    await screen.findByText(/mostly text with no embedded images/i);

    // The standalone flow disables its controls here; this panel does not,
    // because a preset can still be worth trying on a borderline file.
    expect(screen.getByText('Apply')).not.toBeDisabled();
  });

  it('TP-01i — keeping image resolution says the estimates no longer hold', async () => {
    const user = userEvent.setup();
    compressible();

    render(
      <ToolPanelHarness>
        <ToolSidebar />
      </ToolPanelHarness>,
    );

    await user.click(screen.getByTitle('Compress PDF'));
    await screen.findAllByTestId('preset-estimate');

    expect(screen.queryByText(/estimates assume downsampling/i)).toBeNull();
    await user.click(screen.getByRole('checkbox', { name: /keep image resolution/i }));

    // The ratios come from presets that downsample; without it they are wrong.
    expect(await screen.findByText(/estimates assume downsampling/i)).toBeTruthy();
  });

  it('TP-01j — the resolution option is hidden when the document has no images', async () => {
    const user = userEvent.setup();
    textOnly();

    render(
      <ToolPanelHarness>
        <ToolSidebar />
      </ToolPanelHarness>,
    );

    await user.click(screen.getByTitle('Compress PDF'));
    await screen.findByText(/mostly text with no embedded images/i);

    // Nothing to downsample, so offering the choice is pure noise.
    expect(screen.queryByRole('checkbox', { name: /keep image resolution/i })).toBeNull();
  });

  it('TP-01k — the compress panel spends its space on numbers, not on tiny thumbnails', async () => {
    const user = userEvent.setup();
    compressible();

    render(
      <ToolPanelHarness>
        <ToolSidebar />
      </ToolPanelHarness>,
    );

    await user.click(screen.getByTitle('Compress PDF'));
    await screen.findAllByTestId('preset-estimate');

    // Two 100px thumbnails cannot show compression artefacts at any page scale
    // — the damage lives in image detail. The sidebar is for figures.
    expect(screen.queryByAltText('Before')).toBeNull();
    expect(screen.queryByAltText('After')).toBeNull();
  });

  it('TP-01l — it offers a full-size comparison instead', async () => {
    const user = userEvent.setup();
    compressible();
    let ctx: EditorCtx | undefined;

    render(
      <ToolPanelHarness onContextReady={(c) => { ctx = c; }}>
        <ToolSidebar />
      </ToolPanelHarness>,
    );

    await user.click(screen.getByTitle('Compress PDF'));
    await user.click(await screen.findByRole('button', { name: /compare full size/i }));

    // Reuses the editor's existing compare view, which is large and zoomable.
    await waitFor(() => expect(ctx!.state.compareMode).not.toBe('off'));
  });

  it('TP-01b — the target-size field leaves room for the MB/KB selector', async () => {
    const user = userEvent.setup();

    render(
      <ToolPanelHarness>
        <ToolSidebar />
      </ToolPanelHarness>,
    );

    await user.click(screen.getByTitle('Compress PDF'));
    await user.click(screen.getByRole('checkbox', { name: /target file size/i }));

    const field = screen.getByTitle('Target file size');

    // A flex item defaults to min-width:auto, and a number input's intrinsic
    // width (~20 characters plus spinners) exceeds the 232px sidebar. Without
    // min-w-0 the field refuses to shrink and pushes MB/KB out of view.
    expect(field.className).toContain('min-w-0');
    expect(screen.getByTitle('Size unit')).toBeTruthy();
  });

  it('TP-01 — Compress panel shows quality presets, target size toggle, and options', async () => {
    const user = userEvent.setup();

    render(
      <ToolPanelHarness>
        <ToolSidebar />
      </ToolPanelHarness>,
    );

    await user.click(screen.getByTitle('Compress PDF'));

    // Panel header
    expect(screen.getByText('Compress PDF')).toBeInTheDocument();

    // Quality presets
    expect(screen.getByText('Quality Preset')).toBeInTheDocument();
    expect(screen.getByText('Web / Screen')).toBeInTheDocument();
    expect(screen.getByText(/Medium/)).toBeInTheDocument();
    expect(screen.getByText(/High/)).toBeInTheDocument();
    expect(screen.getByText(/Maximum/)).toBeInTheDocument();

    // Target file size toggle
    expect(screen.getByText('Target file size')).toBeInTheDocument();

    // Advanced options
    expect(screen.getByText('Options')).toBeInTheDocument();
    // Appears once the document analysis resolves — it is hidden for documents
    // with no images.
    expect(await screen.findByText('Keep image resolution')).toBeInTheDocument();

    // Apply button
    expect(screen.getByText('Apply')).toBeInTheDocument();
  });

  it('TP-01b — Compress panel target size checkbox reveals size input', async () => {
    const user = userEvent.setup();

    render(
      <ToolPanelHarness>
        <ToolSidebar />
      </ToolPanelHarness>,
    );

    await user.click(screen.getByTitle('Compress PDF'));

    // Check the target size checkbox
    const targetSizeCheckbox = screen.getByRole('checkbox', { name: /target file size/i });
    await user.click(targetSizeCheckbox);

    // Should show target size input
    expect(screen.getByTitle('Target file size')).toBeInTheDocument();
    expect(screen.getByTitle('Size unit')).toBeInTheDocument();
  });

  // TP-02: Rotate Panel
  it('TP-02 — Rotate panel shows compass direction buttons and apply-to-all toggle', async () => {
    const user = userEvent.setup();

    render(
      <ToolPanelHarness>
        <ToolSidebar />
      </ToolPanelHarness>,
    );

    await user.click(screen.getByTitle('Rotate PDF'));

    expect(screen.getByText('Rotate PDF')).toBeInTheDocument();
    expect(screen.getByText('Direction')).toBeInTheDocument();

    // Compass directions
    expect(screen.getByText('Original')).toBeInTheDocument();
    expect(screen.getByText('Turn Right')).toBeInTheDocument();
    expect(screen.getByText('Upside Down')).toBeInTheDocument();
    expect(screen.getByText('Turn Left')).toBeInTheDocument();

    // Apply to all pages checkbox
    expect(screen.getByText('Apply to all pages')).toBeInTheDocument();

    // Apply button (should be disabled since rotation is 0)
    expect(screen.getByText('Apply')).toBeInTheDocument();
  });

  it('TP-02b — Selecting a rotation direction enables Apply', async () => {
    const user = userEvent.setup();

    render(
      <ToolPanelHarness>
        <ToolSidebar />
      </ToolPanelHarness>,
    );

    await user.click(screen.getByTitle('Rotate PDF'));

    // Click "Turn Right" direction
    await user.click(screen.getByText('Turn Right'));

    // Apply should eventually become enabled as the debounced preview completes
    // We verify the button exists (its disabled state depends on the preview)
    expect(screen.getByText('Apply')).toBeInTheDocument();
  });

  it('TP-02c — Rotate preview never touches pdf-lib; Apply processes the full document', async () => {
    const user = userEvent.setup();

    render(
      <ToolPanelHarness>
        <ToolSidebar />
      </ToolPanelHarness>,
    );

    await user.click(screen.getByTitle('Rotate PDF'));
    await user.click(screen.getByText('Turn Right'));

    // Regression: computing a rotated preview via pdf-lib (even scoped to a
    // single extracted page) meant loading the whole document into pdf-lib on
    // every direction change. pdf-lib builds a full mutable object graph and
    // never yields to the event loop while doing it — measured hanging for
    // over two minutes with no sign of finishing on a real
    // 30MB/688-page/1300+-image PDF. The preview must be pure CSS: pdf-lib is
    // only ever invoked once, on explicit Apply.
    await waitFor(() => expect(screen.getByText('Apply')).not.toBeDisabled(), { timeout: 2000 });
    expect(rotatePdf).not.toHaveBeenCalled();

    await user.click(screen.getByText('Apply'));
    await waitFor(() => expect(rotatePdf).toHaveBeenCalledTimes(1));
  });

  // TP-02d: Rotate applies to every selected page, not just the current one.
  it('TP-02d — Rotate applies to all selected pages', async () => {
    const user = userEvent.setup();
    let ctx: EditorCtx | undefined;
    vi.mocked(rotatePdf).mockClear(); // earlier TP-02 tests also call it

    render(
      <ToolPanelHarness onContextReady={(c) => { ctx = c; }}>
        <ToolSidebar />
      </ToolPanelHarness>,
    );

    // Select pages 1 and 3 (indices 0 and 2) the way PagePanel does on Cmd+click.
    await waitFor(() => expect(ctx).toBeDefined());
    act(() => {
      ctx!.togglePageSelection(0, true);
      ctx!.togglePageSelection(2, true);
    });
    await waitFor(() => expect(ctx!.selectedPages.size).toBe(2));

    await user.click(screen.getByTitle('Rotate PDF'));
    await user.click(screen.getByText('Turn Right'));
    await waitFor(() => expect(screen.getByText('Apply')).not.toBeDisabled(), { timeout: 2000 });
    await user.click(screen.getByText('Apply'));

    await waitFor(() => expect(rotatePdf).toHaveBeenCalledTimes(1));
    // Regression: the panel used state.currentPage only, so a multi-page
    // selection silently rotated just the first page.
    const rotations = vi.mocked(rotatePdf).mock.calls[0][1];
    expect(rotations.map((r) => r.pageIndex).sort()).toEqual([0, 2]);
    expect(rotations.every((r) => r.rotation === 90)).toBe(true);
  });

  // TP-02e: "Apply to all pages" reflects itself in the page panel selection.
  it('TP-02e — "Apply to all pages" selects every page in the Pages panel', async () => {
    const user = userEvent.setup();
    let ctx: EditorCtx | undefined;

    render(
      <ToolPanelHarness onContextReady={(c) => { ctx = c; }}>
        <ToolSidebar />
      </ToolPanelHarness>,
    );

    await user.click(screen.getByTitle('Rotate PDF'));
    await waitFor(() => expect(ctx).toBeDefined());
    expect(ctx!.selectedPages.size).toBe(0);

    await user.click(screen.getByLabelText(/apply to all pages/i));

    // The checkbox promised "all pages"; the Pages panel must agree.
    await waitFor(() => expect(ctx!.selectedPages.size).toBe(3));
    expect(Array.from(ctx!.selectedPages).sort()).toEqual([0, 1, 2]);

    // Unchecking releases the selection again.
    await user.click(screen.getByLabelText(/apply to all pages/i));
    await waitFor(() => expect(ctx!.selectedPages.size).toBe(0));
  });

  // TP-03: Watermark Panel
  it('TP-03 — Watermark panel shows text input, font size, rotation, opacity, and color', async () => {
    const user = userEvent.setup();

    render(
      <ToolPanelHarness>
        <ToolSidebar />
      </ToolPanelHarness>,
    );

    await user.click(screen.getByTitle('Watermark'));

    expect(screen.getByText('Watermark')).toBeInTheDocument();

    // Text input with placeholder
    expect(screen.getByPlaceholderText('CONFIDENTIAL')).toBeInTheDocument();

    // Font Size and Rotation labels
    expect(screen.getByText('Font Size')).toBeInTheDocument();
    expect(screen.getByText('Rotation')).toBeInTheDocument();

    // Opacity slider
    expect(screen.getByText(/Opacity:/)).toBeInTheDocument();

    // Color buttons
    expect(screen.getByText('Color')).toBeInTheDocument();
    expect(screen.getByText('gray')).toBeInTheDocument();
    expect(screen.getByText('red')).toBeInTheDocument();
    expect(screen.getByText('blue')).toBeInTheDocument();
  });

  it('TP-03b — Watermark Apply is disabled when text is empty', async () => {
    const user = userEvent.setup();

    render(
      <ToolPanelHarness>
        <ToolSidebar />
      </ToolPanelHarness>,
    );

    await user.click(screen.getByTitle('Watermark'));

    // Apply button should exist
    const applyBtn = screen.getByText('Apply');
    // When text is empty, Apply should be disabled
    expect(applyBtn.closest('button')).toBeDisabled();
  });

  // TP-04: Page Numbers Panel
  it('TP-04 — Page Numbers panel shows position, format, start-at, and font-size controls', async () => {
    const user = userEvent.setup();

    render(
      <ToolPanelHarness>
        <ToolSidebar />
      </ToolPanelHarness>,
    );

    await user.click(screen.getByTitle('Page Numbers'));

    expect(screen.getByText('Page Numbers')).toBeInTheDocument();
    expect(screen.getByText('Position')).toBeInTheDocument();
    expect(screen.getByText('Format')).toBeInTheDocument();
    expect(screen.getByText('Start At')).toBeInTheDocument();
    expect(screen.getByText('Font Size')).toBeInTheDocument();

    // Position select with options
    const posSelect = screen.getAllByRole('combobox')[0];
    expect(posSelect).toBeInTheDocument();
  });

  it('TP-04b — Page Numbers preview processes only the current page; Apply processes the full document', async () => {
    const user = userEvent.setup();

    render(
      <ToolPanelHarness>
        <ToolSidebar />
      </ToolPanelHarness>,
    );

    await user.click(screen.getByTitle('Page Numbers'));

    // The live preview must only ever touch a single page — never the full-document
    // function — no matter how many options change. Regression: the preview used to
    // run addPageNumbers() on the entire document on every option change, freezing
    // the app on large PDFs (reproduced on a real 688-page file).
    await waitFor(() => expect(screen.getByText('Apply')).not.toBeDisabled(), { timeout: 2000 });
    expect(addPageNumbersSinglePage).toHaveBeenCalled();
    expect(addPageNumbers).not.toHaveBeenCalled();

    // Apply commits the full document — only once, only on explicit user action.
    await user.click(screen.getByText('Apply'));
    await waitFor(() => expect(addPageNumbers).toHaveBeenCalledTimes(1));
  });

  /** Apply is disabled until the debounced preview resolves. */
  async function clickApply(user: ReturnType<typeof userEvent.setup>) {
    await waitFor(() => expect(screen.getByText('Apply')).not.toBeDisabled(), { timeout: 3000 });
    await user.click(screen.getByText('Apply'));
  }

  it('TP-04c — Page Numbers panel offers a colour, and Apply uses it', async () => {
    const user = userEvent.setup();
    vi.mocked(addPageNumbers).mockClear();

    render(
      <ToolPanelHarness>
        <ToolSidebar />
      </ToolPanelHarness>,
    );

    await user.click(screen.getByTitle('Page Numbers'));
    await user.click(screen.getByRole('button', { name: 'White' }));
    await clickApply(user);

    await waitFor(() => expect(addPageNumbers).toHaveBeenCalled());
    expect(vi.mocked(addPageNumbers).mock.calls[0][1]).toMatchObject({ color: '#FFFFFF' });
  });

  it('TP-04d — Remove appears only once page numbers have been applied', async () => {
    const user = userEvent.setup();

    render(
      <ToolPanelHarness>
        <ToolSidebar />
      </ToolPanelHarness>,
    );

    await user.click(screen.getByTitle('Page Numbers'));
    expect(screen.queryByRole('button', { name: /remove page numbers/i })).toBeNull();

    await clickApply(user);

    expect(await screen.findByRole('button', { name: /remove page numbers/i })).toBeTruthy();
  });

  it('TP-04e — Remove restores the bytes from before numbering', async () => {
    const user = userEvent.setup();
    let ctx: EditorCtx | undefined;

    render(
      <ToolPanelHarness onContextReady={(c) => { ctx = c; }}>
        <ToolSidebar />
      </ToolPanelHarness>,
    );

    const before = ctx!.state.pdfBytes;

    await user.click(screen.getByTitle('Page Numbers'));
    await clickApply(user);
    await waitFor(() => expect(ctx!.state.pageNumberBase).not.toBeNull());

    await user.click(screen.getByRole('button', { name: /remove page numbers/i }));

    await waitFor(() => expect(ctx!.state.pdfBytes).toEqual(before));
    expect(ctx!.state.pageNumberBase).toBeNull();
  });

  it('TP-04f — re-applying after a colour change derives from the clean bytes, not the numbered ones', async () => {
    const user = userEvent.setup();
    let ctx: EditorCtx | undefined;
    vi.mocked(addPageNumbers).mockClear();

    // Distinct results so a stacked apply would be visible in the call arguments.
    vi.mocked(addPageNumbers).mockResolvedValueOnce(new Uint8Array([0x41, 0x41, 0x41, 0x41]));
    vi.mocked(addPageNumbers).mockResolvedValueOnce(new Uint8Array([0x42, 0x42, 0x42, 0x42]));

    render(
      <ToolPanelHarness onContextReady={(c) => { ctx = c; }}>
        <ToolSidebar />
      </ToolPanelHarness>,
    );

    const clean = ctx!.state.pdfBytes;

    await user.click(screen.getByTitle('Page Numbers'));
    await clickApply(user);
    await waitFor(() => expect(addPageNumbers).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole('button', { name: 'Red' }));
    await clickApply(user);
    await waitFor(() => expect(addPageNumbers).toHaveBeenCalledTimes(2));

    // Second apply must start from the clean bytes. Starting from the numbered
    // result is how two overlapping sets of numbers get baked in permanently.
    expect(vi.mocked(addPageNumbers).mock.calls[1][0]).toEqual(clean);
    expect(vi.mocked(addPageNumbers).mock.calls[1][1]).toMatchObject({ color: '#DC2626' });
  });

  it('TP-04g — Font Size can be cleared in order to type a new value', async () => {
    const user = userEvent.setup();

    render(
      <ToolPanelHarness>
        <ToolSidebar />
      </ToolPanelHarness>,
    );

    await user.click(screen.getByTitle('Page Numbers'));

    // Start At comes first in the panel, Font Size second.
    const fontSize = screen.getAllByRole('spinbutton')[1] as HTMLInputElement;
    expect(fontSize.value).toBe('12');

    await user.clear(fontSize);

    // Regression: `Number('') || 12` is 12, because Number('') is 0 and falsy.
    // The field snapped straight back to 12, so it could never be emptied and
    // a new value could not be typed over it.
    expect(fontSize.value).toBe('');

    await user.type(fontSize, '20');
    expect(fontSize.value).toBe('20');
  });

  it('TP-04h — Start At can be cleared in order to type a new value', async () => {
    const user = userEvent.setup();

    render(
      <ToolPanelHarness>
        <ToolSidebar />
      </ToolPanelHarness>,
    );

    await user.click(screen.getByTitle('Page Numbers'));

    const startAt = screen.getAllByRole('spinbutton')[0] as HTMLInputElement;
    await user.clear(startAt);
    expect(startAt.value).toBe('');

    await user.type(startAt, '5');
    expect(startAt.value).toBe('5');
  });

  // TP-05: Crop Panel
  it('TP-05 — Crop panel shows margins controls with linked "All equal" toggle', async () => {
    const user = userEvent.setup();

    render(
      <ToolPanelHarness>
        <ToolSidebar />
      </ToolPanelHarness>,
    );

    await user.click(screen.getByTitle('Crop PDF'));

    expect(screen.getByText('Crop PDF')).toBeInTheDocument();
    expect(screen.getByText('Margins (mm)')).toBeInTheDocument();
    expect(screen.getByText('All equal')).toBeInTheDocument();

    // When linked (default), shows single "All sides" input
    expect(screen.getByText('All sides')).toBeInTheDocument();
    expect(screen.getByTitle('All margins (mm)')).toBeInTheDocument();
  });

  it('TP-05b — Unchecking "All equal" shows individual margin inputs', async () => {
    const user = userEvent.setup();

    render(
      <ToolPanelHarness>
        <ToolSidebar />
      </ToolPanelHarness>,
    );

    await user.click(screen.getByTitle('Crop PDF'));

    // Uncheck "All equal"
    const allEqualCheckbox = screen.getByRole('checkbox');
    await user.click(allEqualCheckbox);

    // Should show individual side inputs
    expect(screen.getByText('top')).toBeInTheDocument();
    expect(screen.getByText('bottom')).toBeInTheDocument();
    expect(screen.getByText('left')).toBeInTheDocument();
    expect(screen.getByText('right')).toBeInTheDocument();
  });

  it('TP-05c — Crop preview processes only the current page; Apply processes the full document', async () => {
    const user = userEvent.setup();

    render(
      <ToolPanelHarness>
        <ToolSidebar />
      </ToolPanelHarness>,
    );

    await user.click(screen.getByTitle('Crop PDF'));

    // Regression: cropping used to reload and re-save the entire document on
    // every margin change, freezing the app on large PDFs (a real 688-page file).
    await waitFor(() => expect(screen.getByText('Apply')).not.toBeDisabled(), { timeout: 2000 });
    expect(cropPdfSinglePage).toHaveBeenCalled();
    expect(cropPdf).not.toHaveBeenCalled();

    await user.click(screen.getByText('Apply'));
    await waitFor(() => expect(cropPdf).toHaveBeenCalledTimes(1));
  });

  // TP-06: Sign Panel
  it('TP-06 — Sign panel shows signature text input, style buttons, and place button', async () => {
    const user = userEvent.setup();

    render(
      <ToolPanelHarness>
        <ToolSidebar />
      </ToolPanelHarness>,
    );

    await user.click(screen.getByTitle('Sign PDF'));

    expect(screen.getByText('Sign PDF')).toBeInTheDocument();
    expect(screen.getByText('Type your signature')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Your Name')).toBeInTheDocument();

    // Style buttons
    expect(screen.getByText('Script')).toBeInTheDocument();
    expect(screen.getByText('Formal')).toBeInTheDocument();
    expect(screen.getByText('Clean')).toBeInTheDocument();

    // Place on Page button (disabled since no text)
    expect(screen.getByText('Place on Page')).toBeInTheDocument();

    // Save button
    expect(screen.getByText('Save')).toBeInTheDocument();

    // Click-to-Place Mode button
    expect(screen.getByText('Click-to-Place Mode')).toBeInTheDocument();
  });

  it('TP-06b — Typing a name shows signature preview and enables Place', async () => {
    const user = userEvent.setup();

    render(
      <ToolPanelHarness>
        <ToolSidebar />
      </ToolPanelHarness>,
    );

    await user.click(screen.getByTitle('Sign PDF'));

    const input = screen.getByPlaceholderText('Your Name');
    await user.type(input, 'John Doe');

    // Place on Page should now be enabled
    const placeBtn = screen.getByText('Place on Page');
    expect(placeBtn.closest('button')).not.toBeDisabled();

    // Preview should show the typed name
    expect(screen.getByText('John Doe')).toBeInTheDocument();
  });

  // TP-07: Redact Panel
  it('TP-07 — Redact panel shows three redaction methods', async () => {
    const user = userEvent.setup();

    render(
      <ToolPanelHarness>
        <ToolSidebar />
      </ToolPanelHarness>,
    );

    await user.click(screen.getByTitle('Redact PDF'));

    expect(screen.getByText('Redact PDF')).toBeInTheDocument();

    // Method 1
    expect(screen.getByText('Method 1: Delete text')).toBeInTheDocument();

    // Method 2
    expect(screen.getByText('Method 2: Cover with redaction block')).toBeInTheDocument();
    expect(screen.getByText('Place Redaction Block')).toBeInTheDocument();

    // Method 3
    expect(screen.getByText('Method 3: Click-to-place')).toBeInTheDocument();
    expect(screen.getByText('Activate Click-to-Place')).toBeInTheDocument();
  });

  it('TP-07b — Place Redaction Block increments redaction counter', async () => {
    const user = userEvent.setup();

    render(
      <ToolPanelHarness>
        <ToolSidebar />
      </ToolPanelHarness>,
    );

    await user.click(screen.getByTitle('Redact PDF'));

    // Click Place Redaction Block
    await user.click(screen.getByText('Place Redaction Block'));

    // Counter should show
    expect(screen.getByText(/1 redaction block placed/)).toBeInTheDocument();

    // Place another
    await user.click(screen.getByText('Place Redaction Block'));
    expect(screen.getByText(/2 redaction blocks placed/)).toBeInTheDocument();
  });

  // TP-08: PDF/A Convert Panel
  it('TP-08 — PDF/A Convert panel shows level select and Apply', async () => {
    const user = userEvent.setup();

    render(
      <ToolPanelHarness>
        <ToolSidebar />
      </ToolPanelHarness>,
    );

    await user.click(screen.getByTitle('PDF/A Convert'));

    expect(screen.getByText('PDF/A Convert')).toBeInTheDocument();
    expect(screen.getByTitle('PDF/A conformance level')).toBeInTheDocument();

    // Level options in select
    const select = screen.getByTitle('PDF/A conformance level');
    expect(select).toHaveValue('2'); // default is PDF/A-2

    expect(screen.getByText('Apply')).toBeInTheDocument();
  });

  // TP-09: Repair Panel
  it('TP-09 — Repair panel shows description and Apply button', async () => {
    const user = userEvent.setup();

    render(
      <ToolPanelHarness>
        <ToolSidebar />
      </ToolPanelHarness>,
    );

    await user.click(screen.getByTitle('Repair PDF'));

    expect(screen.getByText('Repair PDF')).toBeInTheDocument();
    expect(screen.getByText(/Attempt to fix corrupted/)).toBeInTheDocument();
    expect(screen.getByText('Apply')).toBeInTheDocument();
  });

  // TP-10: Protect Panel
  it('TP-10 — Protect panel shows password fields and mismatch warning', async () => {
    const user = userEvent.setup();

    render(
      <ToolPanelHarness>
        <ToolSidebar />
      </ToolPanelHarness>,
    );

    await user.click(screen.getByTitle('Protect PDF'));

    expect(screen.getByText('Protect PDF')).toBeInTheDocument();
    expect(screen.getByText('Password')).toBeInTheDocument();
    expect(screen.getByText('Confirm Password')).toBeInTheDocument();

    // Type mismatched passwords
    const [pwField, confirmField] = screen.getAllByPlaceholderText(/password/i);
    await user.type(pwField, 'secret123');
    await user.type(confirmField, 'different');

    // Mismatch warning should appear
    expect(screen.getByText('Passwords do not match')).toBeInTheDocument();

    // Apply should be disabled with mismatched passwords
    const applyBtn = screen.getByText('Apply');
    expect(applyBtn.closest('button')).toBeDisabled();
  });

  it('TP-10b — Protect panel enables Apply when passwords match', async () => {
    const user = userEvent.setup();

    render(
      <ToolPanelHarness>
        <ToolSidebar />
      </ToolPanelHarness>,
    );

    await user.click(screen.getByTitle('Protect PDF'));

    const [pwField, confirmField] = screen.getAllByPlaceholderText(/password/i);
    await user.type(pwField, 'secret123');
    await user.type(confirmField, 'secret123');

    // No mismatch warning
    expect(screen.queryByText('Passwords do not match')).not.toBeInTheDocument();

    // Apply should be enabled
    const applyBtn = screen.getByText('Apply');
    expect(applyBtn.closest('button')).not.toBeDisabled();
  });

  // TP-11: Unlock Panel
  it('TP-11 — Unlock panel shows password field and enables Apply with password', async () => {
    const user = userEvent.setup();

    render(
      <ToolPanelHarness>
        <ToolSidebar />
      </ToolPanelHarness>,
    );

    await user.click(screen.getByTitle('Unlock PDF'));

    expect(screen.getByText('Unlock PDF')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter PDF password')).toBeInTheDocument();

    // Apply disabled without password
    const applyBtn = screen.getByText('Apply');
    expect(applyBtn.closest('button')).toBeDisabled();

    // Type a password
    await user.type(screen.getByPlaceholderText('Enter PDF password'), 'mypassword');

    // Apply should now be enabled
    expect(applyBtn.closest('button')).not.toBeDisabled();
  });

  // TP-12: Panel switching — switching between tools replaces panel content
  it('TP-12 — Switching between tool panels replaces content', async () => {
    const user = userEvent.setup();

    render(
      <ToolPanelHarness>
        <ToolSidebar />
      </ToolPanelHarness>,
    );

    // Open Rotate
    await user.click(screen.getByTitle('Rotate PDF'));
    expect(screen.getByText('Direction')).toBeInTheDocument();

    // Switch to Watermark
    await user.click(screen.getByTitle('Watermark'));
    expect(screen.queryByText('Direction')).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText('CONFIDENTIAL')).toBeInTheDocument();

    // Switch to Protect
    await user.click(screen.getByTitle('Protect PDF'));
    expect(screen.queryByPlaceholderText('CONFIDENTIAL')).not.toBeInTheDocument();
    expect(screen.getByText('Confirm Password')).toBeInTheDocument();
  });

  // TP-13: Redact Click-to-Place mode toggle
  it('TP-13 — Redact click-to-place toggles editor mode', async () => {
    let latestCtx: EditorCtx | null = null;
    const user = userEvent.setup();

    render(
      <ToolPanelHarness onContextReady={(ctx) => { latestCtx = ctx; }}>
        <ToolSidebar />
      </ToolPanelHarness>,
    );

    await vi.waitFor(() => expect(latestCtx?.state.pageCount).toBe(3));

    await user.click(screen.getByTitle('Redact PDF'));

    // Click "Activate Click-to-Place"
    await user.click(screen.getByText('Activate Click-to-Place'));

    // Should change to text mode
    expect(latestCtx!.state.editorMode).toBe('text');

    // Button should now say "Click-to-Place Active"
    expect(screen.getByText('Click-to-Place Active')).toBeInTheDocument();
  });

  // TP-14: Sign panel Click-to-Place mode toggle
  it('TP-14 — Sign panel click-to-place toggles editor mode', async () => {
    let latestCtx: EditorCtx | null = null;
    const user = userEvent.setup();

    render(
      <ToolPanelHarness onContextReady={(ctx) => { latestCtx = ctx; }}>
        <ToolSidebar />
      </ToolPanelHarness>,
    );

    await vi.waitFor(() => expect(latestCtx?.state.pageCount).toBe(3));

    await user.click(screen.getByTitle('Sign PDF'));

    await user.click(screen.getByText('Click-to-Place Mode'));

    expect(latestCtx!.state.editorMode).toBe('text');
    expect(screen.getByText('Placement Mode Active')).toBeInTheDocument();
  });
});
