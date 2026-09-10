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

