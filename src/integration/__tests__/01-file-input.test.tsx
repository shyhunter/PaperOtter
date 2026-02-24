// @vitest-environment jsdom
/**
 * Suite 01 — File Input
 *
 * Covers: FI-01 to FI-10
 * Tests the landing page, "Open file" picker, and format-based routing.
 * Renders the full App component and simulates user interactions.
 *
 * NOTE: No fake timers — user-event v14 with Vitest 4 deadlocks when
 * fake timers are active (pointer events use internal setTimeout). Real
 * timers + findBy* queries handle the 600 ms navigation animation.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, act, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '@/App';
import { openFilePicker } from '@/hooks/useFileOpen';
import * as fileValidation from '@/lib/fileValidation';

// ── Tauri webview (useFileDrop) ───────────────────────────────────────────────
vi.mock('@tauri-apps/api/webview', () => ({
  getCurrentWebview: vi.fn(() => ({
    onDragDropEvent: vi.fn(() => Promise.resolve(() => {})),
  })),
}));

// ── LazyStore (useRecentDirs) — must be a real class (module-level `new LazyStore()`) ──
vi.mock('@tauri-apps/plugin-store', () => ({
  LazyStore: class {
    get() { return Promise.resolve(null); }
    set() { return Promise.resolve(undefined); }
    save() { return Promise.resolve(undefined); }
  },
}));

// ── File picker ───────────────────────────────────────────────────────────────
vi.mock('@/hooks/useFileOpen', () => ({ openFilePicker: vi.fn() }));

// ── fileValidation — mock getFileSizeBytes to return a normal file size by default ──
// Individual tests (FI-09, FI-10) override this via vi.spyOn.
vi.mock('@/lib/fileValidation', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/fileValidation')>();
  return {
    ...original,
    getFileSizeBytes: vi.fn().mockResolvedValue(1 * 1024 * 1024), // default: 1 MB
  };
});

// ── PDF thumbnail rendering ───────────────────────────────────────────────────
vi.mock('@/lib/pdfThumbnail', () => ({
  renderAllPdfPages: vi.fn().mockResolvedValue([]),
}));

// ── Processing (prevents errors when hovering into Configure step) ────────────
vi.mock('@/lib/pdfProcessor', () => ({
  processPdf: vi.fn(),
  recommendQualityForTarget: vi.fn().mockReturnValue('screen'),
  getPdfImageCount: vi.fn().mockResolvedValue(0),
}));
vi.mock('@/lib/imageProcessor', () => ({ processImage: vi.fn() }));

// ── Blob URL (ImageCompareStep) ───────────────────────────────────────────────
Object.defineProperty(URL, 'createObjectURL', { value: vi.fn().mockReturnValue('blob:fake'), writable: true });
Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), writable: true });

// ── opener (PrivacyFooter) ────────────────────────────────────────────────────
vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: vi.fn() }));

afterEach(cleanup);

// ── Helpers ───────────────────────────────────────────────────────────────────

function setup() {
  const user = userEvent.setup();
  render(<App />);
  return { user };
}

/**
 * Click "Open file" with a mocked return path.
 * When filePath is non-null, waits for navigation to the Configure step.
 * When null (cancel), flushes pending promises and returns.
 */
async function pickFile(user: ReturnType<typeof userEvent.setup>, filePath: string | null) {
  vi.mocked(openFilePicker).mockResolvedValueOnce(filePath);
  await user.click(screen.getByText('Open file'));
  if (filePath !== null) {
    // Wait for the 600 ms loading animation to complete and Configure step to appear.
    await screen.findByRole('button', { name: /generate preview/i }, { timeout: 2000 });
  } else {
    // Cancel: flush any pending microtasks so the mock call is registered.
    await act(async () => {});
  }
}

// ─────────────────────────────────────────────────────────────────────────────

describe('Suite 01 — File Input', () => {
  // FI-01 ────────────────────────────────────────────────────────────────────
  it('FI-01 — landing page renders "Open file" button and drop zone', () => {
    setup();
    expect(screen.getByText('Open file')).toBeInTheDocument();
    expect(screen.getByText('Drop file here')).toBeInTheDocument();
    expect(screen.getByText('PDF, JPG, PNG, WebP')).toBeInTheDocument();
  });

  // FI-02 ────────────────────────────────────────────────────────────────────
  it('FI-02 — privacy footer is visible on the landing page', () => {
    setup();
    expect(screen.getByText(/processed locally/i)).toBeInTheDocument();
  });

  // FI-03 ────────────────────────────────────────────────────────────────────
  it('FI-03 — clicking "Open file" invokes the native file picker', async () => {
    const { user } = setup();
    vi.mocked(openFilePicker).mockResolvedValueOnce(null); // simulate cancel
    await user.click(screen.getByText('Open file'));
    await act(async () => {}); // flush openFilePicker promise
    expect(vi.mocked(openFilePicker)).toHaveBeenCalledOnce();
  });

  // FI-04 ────────────────────────────────────────────────────────────────────
  it('FI-04 — selecting a PDF file navigates to the PDF Configure step', async () => {
    const { user } = setup();
    await pickFile(user, '/Users/test/document.pdf');
    expect(screen.getByRole('button', { name: /generate preview/i })).toBeInTheDocument();
    // The quality radio group must show the four new labels
    expect(screen.getByText('Web')).toBeInTheDocument();
    expect(screen.getByText('Screen')).toBeInTheDocument();
    expect(screen.getByText('Print')).toBeInTheDocument();
    expect(screen.getByText('Archive')).toBeInTheDocument();
  });

  // FI-05 ────────────────────────────────────────────────────────────────────
  it('FI-05 — selecting a JPEG file navigates to the Image Configure step', async () => {
    const { user } = setup();
    await pickFile(user, '/Users/test/photo.jpg');
    // Image Configure shows a quality slider, not a radio group
    expect(screen.getByRole('slider')).toBeInTheDocument();
  });

  // FI-06 ────────────────────────────────────────────────────────────────────
  it('FI-06 — selecting a PNG file navigates to the Image Configure step', async () => {
    const { user } = setup();
    await pickFile(user, '/Users/test/image.png');
    expect(screen.getByRole('slider')).toBeInTheDocument();
  });

  // FI-07 ────────────────────────────────────────────────────────────────────
  it('FI-07 — selecting a WebP file navigates to the Image Configure step', async () => {
    const { user } = setup();
    await pickFile(user, '/Users/test/animation.webp');
    expect(screen.getByRole('slider')).toBeInTheDocument();
  });

  // FI-08 ────────────────────────────────────────────────────────────────────
  it('FI-08 — canceling the file picker stays on the landing page', async () => {
    const { user } = setup();
    await pickFile(user, null); // null = user cancelled the dialog
    // Should still be on landing
    expect(screen.getByText('Open file')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /generate preview/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('slider')).not.toBeInTheDocument();
  });

  // FI-09 ────────────────────────────────────────────────────────────────────
  it('FI-09 — opening a file > 100 MB shows the file-size-limit modal', async () => {
    const { user } = setup();
    // Override getFileSizeBytes to return 105 MB for this test
    vi.mocked(fileValidation.getFileSizeBytes).mockResolvedValueOnce(105 * 1024 * 1024);

    vi.mocked(openFilePicker).mockResolvedValueOnce('/Users/test/huge.pdf');
    await user.click(screen.getByText('Open file'));
    await act(async () => {});

    // The modal should be visible with the "Files over 100 MB are not supported" message
    await screen.findByText(/Files over 100 MB are not supported/i, {}, { timeout: 2000 });
    expect(screen.getByText(/File too large/i)).toBeInTheDocument();

    // Should NOT have advanced to Configure
    expect(screen.queryByRole('button', { name: /generate preview/i })).not.toBeInTheDocument();
  });

  // FI-10 ────────────────────────────────────────────────────────────────────
  it('FI-10 — opening a zero-byte file shows inline empty-file error', async () => {
    const { user } = setup();
    // Override getFileSizeBytes to return 0 (empty file) for this test
    vi.mocked(fileValidation.getFileSizeBytes).mockResolvedValueOnce(0);

    vi.mocked(openFilePicker).mockResolvedValueOnce('/Users/test/empty.pdf');
    await user.click(screen.getByText('Open file'));
    await act(async () => {});

    // The inline error should appear
    await screen.findByText(/This file is empty/i, {}, { timeout: 2000 });

    // Should NOT have advanced to Configure
    expect(screen.queryByRole('button', { name: /generate preview/i })).not.toBeInTheDocument();
  });
});
