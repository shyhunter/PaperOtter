// @vitest-environment jsdom
/**
 * Suite 02 — PDF Configure Step
 *
 * Covers: PC-01 to PC-08, PR-01 to PR-05
 * Tests every user interaction on the PDF Configure screen:
 * quality level selection, target size input, page resize controls.
 * Renders the full App component and drives it to step 1 via file picker.
 *
 * NOTE: No fake timers — user-event v14 with Vitest 4 deadlocks when
 * fake timers are active. Real timers + findBy* handle navigation.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, act, cleanup, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import App from '@/App';
import { openFilePicker } from '@/hooks/useFileOpen';
import { processPdf } from '@/lib/pdfProcessor';
import { readFile } from '@tauri-apps/plugin-fs';
import { FAKE_PDF_RESULT } from '@/integration/fixtures';

// Real PDF bytes — used to make getPdfMeta succeed and report a non-zero file size.
// This enables the "Suggested" quality badge to appear when a target size is entered.
const SAMPLE_PDF_BYTES = new Uint8Array(
  readFileSync(resolve(__dirname, '../../../test-fixtures/sample.pdf'))
);

// ── Mocks ─────────────────────────────────────────────────────────────────────
vi.mock('@tauri-apps/api/webview', () => ({
  getCurrentWebview: vi.fn(() => ({ onDragDropEvent: vi.fn(() => Promise.resolve(() => {})) })),
}));
vi.mock('@tauri-apps/plugin-store', () => ({
  LazyStore: class {
    get() { return Promise.resolve(null); }
    set() { return Promise.resolve(undefined); }
    save() { return Promise.resolve(undefined); }
  },
}));
vi.mock('@/hooks/useFileOpen', () => ({ openFilePicker: vi.fn() }));
vi.mock('@/lib/pdfThumbnail', () => ({ renderAllPdfPages: vi.fn().mockResolvedValue([]) }));
vi.mock('@/lib/pdfProcessor', () => ({
  processPdf: vi.fn(),
  recommendQualityForTarget: vi.fn().mockReturnValue('web'),
  getPdfImageCount: vi.fn().mockResolvedValue(0),
}));
vi.mock('@/lib/imageProcessor', () => ({ processImage: vi.fn() }));
vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: vi.fn() }));

Object.defineProperty(URL, 'createObjectURL', { value: vi.fn().mockReturnValue('blob:fake'), writable: true });
Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), writable: true });

afterEach(cleanup);

// ── Helpers ───────────────────────────────────────────────────────────────────

function setup() {
  const user = userEvent.setup();
  render(<App />);
  return { user };
}

/** Drive App to the PDF Configure step (step 1). */
async function navigateToPdfConfigure(user: ReturnType<typeof userEvent.setup>) {
  vi.mocked(openFilePicker).mockResolvedValueOnce('/test/document.pdf');
  await user.click(screen.getByText('Open file'));
  await screen.findByRole('button', { name: /generate preview/i }, { timeout: 2000 });
}

// ─────────────────────────────────────────────────────────────────────────────

describe('Suite 02 — PDF Configure Step', () => {
  // PC-01 ────────────────────────────────────────────────────────────────────
  it('PC-01 — shows the file name in the configure header', async () => {
    const { user } = setup();
    await navigateToPdfConfigure(user);
    expect(screen.getByText('document.pdf')).toBeInTheDocument();
  });

  // PC-02 ────────────────────────────────────────────────────────────────────
  it('PC-02 — default quality level is "screen"', async () => {
    const { user } = setup();
    await navigateToPdfConfigure(user);
    // The "Screen" radio must be checked by default
    const screenRadio = screen.getByRole('radio', { hidden: true, name: /screen/i });
    expect(screenRadio).toBeChecked();
  });

  // PC-03 ────────────────────────────────────────────────────────────────────
  it('PC-03 — all four quality options are visible (Web / Screen / Print / Archive)', async () => {
    const { user } = setup();
    await navigateToPdfConfigure(user);
    expect(screen.getByText('Web')).toBeInTheDocument();
    expect(screen.getByText('Screen')).toBeInTheDocument();
    expect(screen.getByText('Print')).toBeInTheDocument();
    expect(screen.getByText('Archive')).toBeInTheDocument();
  });

  // PC-04 ────────────────────────────────────────────────────────────────────
  it('PC-04 — clicking a quality tile selects it', async () => {
    const { user } = setup();
    await navigateToPdfConfigure(user);
    // Click the "Archive" label (visible text), then assert its radio is checked
    await user.click(screen.getByText('Archive'));
    const archiveRadio = screen.getByRole('radio', { hidden: true, name: /archive/i });
    expect(archiveRadio).toBeChecked();
  });

  // PC-05 ────────────────────────────────────────────────────────────────────
  it('PC-05 — entering a target size shows a "Suggested" badge on one quality tile', async () => {
    // Two readFile calls occur during navigation:
    // 1. getFileSizeBytes (in handleFileSelected) — needs any valid bytes
    // 2. getPdfMeta (in App.tsx useEffect) — needs real PDF bytes so fileSizeBytes > 0
    //    and recommendQualityForTarget is called with a valid file size
    vi.mocked(readFile).mockResolvedValueOnce(SAMPLE_PDF_BYTES); // getFileSizeBytes
    vi.mocked(readFile).mockResolvedValueOnce(SAMPLE_PDF_BYTES); // getPdfMeta
    const { user } = setup();
    await navigateToPdfConfigure(user);
    const targetInput = screen.getByPlaceholderText(/e\.g\. 2 MB/i);
    await user.type(targetInput, '500 KB');
    // recommendQualityForTarget mock returns 'web', so "Suggested" badge should appear on Web tile
    expect(screen.getByText('Suggested')).toBeInTheDocument();
  });

  // PC-06 ────────────────────────────────────────────────────────────────────
  it('PC-06 — an invalid target size shows a validation error', async () => {
    const { user } = setup();
    await navigateToPdfConfigure(user);
    // Type something invalid, then click Generate Preview to trigger validation
    const targetInput = screen.getByPlaceholderText(/e\.g\. 2 MB/i);
    await user.type(targetInput, 'not a size');
    await user.click(screen.getByRole('button', { name: /generate preview/i }));
    expect(screen.getByText(/enter a valid size/i)).toBeInTheDocument();
  });

  // PC-07 ────────────────────────────────────────────────────────────────────
  it('PC-07 — clicking Generate Preview triggers processing and shows progress', async () => {
    const { user } = setup();
    await navigateToPdfConfigure(user);
    // processPdf never resolves in this test — we just verify the processing state
    vi.mocked(processPdf).mockReturnValue(new Promise(() => {}));
    await user.click(screen.getByRole('button', { name: /generate preview/i }));
    // Button transitions to "Processing…" and becomes disabled
    expect(await screen.findByRole('button', { name: /processing/i })).toBeDisabled();
  });

  // PC-08 ────────────────────────────────────────────────────────────────────
  it('PC-08 — Back button from PDF Configure returns to the landing page', async () => {
    const { user } = setup();
    await navigateToPdfConfigure(user);
    await user.click(screen.getByRole('button', { name: /^back$/i }));
    expect(screen.getByText('Open file')).toBeInTheDocument();
  });

  // ── Page Resize ────────────────────────────────────────────────────────────

  // PR-01 ────────────────────────────────────────────────────────────────────
  it('PR-01 — resize toggle is OFF by default and its controls are hidden', async () => {
    const { user } = setup();
    await navigateToPdfConfigure(user);
    const toggle = screen.getByRole('switch', { name: /enable page resize/i });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    // Page size dropdown should not be visible while resize is OFF
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  // PR-02 ────────────────────────────────────────────────────────────────────
  it('PR-02 — enabling resize reveals the page size preset dropdown', async () => {
    const { user } = setup();
    await navigateToPdfConfigure(user);
    await user.click(screen.getByRole('switch', { name: /enable page resize/i }));
    expect(screen.getByRole('switch', { name: /enable page resize/i })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('combobox')).toBeInTheDocument(); // page size <select>
  });

  // PR-03 ────────────────────────────────────────────────────────────────────
  it('PR-03 — selecting the Custom preset reveals width and height inputs', async () => {
    const { user } = setup();
    await navigateToPdfConfigure(user);
    await user.click(screen.getByRole('switch', { name: /enable page resize/i }));
    const select = screen.getByRole('combobox');
    await user.selectOptions(select, 'custom');
    expect(screen.getByLabelText(/width/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/height/i)).toBeInTheDocument();
  });

  // PR-04 ────────────────────────────────────────────────────────────────────
  it('PR-04 — page range input accepts a valid range string', async () => {
    const { user } = setup();
    await navigateToPdfConfigure(user);
    await user.click(screen.getByRole('switch', { name: /enable page resize/i }));
    const rangeInput = screen.getByPlaceholderText(/e\.g\. 1-3, 5/i);
    await user.type(rangeInput, '1-3, 5');
    expect(rangeInput).toHaveValue('1-3, 5');
  });

  // PR-05 ────────────────────────────────────────────────────────────────────
  it('PR-05 — Generate Preview is disabled while a processing job is running', async () => {
    const { user } = setup();
    await navigateToPdfConfigure(user);
    vi.mocked(processPdf).mockReturnValue(new Promise(() => {})); // hangs indefinitely
    await user.click(screen.getByRole('button', { name: /generate preview/i }));
    // Button should now show "Processing…" and be disabled
    expect(screen.getByRole('button', { name: /processing/i })).toBeDisabled();
  });
});
