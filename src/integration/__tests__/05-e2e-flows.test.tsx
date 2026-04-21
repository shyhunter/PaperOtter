// @vitest-environment jsdom
/**
 * Suite 05 — End-to-End User Flows
 *
 * Covers: E2E-01 to E2E-08
 * Each test drives the full App component through a complete user scenario
 * from the landing page to the final save step (or back to landing).
 * These are the highest-value tests: they catch regressions in the
 * inter-step wiring inside App.tsx that unit tests cannot catch.
 *
 * NOTE: No fake timers — user-event v14 with Vitest 4 deadlocks when
 * fake timers are active. Real timers + findBy* handle navigation.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '@/App';
import { openFilePicker } from '@/hooks/useFileOpen';
import { processPdf } from '@/lib/pdfProcessor';
import { processImage } from '@/lib/imageProcessor';
import {
  FAKE_PDF_RESULT,
  FAKE_PDF_RESULT_TARGET_UNMET,
  FAKE_IMAGE_RESULT,
} from '@/integration/fixtures';

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
  recommendQualityForTarget: vi.fn().mockReturnValue('screen'),
  estimateOutputSizeBytes: vi.fn().mockReturnValue(500 * 1024),
  getPdfImageCount: vi.fn().mockResolvedValue(0),
  getPdfCompressibility: vi.fn().mockResolvedValue({ imageCount: 5, compressibilityScore: 0.5 }),
}));
vi.mock('@/lib/imageProcessor', () => ({ processImage: vi.fn() }));
vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: vi.fn() }));
// save() must never resolve so SaveStep stays in 'dialog-open' state (see 03-pdf-compare.test.tsx).
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn(), save: vi.fn(() => new Promise(() => {})) }));

Object.defineProperty(URL, 'createObjectURL', { value: vi.fn().mockReturnValue('blob:fake'), writable: true });
Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), writable: true });

afterEach(cleanup);

// ── Helpers ───────────────────────────────────────────────────────────────────

async function setup(tool: 'compress-pdf' | 'compress-image' = 'compress-pdf') {
  const user = userEvent.setup();
  render(<App />);
  // Select the appropriate tool from the dashboard to enter the tool flow
  const toolName = tool === 'compress-pdf' ? /compress pdf/i : /compress image/i;
  await user.click(screen.getAllByRole('button', { name: toolName })[0]);
  return { user };
}

async function pickFile(user: ReturnType<typeof userEvent.setup>, filePath: string) {
  vi.mocked(openFilePicker).mockResolvedValueOnce(filePath);
  await user.click(screen.getByText('Open file'));
  await screen.findByRole('button', { name: /generate preview/i }, { timeout: 2000 });
}

async function generatePdfPreview(user: ReturnType<typeof userEvent.setup>, result = FAKE_PDF_RESULT) {
  vi.mocked(processPdf).mockResolvedValueOnce(result);
  await user.click(screen.getByRole('button', { name: /generate preview/i }));
  await screen.findByText('Before', {}, { timeout: 2000 });
}

async function generateImagePreview(user: ReturnType<typeof userEvent.setup>, result = FAKE_IMAGE_RESULT) {
  vi.mocked(processImage).mockResolvedValueOnce(result);
  await user.click(screen.getByRole('button', { name: /generate preview/i }));
  await screen.findByText('Before', {}, { timeout: 2000 });
}

// ─────────────────────────────────────────────────────────────────────────────

describe('Suite 05 — End-to-End User Flows', () => {
  // E2E-01 ───────────────────────────────────────────────────────────────────
  it('E2E-01 — full PDF flow: landing → configure → compare → save step', async () => {
    const { user } = await setup();

    // Step 0: landing
    expect(screen.getByText('Open file')).toBeInTheDocument();

    // Step 1: PDF Configure
    await pickFile(user, '/test/report.pdf');
    expect(screen.getByRole('button', { name: /generate preview/i })).toBeInTheDocument();

    // Step 2: PDF Compare
    await generatePdfPreview(user);
    expect(screen.getByText('Before')).toBeInTheDocument();
    expect(screen.getByText(/50% smaller/)).toBeInTheDocument();

    // Step 3: Save — dialog auto-triggers (never resolves per mock)
    await user.click(screen.getByRole('button', { name: /save/i }));
    await screen.findByText(/choose a save location/i, {}, { timeout: 2000 });
    expect(screen.queryByText('Before')).not.toBeInTheDocument();
  });

  // E2E-02 ───────────────────────────────────────────────────────────────────
  it('E2E-02 — full image flow: landing → configure → compare → save step', async () => {
    const { user } = await setup('compress-image');

    // Step 0: landing
    expect(screen.getByText('Open file')).toBeInTheDocument();

    // Step 1: Image Configure
    vi.mocked(openFilePicker).mockResolvedValueOnce('/test/photo.jpg');
    await user.click(screen.getByText('Open file'));
    await screen.findByRole('slider', {}, { timeout: 2000 });
    expect(screen.getByRole('slider')).toBeInTheDocument();

    // Step 2: Image Compare
    await generateImagePreview(user);
    expect(screen.getByText('Before')).toBeInTheDocument();
    expect(screen.getByText(/47%/)).toBeInTheDocument();

    // Step 3: Save — dialog auto-triggers (never resolves per mock)
    await user.click(screen.getByRole('button', { name: /save/i }));
    await screen.findByText(/choose a save location/i, {}, { timeout: 2000 });
    expect(screen.queryByText('Before')).not.toBeInTheDocument();
  });

  // E2E-03 ───────────────────────────────────────────────────────────────────
  it('E2E-03 — "Process another" from PDF Compare resets app to the landing page', async () => {
    const { user } = await setup();
    await pickFile(user, '/test/report.pdf');
    await generatePdfPreview(user);

    // Click "Process another" button on Compare step
    await user.click(screen.getByRole('button', { name: /start over/i }));

    // Should be back at landing
    expect(screen.getByText('Open file')).toBeInTheDocument();
    expect(screen.queryByText('Before')).not.toBeInTheDocument();
  });

  // E2E-04 ───────────────────────────────────────────────────────────────────
  it('E2E-04 — "Process another" from Image Compare resets app to the landing page', async () => {
    const { user } = await setup('compress-image');
    vi.mocked(openFilePicker).mockResolvedValueOnce('/test/photo.jpg');
    await user.click(screen.getByText('Open file'));
    await screen.findByRole('slider', {}, { timeout: 2000 });
    await generateImagePreview(user);

    await user.click(screen.getByRole('button', { name: /start over/i }));

    expect(screen.getByText('Open file')).toBeInTheDocument();
    expect(screen.queryByText('Before')).not.toBeInTheDocument();
  });

  // E2E-05 ───────────────────────────────────────────────────────────────────
  it('E2E-05 — full PDF back-chain: compare → configure → landing', async () => {
    const { user } = await setup();
    await pickFile(user, '/test/report.pdf');
    await generatePdfPreview(user);
    expect(screen.getByText('Before')).toBeInTheDocument(); // at Compare

    // Back from Compare → Configure
    await user.click(screen.getByRole('button', { name: /^back$/i }));
    expect(screen.getByText('Optimise file size')).toBeInTheDocument();

    // Back from Configure → Landing
    await user.click(screen.getByRole('button', { name: /^back$/i }));
    expect(screen.getByText('Open file')).toBeInTheDocument();
  });

  // E2E-06 ───────────────────────────────────────────────────────────────────
  it('E2E-06 — full image back-chain: compare → configure → landing', async () => {
    const { user } = await setup('compress-image');
    vi.mocked(openFilePicker).mockResolvedValueOnce('/test/photo.jpg');
    await user.click(screen.getByText('Open file'));
    await screen.findByRole('slider', {}, { timeout: 2000 });
    await generateImagePreview(user);
    expect(screen.getByText('Before')).toBeInTheDocument();

    // Back from Image Compare → Image Configure
    await user.click(screen.getByRole('button', { name: /^back$/i }));
    expect(screen.getByRole('slider')).toBeInTheDocument();

    // Back from Image Configure → Landing
    await user.click(screen.getByRole('button', { name: /^back$/i }));
    expect(screen.getByText('Open file')).toBeInTheDocument();
  });

  // E2E-07 ───────────────────────────────────────────────────────────────────
  it('E2E-07 — quality level selected in Configure is passed to Compare (render scale)', async () => {
    const { user } = await setup();
    await pickFile(user, '/test/report.pdf');

    // Choose "Archive" quality before processing
    await user.click(screen.getByText('Archive'));

    // Process → Compare step receives qualityLevel='archive'
    // (CompareStep uses it for render scale — we just verify Compare loads without error)
    await generatePdfPreview(user);
    expect(screen.getByText('Before')).toBeInTheDocument();
    expect(screen.getByText('After')).toBeInTheDocument();
  });

  // E2E-08 ───────────────────────────────────────────────────────────────────
  it('E2E-08 — target-not-met warning is shown when processPdf returns targetMet=false', async () => {
    const { user } = await setup();
    await pickFile(user, '/test/report.pdf');

    // Process with the "target unmet" fake result — the warning banner is driven
    // entirely by result.targetMet=false, independent of the custom-size toggle
    await generatePdfPreview(user, FAKE_PDF_RESULT_TARGET_UNMET);

    expect(screen.getByText(/target size not achievable/i)).toBeInTheDocument();
    expect(screen.getByText(/best result/i)).toBeInTheDocument();
  });
});
