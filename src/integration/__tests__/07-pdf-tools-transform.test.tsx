// @vitest-environment jsdom
/**
 * Suite 07 — PDF Transform Tool Flows (Watermark, Page Numbers, Rotate PDF)
 *
 * Covers: WM-01..WM-07, PN-01..PN-07, RF-01..RF-07
 * Each group tests a dedicated PDF tool flow from dashboard navigation
 * through file selection, configuration, processing, and save step.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { open } from '@tauri-apps/plugin-dialog';
import App from '@/App';

// ── Mocks ─────────────────────────────────────────────────────────────────────
vi.mock('@tauri-apps/plugin-store', () => ({
  LazyStore: class {
    get() { return Promise.resolve(null); }
    set() { return Promise.resolve(undefined); }
    save() { return Promise.resolve(undefined); }
  },
}));
vi.mock('@/hooks/useDependencies', () => ({
  useDependencies: () => ({
    available: { ghostscript: true, calibre: true, libreoffice: true },
    loading: false,
    getHint: () => '',
    isAvailable: () => true,
  }),
}));
vi.mock('@/hooks/useFileOpen', () => ({ openFilePicker: vi.fn() }));

// Thumbnail generation — return empty arrays/fake URLs for all tests
vi.mock('@/lib/pdfThumbnail', () => ({
  renderAllPdfPages: vi.fn().mockResolvedValue([]),
  renderPdfThumbnail: vi.fn().mockResolvedValue('blob:preview'),
}));

// pdf-lib — mock PDFDocument.load to succeed without real PDF bytes
vi.mock('pdf-lib', () => ({
  PDFDocument: {
    load: vi.fn().mockResolvedValue({
      getPageCount: vi.fn().mockReturnValue(3),
    }),
    create: vi.fn().mockResolvedValue({
      addPage: vi.fn(),
      save: vi.fn().mockResolvedValue(new Uint8Array([0x25, 0x50, 0x44, 0x46])),
    }),
  },
  degrees: (d: number) => d,
  rgb: () => ({}),
  StandardFonts: { Helvetica: 'Helvetica', HelveticaBold: 'HelveticaBold' },
}));

// Watermark lib — mock addWatermark to return fake processed bytes
vi.mock('@/lib/pdfWatermark', () => ({
  addWatermark: vi.fn().mockResolvedValue(new Uint8Array([0x25, 0x50, 0x44, 0x46])),
  DEFAULT_WATERMARK_OPTIONS: {
    text: 'DRAFT',
    fontSize: 48,
    opacity: 0.3,
    rotation: -45,
    color: 'gray',
  },
}));

// Page numbers lib — mock addPageNumbers
vi.mock('@/lib/pdfPageNumbers', () => ({
  addPageNumbers: vi.fn().mockResolvedValue(new Uint8Array([0x25, 0x50, 0x44, 0x46])),
  formatNumber: vi.fn().mockImplementation((n: number) => String(n)),
}));

// Rotate PDF lib — mock rotatePdf
vi.mock('@/lib/pdfRotate', () => ({
  rotatePdf: vi.fn().mockResolvedValue({ bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46]) }),
  cycleRotation: vi.fn().mockImplementation((r: number) => ((r + 90) % 360)),
}));

vi.mock('@/lib/pdfProcessor', () => ({
  processPdf: vi.fn(),
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

// ── Shared helpers ────────────────────────────────────────────────────────────

async function navigateToTool(toolName: RegExp) {
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getAllByRole('button', { name: toolName })[0]);
  return { user };
}

async function selectPdfFile(user: ReturnType<typeof userEvent.setup>, filePath: string) {
  vi.mocked(open).mockResolvedValueOnce(filePath);
  await user.click(await screen.findByRole('button', { name: /select pdf/i }));
}

// ══════════════════════════════════════════════════════════════════════════════
// Watermark
// ══════════════════════════════════════════════════════════════════════════════
describe('Suite 07a — Watermark', () => {
  // WM-01 ─────────────────────────────────────────────────────────────────────
  it('WM-01 — navigating to Watermark shows the landing page', async () => {
    await navigateToTool(/watermark/i);
    expect(screen.getByText('Add Watermark')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /select pdf/i })).toBeInTheDocument();
  });

  // WM-02 ─────────────────────────────────────────────────────────────────────
  it('WM-02 — selecting a PDF advances to the Watermark Options step', async () => {
    const { user } = await navigateToTool(/watermark/i);
    await selectPdfFile(user, '/test/document.pdf');
    await screen.findByText('Watermark Options', {}, { timeout: 2000 });
    expect(screen.getByText('Watermark Options')).toBeInTheDocument();
  });

  // WM-03 ─────────────────────────────────────────────────────────────────────
  it('WM-03 — watermark text input is visible in the configure step', async () => {
    const { user } = await navigateToTool(/watermark/i);
    await selectPdfFile(user, '/test/document.pdf');
    await screen.findByText('Watermark Options', {}, { timeout: 2000 });
    expect(screen.getByPlaceholderText(/enter watermark text/i)).toBeInTheDocument();
  });

  // WM-04 ─────────────────────────────────────────────────────────────────────
  it('WM-04 — Apply Watermark button is disabled when text is empty', async () => {
    const { user } = await navigateToTool(/watermark/i);
    await selectPdfFile(user, '/test/document.pdf');
    await screen.findByText('Watermark Options', {}, { timeout: 2000 });

    // Clear the default text and check that button is disabled
    const textInput = screen.getByPlaceholderText(/enter watermark text/i);
    await user.clear(textInput);

    expect(screen.getByRole('button', { name: /apply watermark/i })).toBeDisabled();
  });

  // WM-05 ─────────────────────────────────────────────────────────────────────
  it('WM-05 — font size buttons are present and selectable', async () => {
    const { user } = await navigateToTool(/watermark/i);
    await selectPdfFile(user, '/test/document.pdf');
    await screen.findByText('Watermark Options', {}, { timeout: 2000 });

    expect(screen.getByRole('button', { name: /^small$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^medium$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^large$/i })).toBeInTheDocument();
  });

  // WM-06 ─────────────────────────────────────────────────────────────────────
  it('WM-06 — applying watermark advances to the save step', async () => {
    const { user } = await navigateToTool(/watermark/i);
    await selectPdfFile(user, '/test/document.pdf');
    await screen.findByText('Watermark Options', {}, { timeout: 2000 });

    const textInput = screen.getByPlaceholderText(/enter watermark text/i);
    await user.clear(textInput);
    await user.type(textInput, 'CONFIDENTIAL');

    await user.click(screen.getByRole('button', { name: /apply watermark/i }));
    await screen.findByText(/choose a save location/i, {}, { timeout: 3000 });
  });

  // WM-07 ─────────────────────────────────────────────────────────────────────
  it('WM-07 — Back button from configure step returns to the file picker', async () => {
    const { user } = await navigateToTool(/watermark/i);
    await selectPdfFile(user, '/test/document.pdf');
    await screen.findByText('Watermark Options', {}, { timeout: 2000 });

    await user.click(screen.getByRole('button', { name: /^back$/i }));
    expect(screen.getByRole('button', { name: /select pdf/i })).toBeInTheDocument();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Page Numbers
// ══════════════════════════════════════════════════════════════════════════════
describe('Suite 07b — Page Numbers', () => {
  // PN-01 ─────────────────────────────────────────────────────────────────────
  it('PN-01 — navigating to Page Numbers shows the landing page', async () => {
    await navigateToTool(/page numbers/i);
    expect(screen.getByText('Add Page Numbers')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /select pdf/i })).toBeInTheDocument();
  });

  // PN-02 ─────────────────────────────────────────────────────────────────────
  it('PN-02 — selecting a PDF advances to the Page Number Options step', async () => {
    const { user } = await navigateToTool(/page numbers/i);
    await selectPdfFile(user, '/test/document.pdf');
    await screen.findByText('Page Number Options', {}, { timeout: 2000 });
    expect(screen.getByText('Page Number Options')).toBeInTheDocument();
  });

  // PN-03 ─────────────────────────────────────────────────────────────────────
  it('PN-03 — page number options include position buttons', async () => {
    const { user } = await navigateToTool(/page numbers/i);
    await selectPdfFile(user, '/test/document.pdf');
    await screen.findByText('Page Number Options', {}, { timeout: 2000 });

    expect(screen.getByRole('button', { name: /bottom center/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /top center/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /bottom left/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /bottom right/i })).toBeInTheDocument();
  });

  // PN-04 ─────────────────────────────────────────────────────────────────────
  it('PN-04 — format options include numeric, roman, and alphabetic', async () => {
    const { user } = await navigateToTool(/page numbers/i);
    await selectPdfFile(user, '/test/document.pdf');
    await screen.findByText('Page Number Options', {}, { timeout: 2000 });

    expect(screen.getByRole('button', { name: /1, 2, 3/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /i, ii, iii/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /a, b, c/i })).toBeInTheDocument();
  });

  // PN-05 ─────────────────────────────────────────────────────────────────────
  it('PN-05 — the page count from PDF is shown in the info text', async () => {
    const { user } = await navigateToTool(/page numbers/i);
    await selectPdfFile(user, '/test/document.pdf');
    await screen.findByText('Page Number Options', {}, { timeout: 2000 });

    // mockPDFDocument returns 3 pages
    expect(screen.getByText(/3 pages/i)).toBeInTheDocument();
  });

  // PN-06 ─────────────────────────────────────────────────────────────────────
  it('PN-06 — applying page numbers advances to the save step', async () => {
    const { user } = await navigateToTool(/page numbers/i);
    await selectPdfFile(user, '/test/document.pdf');
    await screen.findByRole('button', { name: /apply page numbers/i }, { timeout: 2000 });

    await user.click(screen.getByRole('button', { name: /apply page numbers/i }));
    await screen.findByText(/choose a save location/i, {}, { timeout: 3000 });
  });

  // PN-07 ─────────────────────────────────────────────────────────────────────
  it('PN-07 — Back button from configure step returns to the file picker', async () => {
    const { user } = await navigateToTool(/page numbers/i);
    await selectPdfFile(user, '/test/document.pdf');
    await screen.findByText('Page Number Options', {}, { timeout: 2000 });

    await user.click(screen.getByRole('button', { name: /^back$/i }));
    expect(screen.getByRole('button', { name: /select pdf/i })).toBeInTheDocument();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Rotate PDF
// ══════════════════════════════════════════════════════════════════════════════
describe('Suite 07c — Rotate PDF', () => {
  // RF-01 ─────────────────────────────────────────────────────────────────────
  it('RF-01 — navigating to Rotate PDF shows the landing page', async () => {
    await navigateToTool(/rotate pdf/i);
    expect(screen.getByText('Select a PDF to rotate individual or all pages.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /select pdf/i })).toBeInTheDocument();
  });

  // RF-02 ─────────────────────────────────────────────────────────────────────
  it('RF-02 — selecting a PDF advances to the Rotate Pages step', async () => {
    const { user } = await navigateToTool(/rotate pdf/i);
    await selectPdfFile(user, '/test/document.pdf');
    await screen.findByText('Rotate Pages', {}, { timeout: 2000 });
    expect(screen.getByText('Rotate Pages')).toBeInTheDocument();
  });

  // RF-03 ─────────────────────────────────────────────────────────────────────
  it('RF-03 — rotate step shows "All Left" and "All Right" buttons', async () => {
    const { user } = await navigateToTool(/rotate pdf/i);
    await selectPdfFile(user, '/test/document.pdf');
    await screen.findByText('Rotate Pages', {}, { timeout: 2000 });

    expect(screen.getByRole('button', { name: /all left/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /all right/i })).toBeInTheDocument();
  });

  // RF-04 ─────────────────────────────────────────────────────────────────────
  it('RF-04 — Apply & Save is disabled before any rotation is applied', async () => {
    const { user } = await navigateToTool(/rotate pdf/i);
    await selectPdfFile(user, '/test/document.pdf');
    await screen.findByText('Rotate Pages', {}, { timeout: 2000 });

    expect(screen.getByRole('button', { name: /apply & save/i })).toBeDisabled();
  });

  // RF-05 ─────────────────────────────────────────────────────────────────────
  it('RF-05 — clicking All Right enables the Apply & Save button', async () => {
    const { user } = await navigateToTool(/rotate pdf/i);
    await selectPdfFile(user, '/test/document.pdf');
    await screen.findByText('Rotate Pages', {}, { timeout: 2000 });

    await user.click(screen.getByRole('button', { name: /all right/i }));
    expect(screen.getByRole('button', { name: /apply & save/i })).not.toBeDisabled();
  });

  // RF-06 ─────────────────────────────────────────────────────────────────────
  it('RF-06 — applying rotation navigates to the save step', async () => {
    const { user } = await navigateToTool(/rotate pdf/i);
    await selectPdfFile(user, '/test/document.pdf');
    await screen.findByText('Rotate Pages', {}, { timeout: 2000 });

    await user.click(screen.getByRole('button', { name: /all right/i }));
    await user.click(screen.getByRole('button', { name: /apply & save/i }));

    await screen.findByText(/choose a save location/i, {}, { timeout: 3000 });
  });

  // RF-07 ─────────────────────────────────────────────────────────────────────
  it('RF-07 — Back button from rotate step returns to the file picker', async () => {
    const { user } = await navigateToTool(/rotate pdf/i);
    await selectPdfFile(user, '/test/document.pdf');
    await screen.findByText('Rotate Pages', {}, { timeout: 2000 });

    await user.click(screen.getByRole('button', { name: /^back$/i }));
    expect(screen.getByRole('button', { name: /select pdf/i })).toBeInTheDocument();
  });
});
