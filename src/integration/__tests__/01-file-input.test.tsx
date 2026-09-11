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
import { readFile } from '@tauri-apps/plugin-fs';

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
    // Default to a build that can decode HEIC; FI-12 overrides. The user-agent
    // parsing behind this is unit-tested in fileValidation.test.ts.
    isHeicDecodable: vi.fn().mockReturnValue(true),
  };
});

// ── PDF thumbnail rendering ───────────────────────────────────────────────────
vi.mock('@/lib/pdfThumbnail', () => ({
  renderAllPdfPages: vi.fn().mockResolvedValue([]),
}));

// ── Processing (prevents errors when hovering into Configure step) ────────────
vi.mock('@/lib/pdfProcessor', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/pdfProcessor')>();
  return {
    ...actual, // keep real isPredictablyNonCompressible/getNonCompressibleReason/nonCompressibleMessage
    processPdf: vi.fn(),
    recommendQualityForTarget: vi.fn().mockReturnValue('screen'),
    estimateOutputSizeBytes: vi.fn().mockReturnValue(500 * 1024),
    getPdfImageCount: vi.fn().mockResolvedValue(0),
    getPdfCompressibility: vi.fn().mockResolvedValue({
      pageCount: 3, fileSizeBytes: 2_400_000, imageCount: 0, compressibilityScore: 0.5, jpxByteShare: 0,
    }),
  };
});
vi.mock('@/lib/imageProcessor', () => ({ processImage: vi.fn() }));

// ── Blob URL (ImageCompareStep) ───────────────────────────────────────────────
Object.defineProperty(URL, 'createObjectURL', { value: vi.fn().mockReturnValue('blob:fake'), writable: true });
Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), writable: true });

// ── opener (PrivacyFooter) ────────────────────────────────────────────────────
vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: vi.fn() }));

afterEach(cleanup);

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Enter a tool from the dashboard.
 *
 * The tool matters. Compress PDF and Compress Image are one flow that branches
 * on the file, and until the tool scoped what it would accept, this suite could
 * open Compress PDF and hand it a JPEG and watch the app switch tools underneath
 * the user -- which is what a reporter eventually noticed from the other side,
 * as Compress Image offering them PDFs.
 */
async function setup(tool: RegExp = /compress pdf/i) {
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getAllByRole('button', { name: tool })[0]);
  return { user };
}

/** The tool the image cases belong in. */
const COMPRESS_IMAGE = /compress image/i;

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
  it('FI-01 — landing page renders "Open file" button and drop zone', async () => {
    await setup();
    expect(screen.getByText('Open file')).toBeInTheDocument();
    expect(screen.getByText('Drop file here')).toBeInTheDocument();
    // Named for the tool that is open, not for everything the app can read.
    expect(screen.getByText('PDF')).toBeInTheDocument();
  });

  // FI-01b ───────────────────────────────────────────────────────────────────
  it('FI-01b — Compress Image names images, not PDFs', async () => {
    await setup(COMPRESS_IMAGE);
    expect(screen.getByText('JPG, PNG, WebP, HEIC')).toBeInTheDocument();
    expect(screen.queryByText('PDF, JPG, PNG, WebP')).not.toBeInTheDocument();
  });

  // FI-02 ────────────────────────────────────────────────────────────────────
  it('FI-02 — privacy footer is visible on the landing page', async () => {
    await setup();
    expect(screen.getByText(/processed locally/i)).toBeInTheDocument();
  });

  // FI-03 ────────────────────────────────────────────────────────────────────
  it('FI-03 — clicking "Open file" invokes the native file picker', async () => {
    const { user } = await setup();
    vi.mocked(openFilePicker).mockResolvedValueOnce(null); // simulate cancel
    await user.click(screen.getByText('Open file'));
    await act(async () => {}); // flush openFilePicker promise
    expect(vi.mocked(openFilePicker)).toHaveBeenCalledOnce();
  });

  // FI-04 ────────────────────────────────────────────────────────────────────
  it('FI-04 — selecting a PDF file navigates to the PDF Configure step', async () => {
    const { user } = await setup();
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
    const { user } = await setup(COMPRESS_IMAGE);
    await pickFile(user, '/Users/test/photo.jpg');
    // Image Configure shows a quality slider, not a radio group
    expect(screen.getByRole('slider')).toBeInTheDocument();
  });

  // FI-06 ────────────────────────────────────────────────────────────────────
  it('FI-06 — selecting a PNG file navigates to the Image Configure step', async () => {
    const { user } = await setup(COMPRESS_IMAGE);
    await pickFile(user, '/Users/test/image.png');
    expect(screen.getByRole('slider')).toBeInTheDocument();
  });

  // FI-07 ────────────────────────────────────────────────────────────────────
  it('FI-07 — selecting a WebP file navigates to the Image Configure step', async () => {
    const { user } = await setup(COMPRESS_IMAGE);
    await pickFile(user, '/Users/test/animation.webp');
    expect(screen.getByRole('slider')).toBeInTheDocument();
  });

  // FI-08 ────────────────────────────────────────────────────────────────────
  it('FI-08 — canceling the file picker stays on the landing page', async () => {
    const { user } = await setup();
    await pickFile(user, null); // null = user cancelled the dialog
    // Should still be on landing
    expect(screen.getByText('Open file')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /generate preview/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('slider')).not.toBeInTheDocument();
  });

  // FI-09 ────────────────────────────────────────────────────────────────────
  it('FI-09 — opening a file > 100 MB shows the file-size-limit modal', async () => {
    const { user } = await setup();
    // The size is the file's own length now, read once and used for both the
    // limit and the magic-byte check rather than read twice for the two. So the
    // file is what makes it large, which is also what happens in the app.
    const huge = new Uint8Array(105 * 1024 * 1024);
    huge.set([0x25, 0x50, 0x44, 0x46, 0x2d]); // %PDF-
    vi.mocked(readFile).mockResolvedValueOnce(huge);

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
    const { user } = await setup();
    vi.mocked(readFile).mockResolvedValueOnce(new Uint8Array(0));

    vi.mocked(openFilePicker).mockResolvedValueOnce('/Users/test/empty.pdf');
    await user.click(screen.getByText('Open file'));
    await act(async () => {});

    // The inline error should appear
    await screen.findByText(/This file is empty/i, {}, { timeout: 2000 });

    // Should NOT have advanced to Configure
    expect(screen.queryByRole('button', { name: /generate preview/i })).not.toBeInTheDocument();
  });

  // FI-11 ────────────────────────────────────────────────────────────────────
  // HEIC is the iPhone camera default, so it is the persona's very first action.
  // Decoding needs macOS Image I/O; a build without it must say so at the moment
  // the file arrives, not after the user has configured a whole job.
  it('FI-11 — opening a HEIC photo on macOS goes to the Image Configure step', async () => {
    const { user } = await setup(COMPRESS_IMAGE);
    await pickFile(user, '/Users/test/IMG_4032.heic');
    expect(screen.getByRole('slider')).toBeInTheDocument();
  });

  // FI-12 ────────────────────────────────────────────────────────────────────
  it('FI-12 — opening a HEIC photo without a decoder explains what to do instead', async () => {
    vi.mocked(fileValidation.isHeicDecodable).mockReturnValue(false);
    const { user } = await setup(COMPRESS_IMAGE);

    vi.mocked(openFilePicker).mockResolvedValueOnce('/Users/test/IMG_4032.heic');
    await user.click(screen.getByText('Open file'));
    await act(async () => {});

    await screen.findByText(/only be opened on macOS/i, {}, { timeout: 2000 });

    // Must not have advanced into the image flow
    expect(screen.queryByRole('slider')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /generate preview/i })).not.toBeInTheDocument();
  });

  // FI-13 ────────────────────────────────────────────────────────────────────
  // Reported as "Compress image opens also pdfs, I was not expecting that".
  // The picker's filter was the visible half; this is the other half, because a
  // filter is only a hint -- both dialogs have a way to reach a hidden file, and
  // drag-and-drop has no filter at all.
  it('FI-13 — Compress Image refuses a PDF and says which tool takes it', async () => {
    const { user } = await setup(COMPRESS_IMAGE);

    vi.mocked(openFilePicker).mockResolvedValueOnce('/Users/test/document.pdf');
    await user.click(screen.getByText('Open file'));
    await act(async () => {});

    await screen.findByText(/works on images/i, {}, { timeout: 2000 });
    // Names the tool that does handle it rather than leaving the user to guess.
    expect(screen.getByText(/Compress PDF/)).toBeInTheDocument();
    // And stayed put: no PDF job started under the image tool's name.
    expect(screen.queryByRole('button', { name: /generate preview/i })).not.toBeInTheDocument();
  });

  // FI-14 ────────────────────────────────────────────────────────────────────
  it('FI-14 — Compress PDF refuses an image and says which tool takes it', async () => {
    const { user } = await setup();

    vi.mocked(openFilePicker).mockResolvedValueOnce('/Users/test/photo.jpg');
    await user.click(screen.getByText('Open file'));
    await act(async () => {});

    await screen.findByText(/works on PDFs/i, {}, { timeout: 2000 });
    expect(screen.getByText(/Compress Image/)).toBeInTheDocument();
    expect(screen.queryByRole('slider')).not.toBeInTheDocument();
  });

  // FI-15 ────────────────────────────────────────────────────────────────────
  it('FI-15 — the picker is told what the open tool accepts', async () => {
    const { user } = await setup(COMPRESS_IMAGE);
    vi.mocked(openFilePicker).mockResolvedValueOnce(null);
    await user.click(screen.getByText('Open file'));
    await act(async () => {});

    // The dialog itself is the OS's, so what can be checked here is the request.
    // The second argument is whether the tool takes several files at once --
    // Compress Image takes one.
    expect(vi.mocked(openFilePicker)).toHaveBeenCalledWith(['image'], false);
  });
});
