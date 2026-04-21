// @vitest-environment jsdom
/**
 * Suite 10 — PDF Editor: Load, Toolbar, Formatting, Zoom & Compare
 *
 * Covers: ED-01 to ED-12
 * Renders EditorView directly (not via App) to isolate the editor experience.
 * Tests verify the editor layout, toolbar, formatting controls, zoom, and compare mode.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect, useRef } from 'react';
import { PDFDocument } from 'pdf-lib';
import { EditorProvider, useEditorContext, createEditorViewState } from '@/context/EditorContext';
import { ToolProvider } from '@/context/ToolContext';
import { EditorView } from '@/components/pdf-editor/EditorView';
import { EditorTopToolbar } from '@/components/pdf-editor/EditorTopToolbar';
import { FormattingToolbar } from '@/components/pdf-editor/FormattingToolbar';
import { ZoomToolbar } from '@/components/pdf-editor/ZoomToolbar';
import { ToolSidebar } from '@/components/pdf-editor/ToolSidebar';

// ── Mocks ─────────────────────────────────────────────────────────────────────

// Mock pdfjs-dist for components that import it at module level
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

// Mock pdfThumbnail so ToolSidebarPreview doesn't actually render
vi.mock('@/lib/pdfThumbnail', () => ({
  renderPdfPageThumbnail: vi.fn().mockResolvedValue('blob:fake-thumb'),
  renderAllPdfPages: vi.fn().mockResolvedValue([]),
}));

// Mock the pdfEditor applyAllEdits for SaveController
vi.mock('@/lib/pdfEditor', () => ({
  applyAllEdits: vi.fn().mockResolvedValue(new Uint8Array([0x25, 0x50, 0x44, 0x46])),
}));

// Mock pdf-lib for EditorView error-state tests (ED-16 to ED-18).
// load() has no default — each error test overrides with mockRejectedValueOnce.
vi.mock('pdf-lib', () => ({
  PDFDocument: {
    load: vi.fn(),
    create: vi.fn(),
  },
  degrees: (d: number) => d,
  rgb: () => ({}),
  StandardFonts: { Helvetica: 'Helvetica', HelveticaBold: 'HelveticaBold' },
}));

// Stub IntersectionObserver — class syntax required for `new`
vi.stubGlobal(
  'IntersectionObserver',
  class IntersectionObserver {
    observe = vi.fn();
    disconnect = vi.fn();
    unobserve = vi.fn();
    constructor(_cb: IntersectionObserverCallback, _opts?: IntersectionObserverInit) {}
  },
);

// Stub ResizeObserver — class syntax required for `new`
vi.stubGlobal(
  'ResizeObserver',
  class ResizeObserver {
    observe = vi.fn();
    disconnect = vi.fn();
    unobserve = vi.fn();
    constructor(_cb: ResizeObserverCallback) {}
  },
);

// Stub scrollIntoView
beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    writable: true,
    value: vi.fn(),
  });
});

afterEach(cleanup);

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Minimal non-empty PDF bytes (header only — pdfjs is mocked). */
function fakePdfBytes(): Uint8Array {
  return new Uint8Array([0x25, 0x50, 0x44, 0x46]); // %PDF
}

type EditorCtx = ReturnType<typeof useEditorContext>;

/**
 * Wrapper that initialises the editor context and renders children.
 */
function EditorTestHarness({
  pageCount = 3,
  fileName = 'test.pdf',
  children,
  onContextReady,
}: {
  pageCount?: number;
  fileName?: string;
  children: React.ReactNode;
  onContextReady?: (ctx: EditorCtx) => void;
}) {
  return (
    <ToolProvider>
      <EditorProvider>
        <Initialiser pageCount={pageCount} fileName={fileName} onContextReady={onContextReady} />
        {children}
      </EditorProvider>
    </ToolProvider>
  );
}

function Initialiser({
  pageCount,
  fileName,
  onContextReady,
}: {
  pageCount: number;
  fileName: string;
  onContextReady?: (ctx: EditorCtx) => void;
}) {
  const ctx = useEditorContext();
  const initRef = useRef(false);

  useEffect(() => {
    if (!initRef.current) {
      initRef.current = true;
      ctx.initState(
        createEditorViewState(fakePdfBytes(), pageCount, fileName, `/tmp/${fileName}`, 1.0),
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

describe('Suite 10 — PDF Editor: Layout & Toolbar', () => {
  it('ED-01 — EditorTopToolbar shows filename, page info, and navigation buttons', async () => {
    render(
      <EditorTestHarness fileName="report.pdf" pageCount={5}>
        <EditorTopToolbar />
      </EditorTestHarness>,
    );

    // Wait for initialisation
    expect(await screen.findByText('report.pdf')).toBeInTheDocument();
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText(/Page 1 of 5/)).toBeInTheDocument();
    expect(screen.getByText('Save')).toBeInTheDocument();
    expect(screen.getByText('Compare')).toBeInTheDocument();
  });

  it('ED-02 — Save button is disabled when document is not dirty', () => {
    render(
      <EditorTestHarness>
        <EditorTopToolbar />
      </EditorTestHarness>,
    );

    const saveButton = screen.getByTitle('Save (Cmd+S)');
    expect(saveButton).toBeDisabled();
  });

  it('ED-03 — Save button becomes enabled after marking document dirty', async () => {
    let latestCtx: EditorCtx | null = null;

    render(
      <EditorTestHarness onContextReady={(ctx) => { latestCtx = ctx; }}>
        <EditorTopToolbar />
      </EditorTestHarness>,
    );

    // Wait for init
    await screen.findByText('test.pdf');

    // Mark dirty
    await act(async () => {
      latestCtx!.markDirty();
    });

    const saveButton = screen.getByTitle('Save (Cmd+S)');
    expect(saveButton).not.toBeDisabled();
  });

  it('ED-04 — dirty indicator (*) appears next to filename', async () => {
    let latestCtx: EditorCtx | null = null;

    render(
      <EditorTestHarness onContextReady={(ctx) => { latestCtx = ctx; }}>
        <EditorTopToolbar />
      </EditorTestHarness>,
    );

    await screen.findByText('test.pdf');

    // Initially no asterisk
    expect(screen.queryByTitle('Unsaved changes')).not.toBeInTheDocument();

    // Mark dirty
    await act(async () => {
      latestCtx!.markDirty();
    });

    expect(screen.getByTitle('Unsaved changes')).toBeInTheDocument();
  });

  it('ED-05 — Compare button toggles compare mode', async () => {
    let latestCtx: EditorCtx | null = null;
    const user = userEvent.setup();

    render(
      <EditorTestHarness onContextReady={(ctx) => { latestCtx = ctx; }}>
        <EditorTopToolbar />
      </EditorTestHarness>,
    );

    await screen.findByText('test.pdf');
    expect(latestCtx!.state.compareMode).toBe('off');

    // Click Compare to toggle on
    await user.click(screen.getByTitle('Toggle compare view (original vs edited)'));
    expect(latestCtx!.state.compareMode).toBe('floating');

    // Click again to toggle off
    await user.click(screen.getByTitle('Toggle compare view (original vs edited)'));
    expect(latestCtx!.state.compareMode).toBe('off');
  });
});

describe('Suite 10 — PDF Editor: Formatting Toolbar', () => {
  it('ED-06 — FormattingToolbar renders font family, size, and formatting buttons', () => {
    render(
      <EditorTestHarness>
        <FormattingToolbar />
      </EditorTestHarness>,
    );

    // Font family select
    const fontSelect = screen.getAllByRole('combobox')[0];
    expect(fontSelect).toBeInTheDocument();

    // Font size input
    const sizeInput = screen.getByRole('spinbutton');
    expect(sizeInput).toBeInTheDocument();

    // Bold, Italic, Underline buttons
    expect(screen.getByTitle('Bold')).toBeInTheDocument();
    expect(screen.getByTitle('Italic')).toBeInTheDocument();
    expect(screen.getByTitle('Underline')).toBeInTheDocument();

    // Line spacing select
    expect(screen.getByTitle('Line spacing')).toBeInTheDocument();
  });

  it('ED-07 — FormattingToolbar controls are disabled when no block is selected', () => {
    render(
      <EditorTestHarness>
        <FormattingToolbar />
      </EditorTestHarness>,
    );

    const boldButton = screen.getByTitle('Bold');
    const italicButton = screen.getByTitle('Italic');
    const underlineButton = screen.getByTitle('Underline');

    expect(boldButton).toBeDisabled();
    expect(italicButton).toBeDisabled();
    expect(underlineButton).toBeDisabled();
  });

  it('ED-08 — Add Text button toggles editor mode to text', async () => {
    let latestCtx: EditorCtx | null = null;
    const user = userEvent.setup();

    render(
      <EditorTestHarness onContextReady={(ctx) => { latestCtx = ctx; }}>
        <FormattingToolbar />
      </EditorTestHarness>,
    );

    // Wait for init
    await vi.waitFor(() => expect(latestCtx?.state.pageCount).toBe(3));

    expect(latestCtx!.state.editorMode).toBe('select');

    // Click Add Text button (Plus + Type icon)
    const addTextButton = screen.getByTitle('Add text mode (click on page to add)');
    await user.click(addTextButton);

    expect(latestCtx!.state.editorMode).toBe('text');

    // Click again to toggle back
    await user.click(addTextButton);
    expect(latestCtx!.state.editorMode).toBe('select');
  });
});

describe('Suite 10 — PDF Editor: Zoom Toolbar', () => {
  it('ED-09 — ZoomToolbar shows zoom percentage and +/- buttons', () => {
    render(
      <EditorTestHarness>
        <ZoomToolbar />
      </EditorTestHarness>,
    );

    expect(screen.getByTitle('Zoom out (Cmd+-)')).toBeInTheDocument();
    expect(screen.getByTitle('Zoom in (Cmd+=)')).toBeInTheDocument();
    expect(screen.getByTitle('Zoom presets')).toBeInTheDocument();
    // Initial zoom is 100% (1.0 * 100)
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('ED-10 — Zoom in/out buttons change zoom level', async () => {
    let latestCtx: EditorCtx | null = null;
    const user = userEvent.setup();

    render(
      <EditorTestHarness onContextReady={(ctx) => { latestCtx = ctx; }}>
        <ZoomToolbar />
      </EditorTestHarness>,
    );

    await vi.waitFor(() => expect(latestCtx?.state.pageCount).toBe(3));

    const initialZoom = latestCtx!.state.zoom;
    
    // Zoom in
    await user.click(screen.getByTitle('Zoom in (Cmd+=)'));
    expect(latestCtx!.state.zoom).toBeGreaterThan(initialZoom);

    // Zoom out twice to go below initial
    await user.click(screen.getByTitle('Zoom out (Cmd+-)'));
    await user.click(screen.getByTitle('Zoom out (Cmd+-)'));
    expect(latestCtx!.state.zoom).toBeLessThan(initialZoom);
  });

  it('ED-11 — Zoom presets dropdown opens and selects preset', async () => {
    let latestCtx: EditorCtx | null = null;
    const user = userEvent.setup();

    render(
      <EditorTestHarness onContextReady={(ctx) => { latestCtx = ctx; }}>
        <ZoomToolbar />
      </EditorTestHarness>,
    );

    await vi.waitFor(() => expect(latestCtx?.state.pageCount).toBe(3));

    // Click zoom preset button to open dropdown
    await user.click(screen.getByTitle('Zoom presets'));

    // Should see preset options
    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(screen.getByText('75%')).toBeInTheDocument();
    expect(screen.getByText('150%')).toBeInTheDocument();
    expect(screen.getByText('Fit Width')).toBeInTheDocument();

    // Select 150%
    await user.click(screen.getByText('150%'));
    expect(latestCtx!.state.zoom).toBe(1.5);
  });
});

describe('Suite 10 — PDF Editor: Tool Sidebar', () => {
  it('ED-12 — ToolSidebar renders all 11 tool icons', () => {
    render(
      <EditorTestHarness>
        <ToolSidebar />
      </EditorTestHarness>,
    );

    // Each tool button has a title from the TOOL_REGISTRY
    expect(screen.getByTitle('Compress PDF')).toBeInTheDocument();
    expect(screen.getByTitle('Rotate PDF')).toBeInTheDocument();
    expect(screen.getByTitle('Page Numbers')).toBeInTheDocument();
    expect(screen.getByTitle('Watermark')).toBeInTheDocument();
    expect(screen.getByTitle('Crop PDF')).toBeInTheDocument();
    expect(screen.getByTitle('Sign PDF')).toBeInTheDocument();
    expect(screen.getByTitle('Redact PDF')).toBeInTheDocument();
    expect(screen.getByTitle('PDF/A Convert')).toBeInTheDocument();
    expect(screen.getByTitle('Repair PDF')).toBeInTheDocument();
    expect(screen.getByTitle('Protect PDF')).toBeInTheDocument();
    expect(screen.getByTitle('Unlock PDF')).toBeInTheDocument();
  });

  it('ED-13 — Clicking a tool icon expands its panel', async () => {
    const user = userEvent.setup();

    render(
      <EditorTestHarness>
        <ToolSidebar />
      </EditorTestHarness>,
    );

    // Click Rotate PDF
    await user.click(screen.getByTitle('Rotate PDF'));

    // Panel should show rotate-specific content
    expect(screen.getByText('Rotate PDF')).toBeInTheDocument();
    expect(screen.getByText('Direction')).toBeInTheDocument();
  });

  it('ED-14 — Clicking the same icon again collapses the panel', async () => {
    const user = userEvent.setup();

    render(
      <EditorTestHarness>
        <ToolSidebar />
      </EditorTestHarness>,
    );

    // Click Rotate PDF to open
    await user.click(screen.getByTitle('Rotate PDF'));
    expect(screen.getByText('Direction')).toBeInTheDocument();

    // Click Rotate PDF again to close
    await user.click(screen.getByTitle('Rotate PDF'));
    expect(screen.queryByText('Direction')).not.toBeInTheDocument();
  });

  it('ED-15 — Collapse/expand toggle works correctly', async () => {
    const user = userEvent.setup();

    render(
      <EditorTestHarness>
        <ToolSidebar />
      </EditorTestHarness>,
    );

    // Open a panel first
    await user.click(screen.getByTitle('Compress PDF'));
    expect(screen.getByText('Quality Preset')).toBeInTheDocument();

    // Close panel via collapse toggle
    await user.click(screen.getByTitle('Close panel'));
    expect(screen.queryByText('Quality Preset')).not.toBeInTheDocument();

    // Re-open via expand toggle — should remember last tool
    await user.click(screen.getByTitle('Open panel'));
    expect(screen.getByText('Quality Preset')).toBeInTheDocument();
  });
});

// ── Suite 10 — PDF Editor: Error State (PR #22 regression) ───────────────────
//
// Verifies that EditorView renders the styled error card (with "Unable to open file"
// heading and "Back to Dashboard" button) when PDFDocument.load throws, and that the
// displayed message is the friendlyPdfError output — not the raw pdf-lib exception text.
//
// Tests: ED-16, ED-17, ED-18

describe('Suite 10 — PDF Editor: Error State', () => {
  // ED-16 — error heading ─────────────────────────────────────────────────────
  it('ED-16 — shows "Unable to open file" heading when the PDF file is invalid', async () => {
    vi.mocked(PDFDocument.load).mockRejectedValueOnce(new Error('No PDF header found'));

    render(
      <ToolProvider>
        <EditorView filePath="/bad.pdf" />
      </ToolProvider>,
    );

    expect(await screen.findByText('Unable to open file', {}, { timeout: 3000 })).toBeInTheDocument();
  });

  // ED-17 — friendly error message ────────────────────────────────────────────
  it('ED-17 — error card shows friendly message, not raw pdf-lib exception text', async () => {
    vi.mocked(PDFDocument.load).mockRejectedValueOnce(new Error('No PDF header found'));

    render(
      <ToolProvider>
        <EditorView filePath="/bad.pdf" />
      </ToolProvider>,
    );

    // Friendly message must be shown
    expect(
      await screen.findByText(
        'This file is not a valid PDF document. Please select a valid PDF file.',
        {},
        { timeout: 3000 },
      ),
    ).toBeInTheDocument();

    // Raw exception text must NOT leak through to the user
    expect(screen.queryByText('No PDF header found')).not.toBeInTheDocument();
  });

  // ED-18 — Back to Dashboard button ──────────────────────────────────────────
  it('ED-18 — error card renders a "Back to Dashboard" button', async () => {
    vi.mocked(PDFDocument.load).mockRejectedValueOnce(new Error('No PDF header found'));

    render(
      <ToolProvider>
        <EditorView filePath="/bad.pdf" />
      </ToolProvider>,
    );

    expect(
      await screen.findByRole('button', { name: /back to dashboard/i }, { timeout: 3000 }),
    ).toBeInTheDocument();
  });
});
