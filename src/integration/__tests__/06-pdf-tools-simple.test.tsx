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
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { readFile } from '@tauri-apps/plugin-fs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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
  // Protect now refuses a PDF that is already encrypted, so every case that is
  // meant to get through has to be handed one that is not. Set per test rather
  // than left to the shared stub: PP-10 swaps in a locked file, and a
  // mockResolvedValue outlives the test that set it.
  const PLAIN = new Uint8Array(
    readFileSync(join(process.cwd(), 'test-fixtures', 'warnock_camelot.pdf')),
  );
  beforeEach(() => {
    vi.mocked(readFile).mockResolvedValue(PLAIN);
  });

  // PP-10 ─────────────────────────────────────────────────────────────────────
  it('PP-10 — refuses a PDF that is already password-protected', async () => {
    // The mirror of UP-08, found while fixing it. Nothing stopped you
    // encrypting an already-encrypted document. Ghostscript cannot open one
    // without its existing password, so it refused with a raw
    // "User password is specified. Need an Owner password or both." and left a
    // zero-byte file behind — after the password had been typed twice and the
    // acknowledgement ticked.
    const { user } = await navigateToTool(/protect pdf/i);
    vi.mocked(readFile).mockResolvedValue(
      new Uint8Array(readFileSync(join(process.cwd(), 'test-fixtures', 'locked.pdf'))),
    );

    await selectPdfFile(user, '/test/locked.pdf');

    await screen.findByText(/already password-protected/i, {}, { timeout: 2000 });
    expect(
      screen.queryByLabelText(/^password$/i),
      'an already-protected PDF must not reach the password screen',
    ).not.toBeInTheDocument();
  });

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
  it('PP-04 — Protect PDF button is disabled until both fields are filled', async () => {
    const { user } = await navigateToTool(/protect pdf/i);
    await selectPdfFile(user, '/test/report.pdf');
    await screen.findByText('Set Password', {}, { timeout: 2000 });

    // Button is disabled initially (no password entered)
    const protectBtn = screen.getByRole('button', { name: /protect pdf/i });
    expect(protectBtn).toBeDisabled();

    // Enter password only — still disabled: the confirmation is empty, which is
    // not a mismatch to report, it is an unfinished form.
    await user.type(screen.getByLabelText('Password'), 'secret123');
    expect(protectBtn).toBeDisabled();
  });

  // PP-05 ─────────────────────────────────────────────────────────────────────
  it('PP-05 — matching passwords plus the accepted warning enable the button', async () => {
    const { user } = await navigateToTool(/protect pdf/i);
    await selectPdfFile(user, '/test/report.pdf');
    await screen.findByText('Set Password', {}, { timeout: 2000 });

    await user.type(screen.getByLabelText('Password'), 'secret123');
    await user.type(screen.getByLabelText('Confirm password'), 'secret123');
    await user.click(screen.getByTestId('protect-ack'));

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
    await user.type(screen.getByLabelText('Confirm password'), 'secret123');
    await user.click(screen.getByTestId('protect-ack'));
    await user.click(screen.getByRole('button', { name: /protect pdf/i }));

    // SaveStep auto-triggers save dialog which never resolves → "Choose a save location…"
    await screen.findByText(/choose a save location|save changes to/i, {}, { timeout: 3000 });
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
  it('PP-08 — a half-typed confirmation is not called wrong', async () => {
    // Reported from a real Linux build: "Passwords do not match" appeared on the
    // first keystroke of the confirmation and stayed until the last one. Every
    // correct entry was accused of being wrong while it was being made.
    const { user } = await navigateToTool(/protect pdf/i);
    await selectPdfFile(user, '/test/report.pdf');
    await screen.findByText('Set Password', {}, { timeout: 2000 });

    await user.type(screen.getByLabelText('Password'), 'secret123');
    await user.type(screen.getByLabelText('Confirm password'), 'secret');

    expect(screen.queryByText(/passwords do not match/i)).not.toBeInTheDocument();
  });

  // PP-09 ─────────────────────────────────────────────────────────────────────
  it('PP-09 — clicking Protect with a real mismatch reports it and does not encrypt', async () => {
    const { user } = await navigateToTool(/protect pdf/i);
    await selectPdfFile(user, '/test/report.pdf');
    await screen.findByText('Set Password', {}, { timeout: 2000 });

    await user.type(screen.getByLabelText('Password'), 'secret123');
    await user.type(screen.getByLabelText('Confirm password'), 'different');
    await user.click(screen.getByTestId('protect-ack'));

    // The button has to be reachable, or "check on click" can never happen:
    // it used to be disabled by the very condition it needed to report.
    const protectBtn = screen.getByRole('button', { name: /protect pdf/i });
    expect(protectBtn).not.toBeDisabled();

    // The invoke mock is shared across this suite and its calls accumulate, so
    // "was not called" only means anything from a cleared baseline.
    vi.mocked(invoke).mockClear();
    await user.click(protectBtn);

    expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument();
    expect(vi.mocked(invoke)).not.toHaveBeenCalled();
    expect(screen.getByText('Set Password')).toBeInTheDocument();
  });

  // PP-10 ─────────────────────────────────────────────────────────────────────
  it('PP-10 — correcting the confirmation clears the complaint', async () => {
    // Otherwise the message outlives the mistake and the user is told they are
    // wrong while they are typing the fix.
    const { user } = await navigateToTool(/protect pdf/i);
    await selectPdfFile(user, '/test/report.pdf');
    await screen.findByText('Set Password', {}, { timeout: 2000 });

    await user.type(screen.getByLabelText('Password'), 'secret123');
    await user.type(screen.getByLabelText('Confirm password'), 'different');
    await user.click(screen.getByTestId('protect-ack'));
    await user.click(screen.getByRole('button', { name: /protect pdf/i }));
    expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument();

    await user.type(screen.getByLabelText('Confirm password'), 'x');
    expect(screen.queryByText(/passwords do not match/i)).not.toBeInTheDocument();
  });

  // PP-11 ─────────────────────────────────────────────────────────────────────
  it('PP-11 — an empty confirmation still cannot be submitted', async () => {
    const { user } = await navigateToTool(/protect pdf/i);
    await selectPdfFile(user, '/test/report.pdf');
    await screen.findByText('Set Password', {}, { timeout: 2000 });

    await user.type(screen.getByLabelText('Password'), 'secret123');
    expect(screen.getByRole('button', { name: /protect pdf/i })).toBeDisabled();
  });

  // PP-12 ─────────────────────────────────────────────────────────────────────
  it('PP-12 — Protect stays out of reach until the password warning is accepted', async () => {
    // A lost password cannot be recovered by anyone, so the one thing the app
    // can do is make sure nobody encrypts a file believing otherwise.
    const { user } = await navigateToTool(/protect pdf/i);
    await selectPdfFile(user, '/test/report.pdf');
    await screen.findByText('Set Password', {}, { timeout: 2000 });

    await user.type(screen.getByLabelText('Password'), 'secret123');
    await user.type(screen.getByLabelText('Confirm password'), 'secret123');

    const protectBtn = screen.getByRole('button', { name: /protect pdf/i });
    expect(protectBtn, 'matching passwords alone must not be enough').toBeDisabled();

    await user.click(screen.getByTestId('protect-ack'));
    expect(protectBtn).not.toBeDisabled();

    // And it can be taken back.
    await user.click(screen.getByTestId('protect-ack'));
    expect(protectBtn).toBeDisabled();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Unlock PDF
// ══════════════════════════════════════════════════════════════════════════════
describe('Suite 06b — Unlock PDF', () => {
  // Unlock now refuses a PDF that has no password on it, so these must hand it
  // one that does. locked.pdf is a real encrypted file (Ghostscript, RC4-128,
  // user password `papercut`), not the shared %PDF- stub -- which is exactly
  // the unprotected input the tool is now right to turn away.
  const LOCKED = new Uint8Array(
    readFileSync(join(process.cwd(), 'test-fixtures', 'locked.pdf')),
  );
  beforeEach(() => {
    vi.mocked(readFile).mockResolvedValue(LOCKED);
  });

  // UP-08 ─────────────────────────────────────────────────────────────────────
  it('UP-08 — refuses a PDF that has no password on it', async () => {
    // Reported from a real build: Unlock accepted any PDF at all. An
    // unprotected document went straight to the password screen, where nothing
    // typed could be right, and unlocking it produced a second identical file.
    const { user } = await navigateToTool(/unlock pdf/i);
    vi.mocked(readFile).mockResolvedValue(
      new Uint8Array(readFileSync(join(process.cwd(), 'test-fixtures', 'warnock_camelot.pdf'))),
    );

    await selectPdfFile(user, '/test/plain.pdf');

    await screen.findByText(/not password-protected/i, {}, { timeout: 2000 });
    expect(
      screen.queryByText('Enter the PDF password'),
      'an unprotected PDF must not reach the password screen',
    ).not.toBeInTheDocument();
  });

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
    await screen.findByText('Enter password', {}, { timeout: 2000 });
    expect(screen.getByText('Enter password')).toBeInTheDocument();
  });

  // UP-03 ─────────────────────────────────────────────────────────────────────
  it('UP-03 — Unlock PDF button is disabled when password field is empty', async () => {
    const { user } = await navigateToTool(/unlock pdf/i);
    await selectPdfFile(user, '/test/protected.pdf');
    await screen.findByText('Enter password', {}, { timeout: 2000 });

    const unlockBtn = screen.getByRole('button', { name: /unlock pdf/i });
    expect(unlockBtn).toBeDisabled();
  });

  // UP-04 ─────────────────────────────────────────────────────────────────────
  it('UP-04 — entering a password enables the Unlock PDF button', async () => {
    const { user } = await navigateToTool(/unlock pdf/i);
    await selectPdfFile(user, '/test/protected.pdf');
    await screen.findByText('Enter password', {}, { timeout: 2000 });

    await user.type(screen.getByLabelText('PDF Password'), 'mypassword');
    expect(screen.getByRole('button', { name: /unlock pdf/i })).not.toBeDisabled();
  });

  // UP-05 ─────────────────────────────────────────────────────────────────────
  it('UP-05 — successful unlock navigates to the save step', async () => {
    const { user } = await navigateToTool(/unlock pdf/i);
    await selectPdfFile(user, '/test/protected.pdf');
    await screen.findByText('Enter password', {}, { timeout: 2000 });

    vi.mocked(invoke).mockResolvedValueOnce(FAKE_PDF_BYTES);
    await user.type(screen.getByLabelText('PDF Password'), 'mypassword');
    await user.click(screen.getByRole('button', { name: /unlock pdf/i }));

    await screen.findByText(/choose a save location|save changes to/i, {}, { timeout: 3000 });
  });

  // UP-06 ─────────────────────────────────────────────────────────────────────
  it('UP-06 — wrong password shows a user-friendly error message', async () => {
    const { user } = await navigateToTool(/unlock pdf/i);
    await selectPdfFile(user, '/test/protected.pdf');
    await screen.findByText('Enter password', {}, { timeout: 2000 });

    vi.mocked(invoke).mockRejectedValueOnce(new Error('Wrong password'));
    await user.type(screen.getByLabelText('PDF Password'), 'wrongpass');
    await user.click(screen.getByRole('button', { name: /unlock pdf/i }));

    await screen.findByText(/incorrect password/i, {}, { timeout: 2000 });
  });

  // UP-07 ─────────────────────────────────────────────────────────────────────
  it('UP-07 — Back button from password step returns to the file picker', async () => {
    const { user } = await navigateToTool(/unlock pdf/i);
    await selectPdfFile(user, '/test/protected.pdf');
    await screen.findByText('Enter password', {}, { timeout: 2000 });

    await user.click(screen.getByRole('button', { name: /^back$/i }));
    expect(screen.getByRole('button', { name: /select pdf/i })).toBeInTheDocument();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Repair PDF
// ══════════════════════════════════════════════════════════════════════════════
describe('Suite 06c — Repair PDF', () => {
  // Repair and PDF/A read the file at acceptance now, to refuse a locked
  // document (LOCK-01), so each has to say what it is being handed. Before the
  // guard they never read it and could inherit whatever the previous suite left
  // behind -- and PP-10 leaves `readFile` returning a locked PDF, exactly as
  // the warning above it says.
  const PLAIN_PDF = new Uint8Array(
    readFileSync(join(process.cwd(), 'test-fixtures', 'warnock_camelot.pdf')),
  );
  beforeEach(() => {
    vi.mocked(readFile).mockResolvedValue(PLAIN_PDF);
  });

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

    await screen.findByText(/choose a save location|save changes to/i, {}, { timeout: 3000 });
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
  // Repair and PDF/A read the file at acceptance now, to refuse a locked
  // document (LOCK-01), so each has to say what it is being handed. Before the
  // guard they never read it and could inherit whatever the previous suite left
  // behind -- and PP-10 leaves `readFile` returning a locked PDF, exactly as
  // the warning above it says.
  const PLAIN_PDF = new Uint8Array(
    readFileSync(join(process.cwd(), 'test-fixtures', 'warnock_camelot.pdf')),
  );
  beforeEach(() => {
    vi.mocked(readFile).mockResolvedValue(PLAIN_PDF);
  });

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

    await screen.findByText(/choose a save location|save changes to/i, {}, { timeout: 3000 });
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
