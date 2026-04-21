// @vitest-environment jsdom
/**
 * Suite 06 — Simple PDF Tool Flows (Protect, Unlock, Repair, PDF/A Convert)
 *
 * Covers: PP-01..PP-07, UP-01..UP-07, RP-01..RP-06, PA-01..PA-06
 * Each group tests a dedicated PDF tool flow from dashboard navigation
 * through file selection, configuration, processing, and save step.
 *
 * NOTE: No fake timers — user-event v14 deadlocks with fake timers active.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import App from '@/App';

// ── Mocks ─────────────────────────────────────────────────────────────────────
// LazyStore must be a real class (module-level `new LazyStore()`)
vi.mock('@tauri-apps/plugin-store', () => ({
  LazyStore: class {
    get() { return Promise.resolve(null); }
    set() { return Promise.resolve(undefined); }
    save() { return Promise.resolve(undefined); }
  },
}));
// Make all tools available regardless of Ghostscript/Calibre detection
vi.mock('@/hooks/useDependencies', () => ({
  useDependencies: () => ({
    available: { ghostscript: true, calibre: true, libreoffice: true },
    loading: false,
    getHint: () => '',
    isAvailable: () => true,
  }),
}));
vi.mock('@/hooks/useFileOpen', () => ({ openFilePicker: vi.fn() }));
vi.mock('@/lib/pdfThumbnail', () => ({
  renderAllPdfPages: vi.fn().mockResolvedValue([]),
  renderPdfThumbnail: vi.fn().mockResolvedValue('blob:preview'),
}));
vi.mock('@/lib/pdfProcessor', () => ({
  processPdf: vi.fn(),
  recommendQualityForTarget: vi.fn().mockReturnValue('screen'),
  estimateOutputSizeBytes: vi.fn().mockReturnValue(500 * 1024),
  getPdfImageCount: vi.fn().mockResolvedValue(0),
  getPdfCompressibility: vi.fn().mockResolvedValue({ imageCount: 0, compressibilityScore: 0.5 }),
}));
vi.mock('@/lib/imageProcessor', () => ({ processImage: vi.fn() }));
// save() must never resolve so SaveStep stays in 'dialog-open' state
vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn().mockResolvedValue(null),
  save: vi.fn(() => new Promise(() => {})),
  ask: vi.fn().mockResolvedValue(true),
}));

Object.defineProperty(URL, 'createObjectURL', { value: vi.fn().mockReturnValue('blob:fake'), writable: true });
Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), writable: true });

afterEach(cleanup);

// ── Fake PDF bytes (%PDF header) ─────────────────────────────────────────────
const FAKE_PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x0a]); // %PDF\n

// ── Shared helpers ────────────────────────────────────────────────────────────

async function navigateToTool(toolName: RegExp) {
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getAllByRole('button', { name: toolName })[0]);
  return { user };
}

/** Click "Select PDF" button with open() returning the given path. */
async function selectPdfFile(user: ReturnType<typeof userEvent.setup>, filePath: string) {
  vi.mocked(open).mockResolvedValueOnce(filePath);
  await user.click(await screen.findByRole('button', { name: /select pdf/i }));
}

// ══════════════════════════════════════════════════════════════════════════════
// Protect PDF
// ══════════════════════════════════════════════════════════════════════════════
describe('Suite 06a — Protect PDF', () => {
  // PP-01 ─────────────────────────────────────────────────────────────────────
  it('PP-01 — navigating to Protect PDF shows landing page with select button', async () => {
    await navigateToTool(/protect pdf/i);
    // The tool description is unique to the landing page (not in Dashboard)
    expect(screen.getByText('Add password encryption to a PDF file.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /select pdf/i })).toBeInTheDocument();
  });

  // PP-02 ─────────────────────────────────────────────────────────────────────
  it('PP-02 — selecting a PDF advances to the Set Password step', async () => {
    const { user } = await navigateToTool(/protect pdf/i);
    await selectPdfFile(user, '/test/report.pdf');
    await screen.findByText('Set Password', {}, { timeout: 2000 });
    expect(screen.getByText('Set Password')).toBeInTheDocument();
  });

  // PP-03 ─────────────────────────────────────────────────────────────────────
  it('PP-03 — file name is shown in the password step header', async () => {
    const { user } = await navigateToTool(/protect pdf/i);
    await selectPdfFile(user, '/test/report.pdf');
    await screen.findByText('report.pdf', {}, { timeout: 2000 });
    expect(screen.getByText('report.pdf')).toBeInTheDocument();
  });

  // PP-04 ─────────────────────────────────────────────────────────────────────
  it('PP-04 — Protect PDF button is disabled until both passwords match', async () => {
    const { user } = await navigateToTool(/protect pdf/i);
    await selectPdfFile(user, '/test/report.pdf');
    await screen.findByText('Set Password', {}, { timeout: 2000 });

    // Button is disabled initially (no password entered)
    const protectBtn = screen.getByRole('button', { name: /protect pdf/i });
    expect(protectBtn).toBeDisabled();

    // Enter password only — still disabled (confirm doesn't match)
    await user.type(screen.getByLabelText('Password'), 'secret123');
    expect(protectBtn).toBeDisabled();
  });

  // PP-05 ─────────────────────────────────────────────────────────────────────
  it('PP-05 — matching passwords enable the Protect PDF button', async () => {
    const { user } = await navigateToTool(/protect pdf/i);
    await selectPdfFile(user, '/test/report.pdf');
    await screen.findByText('Set Password', {}, { timeout: 2000 });

    await user.type(screen.getByLabelText('Password'), 'secret123');
    await user.type(screen.getByLabelText('Confirm Password'), 'secret123');

    const protectBtn = screen.getByRole('button', { name: /protect pdf/i });
    expect(protectBtn).not.toBeDisabled();
  });

  // PP-06 ─────────────────────────────────────────────────────────────────────
  it('PP-06 — processing advances to the save step (Choose a save location...)', async () => {
    const { user } = await navigateToTool(/protect pdf/i);
    await selectPdfFile(user, '/test/report.pdf');
    await screen.findByText('Set Password', {}, { timeout: 2000 });

    vi.mocked(invoke).mockResolvedValueOnce(FAKE_PDF_BYTES);
    await user.type(screen.getByLabelText('Password'), 'secret123');
    await user.type(screen.getByLabelText('Confirm Password'), 'secret123');
    await user.click(screen.getByRole('button', { name: /protect pdf/i }));

    // SaveStep auto-triggers save dialog which never resolves → "Choose a save location…"
    await screen.findByText(/choose a save location/i, {}, { timeout: 3000 });
  });

  // PP-07 ─────────────────────────────────────────────────────────────────────
  it('PP-07 — Back button from password step returns to the file picker landing', async () => {
    const { user } = await navigateToTool(/protect pdf/i);
    await selectPdfFile(user, '/test/report.pdf');
    await screen.findByText('Set Password', {}, { timeout: 2000 });

    await user.click(screen.getByRole('button', { name: /^back$/i }));
    expect(screen.getByRole('button', { name: /select pdf/i })).toBeInTheDocument();
    expect(screen.queryByText('Set Password')).not.toBeInTheDocument();
  });

  // PP-08 ─────────────────────────────────────────────────────────────────────
  it('PP-08 — mismatched passwords show a validation error message', async () => {
    const { user } = await navigateToTool(/protect pdf/i);
    await selectPdfFile(user, '/test/report.pdf');
    await screen.findByText('Set Password', {}, { timeout: 2000 });

    await user.type(screen.getByLabelText('Password'), 'secret123');
    await user.type(screen.getByLabelText('Confirm Password'), 'different');

    expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Unlock PDF
// ══════════════════════════════════════════════════════════════════════════════
describe('Suite 06b — Unlock PDF', () => {
  // UP-01 ─────────────────────────────────────────────────────────────────────
  it('UP-01 — navigating to Unlock PDF shows landing page', async () => {
    await navigateToTool(/unlock pdf/i);
    expect(screen.getByText('Remove password protection from a PDF file.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /select pdf/i })).toBeInTheDocument();
  });

  // UP-02 ─────────────────────────────────────────────────────────────────────
  it('UP-02 — selecting a PDF advances to the Enter Password step', async () => {
    const { user } = await navigateToTool(/unlock pdf/i);
    await selectPdfFile(user, '/test/protected.pdf');
    await screen.findByText('Enter Password', {}, { timeout: 2000 });
    expect(screen.getByText('Enter Password')).toBeInTheDocument();
  });

  // UP-03 ─────────────────────────────────────────────────────────────────────
  it('UP-03 — Unlock PDF button is disabled when password field is empty', async () => {
    const { user } = await navigateToTool(/unlock pdf/i);
    await selectPdfFile(user, '/test/protected.pdf');
    await screen.findByText('Enter Password', {}, { timeout: 2000 });

    const unlockBtn = screen.getByRole('button', { name: /unlock pdf/i });
    expect(unlockBtn).toBeDisabled();
  });

  // UP-04 ─────────────────────────────────────────────────────────────────────
  it('UP-04 — entering a password enables the Unlock PDF button', async () => {
    const { user } = await navigateToTool(/unlock pdf/i);
    await selectPdfFile(user, '/test/protected.pdf');
    await screen.findByText('Enter Password', {}, { timeout: 2000 });

    await user.type(screen.getByLabelText('PDF Password'), 'mypassword');
    expect(screen.getByRole('button', { name: /unlock pdf/i })).not.toBeDisabled();
  });

  // UP-05 ─────────────────────────────────────────────────────────────────────
  it('UP-05 — successful unlock navigates to the save step', async () => {
    const { user } = await navigateToTool(/unlock pdf/i);
    await selectPdfFile(user, '/test/protected.pdf');
    await screen.findByText('Enter Password', {}, { timeout: 2000 });

    vi.mocked(invoke).mockResolvedValueOnce(FAKE_PDF_BYTES);
    await user.type(screen.getByLabelText('PDF Password'), 'mypassword');
    await user.click(screen.getByRole('button', { name: /unlock pdf/i }));

    await screen.findByText(/choose a save location/i, {}, { timeout: 3000 });
  });

  // UP-06 ─────────────────────────────────────────────────────────────────────
  it('UP-06 — wrong password shows a user-friendly error message', async () => {
    const { user } = await navigateToTool(/unlock pdf/i);
    await selectPdfFile(user, '/test/protected.pdf');
    await screen.findByText('Enter Password', {}, { timeout: 2000 });

    vi.mocked(invoke).mockRejectedValueOnce(new Error('Wrong password'));
    await user.type(screen.getByLabelText('PDF Password'), 'wrongpass');
    await user.click(screen.getByRole('button', { name: /unlock pdf/i }));

    await screen.findByText(/incorrect password/i, {}, { timeout: 2000 });
  });

  // UP-07 ─────────────────────────────────────────────────────────────────────
  it('UP-07 — Back button from password step returns to the file picker', async () => {
    const { user } = await navigateToTool(/unlock pdf/i);
    await selectPdfFile(user, '/test/protected.pdf');
    await screen.findByText('Enter Password', {}, { timeout: 2000 });

    await user.click(screen.getByRole('button', { name: /^back$/i }));
    expect(screen.getByRole('button', { name: /select pdf/i })).toBeInTheDocument();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Repair PDF
// ══════════════════════════════════════════════════════════════════════════════
describe('Suite 06c — Repair PDF', () => {
  // RP-01 ─────────────────────────────────────────────────────────────────────
  it('RP-01 — navigating to Repair PDF shows landing page', async () => {
    await navigateToTool(/repair pdf/i);
    expect(screen.getByText('Fix structural issues in corrupted or malformed PDFs.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /select pdf/i })).toBeInTheDocument();
  });

  // RP-02 ─────────────────────────────────────────────────────────────────────
  it('RP-02 — selecting a PDF advances to the repair step with action button', async () => {
    const { user } = await navigateToTool(/repair pdf/i);
    await selectPdfFile(user, '/test/corrupted.pdf');
    await screen.findByRole('button', { name: /repair pdf/i }, { timeout: 2000 });
    expect(screen.getByRole('button', { name: /repair pdf/i })).toBeInTheDocument();
  });

  // RP-03 ─────────────────────────────────────────────────────────────────────
  it('RP-03 — repair step shows info about the Ghostscript repair process', async () => {
    const { user } = await navigateToTool(/repair pdf/i);
    await selectPdfFile(user, '/test/corrupted.pdf');
    await screen.findByText(/pdf repair/i, {}, { timeout: 2000 });
    expect(screen.getByText(/ghostscript/i)).toBeInTheDocument();
  });

  // RP-04 ─────────────────────────────────────────────────────────────────────
  it('RP-04 — Repair PDF button triggers processing and advances to the save step', async () => {
    const { user } = await navigateToTool(/repair pdf/i);
    await selectPdfFile(user, '/test/corrupted.pdf');
    await screen.findByRole('button', { name: /repair pdf/i }, { timeout: 2000 });

    vi.mocked(invoke).mockResolvedValueOnce(FAKE_PDF_BYTES);
    await user.click(screen.getByRole('button', { name: /repair pdf/i }));

    await screen.findByText(/choose a save location/i, {}, { timeout: 3000 });
  });

  // RP-05 ─────────────────────────────────────────────────────────────────────
  it('RP-05 — Back button from repair step returns to the file picker', async () => {
    const { user } = await navigateToTool(/repair pdf/i);
    await selectPdfFile(user, '/test/corrupted.pdf');
    await screen.findByRole('button', { name: /repair pdf/i }, { timeout: 2000 });

    await user.click(screen.getByRole('button', { name: /^back$/i }));
    expect(screen.getByRole('button', { name: /select pdf/i })).toBeInTheDocument();
  });

  // RP-06 ─────────────────────────────────────────────────────────────────────
  it('RP-06 — invoke error shows an error message on the repair step', async () => {
    const { user } = await navigateToTool(/repair pdf/i);
    await selectPdfFile(user, '/test/corrupted.pdf');
    await screen.findByRole('button', { name: /repair pdf/i }, { timeout: 2000 });

    vi.mocked(invoke).mockRejectedValueOnce(new Error('Ghostscript not found'));
    await user.click(screen.getByRole('button', { name: /repair pdf/i }));

    await screen.findByText(/ghostscript not found/i, {}, { timeout: 2000 });
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// PDF/A Convert
// ══════════════════════════════════════════════════════════════════════════════
describe('Suite 06d — PDF/A Convert', () => {
  // PA-01 ─────────────────────────────────────────────────────────────────────
  it('PA-01 — navigating to PDF/A Convert shows landing page', async () => {
    await navigateToTool(/pdf\/a convert/i);
    expect(screen.getByText('Convert a PDF to archival format for long-term preservation.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /select pdf/i })).toBeInTheDocument();
  });

  // PA-02 ─────────────────────────────────────────────────────────────────────
  it('PA-02 — selecting a PDF shows the three conformance level options', async () => {
    const { user } = await navigateToTool(/pdf\/a convert/i);
    await selectPdfFile(user, '/test/document.pdf');
    await screen.findByText(/conformance level/i, {}, { timeout: 2000 });
    expect(screen.getByText('PDF/A-1b')).toBeInTheDocument();
    expect(screen.getByText('PDF/A-2b')).toBeInTheDocument();
    expect(screen.getByText('PDF/A-3b')).toBeInTheDocument();
  });

  // PA-03 ─────────────────────────────────────────────────────────────────────
  it('PA-03 — default conformance level is PDF/A-2b', async () => {
    const { user } = await navigateToTool(/pdf\/a convert/i);
    await selectPdfFile(user, '/test/document.pdf');
    await screen.findByText('PDF/A-2b', {}, { timeout: 2000 });

    expect(screen.getByDisplayValue('2')).toBeChecked();
  });

  // PA-04 ─────────────────────────────────────────────────────────────────────
  it('PA-04 — selecting a different conformance level updates the radio selection', async () => {
    const { user } = await navigateToTool(/pdf\/a convert/i);
    await selectPdfFile(user, '/test/document.pdf');
    await screen.findByText('PDF/A-1b', {}, { timeout: 2000 });

    await user.click(screen.getByDisplayValue('1'));
    expect(screen.getByDisplayValue('1')).toBeChecked();
    expect(screen.getByDisplayValue('2')).not.toBeChecked();
  });

  // PA-05 ─────────────────────────────────────────────────────────────────────
  it('PA-05 — clicking Convert advances to the save step', async () => {
    const { user } = await navigateToTool(/pdf\/a convert/i);
    await selectPdfFile(user, '/test/document.pdf');
    await screen.findByRole('button', { name: /^convert$/i }, { timeout: 2000 });

    vi.mocked(invoke).mockResolvedValueOnce(FAKE_PDF_BYTES);
    await user.click(screen.getByRole('button', { name: /^convert$/i }));

    await screen.findByText(/choose a save location/i, {}, { timeout: 3000 });
  });

  // PA-06 ─────────────────────────────────────────────────────────────────────
  it('PA-06 — Back button from configure step returns to the file picker', async () => {
    const { user } = await navigateToTool(/pdf\/a convert/i);
    await selectPdfFile(user, '/test/document.pdf');
    await screen.findByText('PDF/A-2b', {}, { timeout: 2000 });

    await user.click(screen.getByRole('button', { name: /^back$/i }));
    expect(screen.getByRole('button', { name: /select pdf/i })).toBeInTheDocument();
  });
});
