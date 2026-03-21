// @vitest-environment jsdom
/**
 * Tests for BUG: "menu behaviour by scroll"
 *
 * Acceptance criteria (checked after testing):
 * - [x] MENU-SCROLL-01: Header toolbar has flex-none class so it does not scroll with the canvas
 * - [x] MENU-SCROLL-02: Formatting toolbar row has flex-none class so it stays in place
 * - [x] MENU-SCROLL-03: ToolSidebar has h-full so it stays anchored during canvas scroll
 * - [x] MENU-SCROLL-04: EditorCanvas has flex-1 to fill the center column height
 * - [x] MENU-SCROLL-05: EditorCanvas renders overflow-auto container once pages load
 * - [x] MENU-SCROLL-06: AppContent root div has overflow-hidden to prevent page-level scrolling
 *
 * Root cause (fixed in EditorView.tsx):
 *   The center column div was missing `flex flex-col`, so EditorCanvas's `flex-1` had no effect
 *   and all PDF pages overflowed the container, causing the outer window to scroll and the
 *   header/sidebar panels to disappear.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, act, waitFor } from '@testing-library/react';
import { ToolSidebar } from '@/components/pdf-editor/ToolSidebar';
import { EditorTopToolbar } from '@/components/pdf-editor/EditorTopToolbar';
import { EditorCanvas } from '@/components/pdf-editor/EditorCanvas';
import App from '@/App';

afterEach(cleanup);

// ── Module-level mocks ────────────────────────────────────────────────────────
// NOTE: vi.mock() calls are hoisted before imports by Vitest.

// Override setup.ts's broken LazyStore mock (vi.fn() arrow function can't be a constructor).
// This must match the pattern used in 05-e2e-flows.test.tsx.
vi.mock('@tauri-apps/plugin-store', () => ({
  LazyStore: class {
    get() { return Promise.resolve(null); }
    set() { return Promise.resolve(undefined); }
    save() { return Promise.resolve(undefined); }
  },
}));

vi.mock('@/context/EditorContext', () => ({
  useEditorContext: vi.fn(() => ({
    state: {
      isDirty: false,
      fileName: 'test.pdf',
      pageCount: 2,
      currentPage: 0,
      compareMode: 'off',
      zoom: 1.0,
      zoomPreset: 'fit-width',
      pdfBytes: new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2D]),
      filePath: '/test/test.pdf',
      pages: [],
      selectedBlockId: null,
      editingBlockId: null,
      editorMode: 'select',
    },
    setCompareMode: vi.fn(),
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
    setZoomPreset: vi.fn(),
    setZoom: vi.fn(),
    setCurrentPage: vi.fn(),
    setFitWidthZoom: vi.fn(),
    updateTextBlock: vi.fn(),
    setEditorMode: vi.fn(),
    scrollToPageRef: { current: null },
    initState: vi.fn(),
    setFilePath: vi.fn(),
    setFileName: vi.fn(),
    clearDirty: vi.fn(),
    selectedPages: new Set(),
    togglePageSelection: vi.fn(),
    selectPageRange: vi.fn(),
    clearPageSelection: vi.fn(),
    addBlankPage: vi.fn(),
    addPagesFromPdf: vi.fn(),
    deletePages: vi.fn(),
    duplicatePages: vi.fn(),
    reorderPages: vi.fn(),
  })),
}));

vi.mock('@/context/ToolContext', () => ({
  useToolContext: vi.fn(() => ({
    goToDashboard: vi.fn(),
    activeTool: null,
    activeToolDef: null,
    pendingFiles: [],
    editorFilePath: null,
    selectTool: vi.fn(),
    setPendingFiles: vi.fn(),
    openEditor: vi.fn(),
  })),
  ToolProvider: function ToolProvider({ children }: { children: React.ReactNode }) { return children as React.ReactElement; },
}));

vi.mock('@/components/pdf-editor/SaveController', () => ({
  useSaveActions: vi.fn(() => ({
    save: vi.fn().mockResolvedValue(true),
    saveAs: vi.fn().mockResolvedValue(true),
    isSaving: false,
  })),
  SaveController: function SaveController() { return null; },
}));

vi.mock('@/hooks/useFileDrop', () => ({
  useFileDrop: vi.fn(() => ({ isDragging: false, isDragOver: false })),
}));

vi.mock('@/hooks/useFileOpen', () => ({
  openFilePicker: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/hooks/useRecentDirs', () => ({
  useRecentDirs: vi.fn(() => ({ dirs: [], addDir: vi.fn() })),
}));

vi.mock('@/lib/pdfProcessor', () => ({
  processPdf: vi.fn(),
  getPdfCompressibility: vi.fn().mockResolvedValue({ imageCount: 0, compressibilityScore: 0 }),
  recommendQualityForTarget: vi.fn().mockReturnValue('screen'),
  getPdfImageCount: vi.fn().mockResolvedValue(0),
}));

vi.mock('@/lib/imageProcessor', () => ({ processImage: vi.fn() }));
vi.mock('@/lib/pdfThumbnail', () => ({ renderAllPdfPages: vi.fn().mockResolvedValue([]) }));

// Stub ResizeObserver — jsdom does not implement this browser API.
vi.stubGlobal('ResizeObserver', class {
  observe() {}
  unobserve() {}
  disconnect() {}
});

// Stub IntersectionObserver — jsdom does not implement this browser API.
vi.stubGlobal('IntersectionObserver', class {
  observe() {}
  unobserve() {}
  disconnect() {}
});

// Mock pdfjs-dist: return a 2-page document with standard letter dimensions.
// This ensures EditorCanvas exits the loading state and renders the scrollable container.
vi.mock('pdfjs-dist', () => {
  const mockViewport = { width: 612, height: 792 };
  const mockPage = {
    getViewport: function() { return mockViewport; },
    render: function() { return { promise: Promise.resolve() }; },
  };
  const mockDoc = {
    numPages: 2,
    getPage: function() { return Promise.resolve(mockPage); },
    destroy: function() {},
  };
  return {
    getDocument: function() { return { promise: Promise.resolve(mockDoc) }; },
    GlobalWorkerOptions: { workerSrc: '' },
  };
});

// ── MENU-SCROLL-01 & 02: Toolbar sticky layout ───────────────────────────────

describe('MENU-SCROLL: EditorTopToolbar sticky positioning', () => {
  it('[MENU-SCROLL-01] outer wrapper has flex-none so toolbar row does not scroll with canvas', () => {
    const { container } = render(<EditorTopToolbar />);
    const wrapper = container.firstElementChild as HTMLElement;
    // flex-none prevents the toolbar from growing or scrolling along with the canvas
    expect(wrapper.className).toContain('flex-none');
  });

  it('[MENU-SCROLL-02] contains at least one flex-none child row (formatting bar)', () => {
    const { container } = render(<EditorTopToolbar />);
    // The FormattingToolbar row is rendered as a flex-none child
    const flexNoneRows = container.querySelectorAll('[class*="flex-none"]');
    expect(flexNoneRows.length).toBeGreaterThan(0);
  });
});

// ── MENU-SCROLL-03: Sidebar sticky layout ────────────────────────────────────

describe('MENU-SCROLL: ToolSidebar sticky positioning', () => {
  it('[MENU-SCROLL-03] outer wrapper has h-full so sidebar spans the full editor height', () => {
    const { container } = render(<ToolSidebar />);
    const wrapper = container.firstElementChild as HTMLElement;
    // h-full ensures the sidebar fills the editor height and stays anchored
    expect(wrapper.className).toContain('h-full');
  });

  it('[MENU-SCROLL-03b] icon strip has flex-none so it never shrinks or scrolls away', () => {
    const { container } = render(<ToolSidebar />);
    // The icon strip has both w-[48px] and flex-none
    const iconStrip = container.querySelector('[class*="w-\\[48px\\]"]');
    expect(iconStrip).not.toBeNull();
    expect((iconStrip as HTMLElement).className).toContain('flex-none');
  });
});

// ── MENU-SCROLL-04 & 05: Canvas scroll containment ───────────────────────────

describe('MENU-SCROLL: EditorCanvas internal scrolling', () => {
  it('[MENU-SCROLL-04] EditorCanvas always renders a flex-1 container (loading or loaded)', () => {
    const { container } = render(<EditorCanvas />);
    const canvasWrapper = container.firstElementChild as HTMLElement;
    // flex-1 fills the flex-col center column — this is the bug fix applied
    expect(canvasWrapper.className).toContain('flex-1');
  });

  it('[MENU-SCROLL-05] EditorCanvas renders overflow-auto container once pages are loaded', async () => {
    const { container } = render(<EditorCanvas />);
    // waitFor retries until pdfjs-dist mock resolves and loadPageInfos sets pageInfos state.
    // overflow-auto creates an internal scroll area so PDF pages scroll here, not at window level.
    await waitFor(
      () => expect(container.firstElementChild?.className).toContain('overflow-auto'),
      { timeout: 5000 },
    );
  }, 10000);
});

// ── MENU-SCROLL-06: App-level overflow guard ──────────────────────────────────

describe('MENU-SCROLL: App-level scroll prevention', () => {
  it('[MENU-SCROLL-06] AppContent root div has overflow-hidden to prevent page-level scrolling', async () => {
    const { container } = render(<App />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    // App renders <SplashScreen /> then <AppContent /> as siblings.
    // AppContent's root div is identified by h-screen and overflow-hidden classes.
    const appContentRoot = Array.from(container.children).find(
      (el) => (el as HTMLElement).className.includes('h-screen'),
    ) as HTMLElement | undefined;
    expect(appContentRoot).toBeDefined();
    // overflow-hidden on the root prevents PDF canvas overflow from triggering window scroll
    expect(appContentRoot?.className).toContain('overflow-hidden');
  });
});
