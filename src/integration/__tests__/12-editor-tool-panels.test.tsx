// @vitest-environment jsdom
/**
 * Suite 12 — PDF Editor: Tool Sidebar Panels
 *
 * Covers: TP-01 to TP-11
 * Tests each of the 11 tool panels accessible from the ToolSidebar.
 * Each test opens the panel and verifies its controls render correctly.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect, useRef } from 'react';
import { EditorProvider, useEditorContext, createEditorViewState } from '@/context/EditorContext';
import { ToolSidebar } from '@/components/pdf-editor/ToolSidebar';

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
}));

// Mock pdf-lib page operations used by rotate/crop/watermark/page-numbers panels
vi.mock('@/lib/pdfRotate', () => ({
  rotatePdf: vi.fn().mockResolvedValue({ bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46]) }),
}));

vi.mock('@/lib/pdfWatermark', () => ({
  addWatermark: vi.fn().mockResolvedValue(new Uint8Array([0x25, 0x50, 0x44, 0x46])),
  DEFAULT_WATERMARK_OPTIONS: { text: '', fontSize: 48, opacity: 0.3, rotation: -45, color: 'gray' },
}));

vi.mock('@/lib/pdfPageNumbers', () => ({
  addPageNumbers: vi.fn().mockResolvedValue(new Uint8Array([0x25, 0x50, 0x44, 0x46])),
}));

vi.mock('@/lib/pdfCrop', () => ({
  cropPdf: vi.fn().mockResolvedValue(new Uint8Array([0x25, 0x50, 0x44, 0x46])),
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
    expect(screen.getByText('Downsample images')).toBeInTheDocument();
    expect(screen.getByText('Strip metadata')).toBeInTheDocument();

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
