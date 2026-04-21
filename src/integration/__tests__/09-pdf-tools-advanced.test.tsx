// @vitest-environment jsdom
/**
 * Suite 09 — Multi-file and Advanced PDF Tool Flows
 *
 * Covers: MP-01..MP-06, SP-01..SP-06, CP-01..CP-06, OP-01..OP-05
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

// pdf-lib — mock PDFDocument.load to succeed without real PDF bytes
vi.mock('pdf-lib', () => ({
  PDFDocument: {
    load: vi.fn().mockResolvedValue({
      getPageCount: vi.fn().mockReturnValue(3),
      getPage: vi.fn().mockReturnValue({
        getSize: vi.fn().mockReturnValue({ width: 595, height: 842 }),
      }),
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

// Thumbnail rendering — return 3 fake page URLs for organize/rotate tests
vi.mock('@/lib/pdfThumbnail', () => ({
  renderAllPdfPages: vi.fn().mockResolvedValue(['blob:p1', 'blob:p2', 'blob:p3']),
  renderPdfThumbnail: vi.fn().mockResolvedValue('blob:page-preview'),
}));

// Merge lib — mock loading and merging
vi.mock('@/lib/pdfMerge', () => ({
  loadPdfForMerge: vi.fn().mockImplementation((filePath: string) =>
    Promise.resolve({
      filePath,
      bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
      pageCount: 3,
      fileName: filePath.split('/').pop() ?? filePath,
      previewUrl: 'blob:preview',
    }),
  ),
  mergePdfs: vi.fn().mockResolvedValue({
    bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
    pageCount: 6,
  }),
}));

// Split lib — keep real parsePageRangeText but mock the heavy splitPdf
vi.mock('@/lib/pdfSplit', async () => {
  const actual = await vi.importActual<typeof import('@/lib/pdfSplit')>('@/lib/pdfSplit');
  return {
    ...actual,
    splitPdf: vi.fn().mockResolvedValue({
      outputs: [
        { fileName: 'doc-1.pdf', bytes: new Uint8Array([0x25, 0x50]) },
        { fileName: 'doc-2.pdf', bytes: new Uint8Array([0x25, 0x50]) },
      ],
    }),
  };
});

// Crop lib — mock cropPdf to return fake bytes
vi.mock('@/lib/pdfCrop', async () => {
  const actual = await vi.importActual<typeof import('@/lib/pdfCrop')>('@/lib/pdfCrop');
  return {
    ...actual,
    cropPdf: vi.fn().mockResolvedValue(new Uint8Array([0x25, 0x50, 0x44, 0x46])),
  };
});

// Organize lib — mock organizePdf to return fake bytes
vi.mock('@/lib/pdfOrganize', () => ({
  organizePdf: vi.fn().mockResolvedValue(new Uint8Array([0x25, 0x50, 0x44, 0x46])),
}));

vi.mock('@/lib/pdfProcessor', () => ({
  processPdf: vi.fn(),
  estimateOutputSizeBytes: vi.fn().mockReturnValue(500 * 1024),
  getPdfCompressibility: vi.fn().mockResolvedValue({ imageCount: 0, compressibilityScore: 0.5 }),
}));
vi.mock('@/lib/imageProcessor', () => ({ processImage: vi.fn() }));

// save() must never resolve so single-file SaveStep stays in 'dialog-open' state
vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn().mockResolvedValue(null),
  save: vi.fn(() => new Promise(() => {})),
  ask: vi.fn().mockResolvedValue(true),
}));

Object.defineProperty(URL, 'createObjectURL', { value: vi.fn().mockReturnValue('blob:fake'), writable: true });
Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), writable: true });

afterEach(cleanup);

// ── Shared helpers ────────────────────────────────────────────────────────────

/** Navigate to a tool whose card name starts with the given prefix. */
async function navigateToTool(toolNamePrefix: RegExp) {
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getAllByRole('button', { name: toolNamePrefix })[0]);
  return { user };
}

async function selectPdfFile(user: ReturnType<typeof userEvent.setup>, filePath: string) {
  vi.mocked(open).mockResolvedValueOnce(filePath);
  await user.click(await screen.findByRole('button', { name: /^select pdf$/i }));
}

// ══════════════════════════════════════════════════════════════════════════════
// Merge PDF
// ══════════════════════════════════════════════════════════════════════════════
describe('Suite 09a — Merge PDF', () => {
  // MP-01 ─────────────────────────────────────────────────────────────────────
  it('MP-01 — navigating to Merge PDF shows the landing page', async () => {
    await navigateToTool(/^Merge PDF/);
    expect(screen.getByText('Select two or more PDFs to combine into one.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /select pdfs/i })).toBeInTheDocument();
  });

  // MP-02 ─────────────────────────────────────────────────────────────────────
  it('MP-02 — selecting two PDFs shows file names and the Continue button', async () => {
    const { user } = await navigateToTool(/^Merge PDF/);
    vi.mocked(open).mockResolvedValueOnce(['/test/a.pdf', '/test/b.pdf'] as unknown as string);
    await user.click(screen.getByRole('button', { name: /select pdfs/i }));

    // File names should appear in the list
    await screen.findByText('a.pdf', {}, { timeout: 2000 });
    expect(screen.getByText('a.pdf')).toBeInTheDocument();
    expect(screen.getByText('b.pdf')).toBeInTheDocument();
  });

  // MP-03 ─────────────────────────────────────────────────────────────────────
  it('MP-03 — Continue button is available after selecting PDFs', async () => {
    const { user } = await navigateToTool(/^Merge PDF/);
    vi.mocked(open).mockResolvedValueOnce(['/test/a.pdf', '/test/b.pdf'] as unknown as string);
    await user.click(screen.getByRole('button', { name: /select pdfs/i }));

    await screen.findByText('a.pdf', {}, { timeout: 2000 });
    const continueBtn = screen.getByRole('button', { name: /^continue$/i });
    expect(continueBtn).not.toBeDisabled();
  });

  // MP-04 ─────────────────────────────────────────────────────────────────────
  it('MP-04 — Continue button advances to the merge order step', async () => {
    const { user } = await navigateToTool(/^Merge PDF/);
    vi.mocked(open).mockResolvedValueOnce(['/test/a.pdf', '/test/b.pdf'] as unknown as string);
    await user.click(screen.getByRole('button', { name: /select pdfs/i }));

    await screen.findByText('a.pdf', {}, { timeout: 2000 });
    await user.click(screen.getByRole('button', { name: /^continue$/i }));
    await screen.findByRole('button', { name: /merge & save/i }, { timeout: 2000 });
    expect(screen.getByRole('button', { name: /merge & save/i })).toBeInTheDocument();
  });

  // MP-05 ─────────────────────────────────────────────────────────────────────
  it('MP-05 — Merge & Save triggers processing and advances to save step', async () => {
    const { user } = await navigateToTool(/^Merge PDF/);
    vi.mocked(open).mockResolvedValueOnce(['/test/a.pdf', '/test/b.pdf'] as unknown as string);
    await user.click(screen.getByRole('button', { name: /select pdfs/i }));
    await screen.findByText('a.pdf', {}, { timeout: 2000 });
    await user.click(screen.getByRole('button', { name: /^continue$/i }));
    await screen.findByRole('button', { name: /merge & save/i }, { timeout: 2000 });

    await user.click(screen.getByRole('button', { name: /merge & save/i }));
    await screen.findByText(/choose a save location/i, {}, { timeout: 3000 });
  });

  // MP-06 ─────────────────────────────────────────────────────────────────────
  it('MP-06 — Back button from order step returns to the file picker', async () => {
    const { user } = await navigateToTool(/^Merge PDF/);
    vi.mocked(open).mockResolvedValueOnce(['/test/a.pdf', '/test/b.pdf'] as unknown as string);
    await user.click(screen.getByRole('button', { name: /select pdfs/i }));
    await screen.findByText('a.pdf', {}, { timeout: 2000 });
    await user.click(screen.getByRole('button', { name: /^continue$/i }));
    await screen.findByRole('button', { name: /merge & save/i }, { timeout: 2000 });

    await user.click(screen.getByRole('button', { name: /^back$/i }));
    expect(screen.getByRole('button', { name: /select pdfs/i })).toBeInTheDocument();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Split PDF
// ══════════════════════════════════════════════════════════════════════════════
describe('Suite 09b — Split PDF', () => {
  // SP-01 ─────────────────────────────────────────────────────────────────────
  it('SP-01 — navigating to Split PDF shows the landing page', async () => {
    await navigateToTool(/^Split PDF/);
    expect(screen.getByText('Select a PDF to split into multiple files.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^select pdf$/i })).toBeInTheDocument();
  });

  // SP-02 ─────────────────────────────────────────────────────────────────────
  it('SP-02 — selecting a PDF advances to the split configuration step', async () => {
    const { user } = await navigateToTool(/^Split PDF/);
    await selectPdfFile(user, '/test/document.pdf');
    await screen.findByRole('button', { name: /by range/i }, { timeout: 2000 });
    expect(screen.getByRole('button', { name: /by range/i })).toBeInTheDocument();
  });

  // SP-03 ─────────────────────────────────────────────────────────────────────
  it('SP-03 — split step shows three mode tabs: By Range, Every N Pages, Extract All', async () => {
    const { user } = await navigateToTool(/^Split PDF/);
    await selectPdfFile(user, '/test/document.pdf');
    await screen.findByRole('button', { name: /by range/i }, { timeout: 2000 });

    expect(screen.getByRole('button', { name: /by range/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /every n pages/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /extract all/i })).toBeInTheDocument();
  });

  // SP-04 ─────────────────────────────────────────────────────────────────────
  it('SP-04 — switching to Extract All mode enables the Split button', async () => {
    const { user } = await navigateToTool(/^Split PDF/);
    await selectPdfFile(user, '/test/document.pdf');
    await screen.findByRole('button', { name: /extract all/i }, { timeout: 2000 });

    // Extract All mode always produces valid split mode → Split enabled
    await user.click(screen.getByRole('button', { name: /extract all/i }));
    const splitBtn = screen.getByRole('button', { name: /^split$/i });
    expect(splitBtn).not.toBeDisabled();
  });

  // SP-05 ─────────────────────────────────────────────────────────────────────
  it('SP-05 — clicking Split in Extract All mode advances to multi-file save step', async () => {
    const { user } = await navigateToTool(/^Split PDF/);
    await selectPdfFile(user, '/test/document.pdf');
    await screen.findByRole('button', { name: /extract all/i }, { timeout: 2000 });

    await user.click(screen.getByRole('button', { name: /extract all/i }));
    await user.click(screen.getByRole('button', { name: /^split$/i }));

    // Multi-file save shows "Save to Folder" and "Save as ZIP" options
    await screen.findByText('Save to Folder', {}, { timeout: 3000 });
    expect(screen.getByText('Save as ZIP')).toBeInTheDocument();
  });

  // SP-06 ─────────────────────────────────────────────────────────────────────
  it('SP-06 — Back button from split step returns to the file picker', async () => {
    const { user } = await navigateToTool(/^Split PDF/);
    await selectPdfFile(user, '/test/document.pdf');
    await screen.findByRole('button', { name: /^back$/i }, { timeout: 2000 });

    await user.click(screen.getByRole('button', { name: /^back$/i }));
    expect(screen.getByRole('button', { name: /^select pdf$/i })).toBeInTheDocument();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Crop PDF
// ══════════════════════════════════════════════════════════════════════════════
describe('Suite 09c — Crop PDF', () => {
  // CP-01 ─────────────────────────────────────────────────────────────────────
  it('CP-01 — navigating to Crop PDF shows the landing page', async () => {
    await navigateToTool(/^Crop PDF/);
    expect(screen.getByText('Select a PDF to crop margins.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^select pdf$/i })).toBeInTheDocument();
  });

  // CP-02 ─────────────────────────────────────────────────────────────────────
  it('CP-02 — selecting a PDF advances to the crop configure step', async () => {
    const { user } = await navigateToTool(/^Crop PDF/);
    await selectPdfFile(user, '/test/document.pdf');
    // Margin presets should appear
    await screen.findByRole('button', { name: /^small$/i }, { timeout: 2000 });
    expect(screen.getByRole('button', { name: /^small$/i })).toBeInTheDocument();
  });

  // CP-03 ─────────────────────────────────────────────────────────────────────
  it('CP-03 — crop step shows margin preset buttons (None, Small, Medium, Large)', async () => {
    const { user } = await navigateToTool(/^Crop PDF/);
    await selectPdfFile(user, '/test/document.pdf');
    await screen.findByRole('button', { name: /^none$/i }, { timeout: 2000 });

    expect(screen.getByRole('button', { name: /^none$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^small$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^medium$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^large$/i })).toBeInTheDocument();
  });

  // CP-04 ─────────────────────────────────────────────────────────────────────
  it('CP-04 — Apply Crop button is disabled when no margins are set', async () => {
    const { user } = await navigateToTool(/^Crop PDF/);
    await selectPdfFile(user, '/test/document.pdf');
    await screen.findByRole('button', { name: /apply crop/i }, { timeout: 2000 });

    expect(screen.getByRole('button', { name: /apply crop/i })).toBeDisabled();
  });

  // CP-05 ─────────────────────────────────────────────────────────────────────
  it('CP-05 — clicking a margin preset enables the Apply Crop button', async () => {
    const { user } = await navigateToTool(/^Crop PDF/);
    await selectPdfFile(user, '/test/document.pdf');
    await screen.findByRole('button', { name: /^small$/i }, { timeout: 2000 });

    await user.click(screen.getByRole('button', { name: /^small$/i }));
    expect(screen.getByRole('button', { name: /apply crop/i })).not.toBeDisabled();
  });

  // CP-06 ─────────────────────────────────────────────────────────────────────
  it('CP-06 — clicking Apply Crop advances to the save step', async () => {
    const { user } = await navigateToTool(/^Crop PDF/);
    await selectPdfFile(user, '/test/document.pdf');
    await screen.findByRole('button', { name: /^small$/i }, { timeout: 2000 });

    await user.click(screen.getByRole('button', { name: /^small$/i }));
    await user.click(screen.getByRole('button', { name: /apply crop/i }));
    await screen.findByText(/choose a save location/i, {}, { timeout: 3000 });
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Organize PDF
// ══════════════════════════════════════════════════════════════════════════════
describe('Suite 09d — Organize PDF', () => {
  // OP-01 ─────────────────────────────────────────────────────────────────────
  it('OP-01 — navigating to Organize PDF shows the landing page', async () => {
    await navigateToTool(/^Organize PDF/);
    expect(screen.getByText('Reorder, delete, or duplicate pages in a PDF.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^select pdf$/i })).toBeInTheDocument();
  });

  // OP-02 ─────────────────────────────────────────────────────────────────────
  it('OP-02 — selecting a PDF advances to the organize pages step', async () => {
    const { user } = await navigateToTool(/^Organize PDF/);
    await selectPdfFile(user, '/test/document.pdf');
    // The Apply button with page count confirms we're on the organize step
    await screen.findByRole('button', { name: /apply.*pages/i }, { timeout: 2000 });
    expect(screen.getByRole('button', { name: /apply.*pages/i })).toBeInTheDocument();
  });

  // OP-03 ─────────────────────────────────────────────────────────────────────
  it('OP-03 — organize step shows page count from the loaded PDF', async () => {
    const { user } = await navigateToTool(/^Organize PDF/);
    await selectPdfFile(user, '/test/document.pdf');
    // The Apply button shows the page count (3 pages from our mock)
    await screen.findByRole('button', { name: /apply.*3 pages/i }, { timeout: 2000 });
    expect(screen.getByRole('button', { name: /apply.*3 pages/i })).toBeInTheDocument();
  });

  // OP-04 ─────────────────────────────────────────────────────────────────────
  it('OP-04 — Apply button is enabled when pages are loaded', async () => {
    const { user } = await navigateToTool(/^Organize PDF/);
    await selectPdfFile(user, '/test/document.pdf');
    await screen.findByRole('button', { name: /apply.*pages/i }, { timeout: 2000 });

    expect(screen.getByRole('button', { name: /apply.*pages/i })).not.toBeDisabled();
  });

  // OP-05 ─────────────────────────────────────────────────────────────────────
  it('OP-05 — clicking Apply advances to the save step', async () => {
    const { user } = await navigateToTool(/^Organize PDF/);
    await selectPdfFile(user, '/test/document.pdf');
    await screen.findByRole('button', { name: /apply.*pages/i }, { timeout: 2000 });

    await user.click(screen.getByRole('button', { name: /apply.*pages/i }));
    await screen.findByText(/choose a save location/i, {}, { timeout: 3000 });
  });
});
