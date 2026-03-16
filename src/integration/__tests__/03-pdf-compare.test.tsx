// @vitest-environment jsdom
/**
 * Suite 03 — PDF Compare Step (navigation layer)
 *
 * Covers: PCo-01 to PCo-07
 * Tests that the Compare step is reachable from Configure, displays the correct
 * stats for the processed result, and exposes correct navigation actions.
 * Renders the full App and drives it from step 0 → step 1 → step 2.
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
import { FAKE_PDF_RESULT, FAKE_PDF_RESULT_TARGET_UNMET } from '@/integration/fixtures';

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
  getPdfImageCount: vi.fn().mockResolvedValue(0),
  getPdfCompressibility: vi.fn().mockResolvedValue({ imageCount: 0, compressibilityScore: 0.5 }),
}));
vi.mock('@/lib/imageProcessor', () => ({ processImage: vi.fn() }));
vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: vi.fn() }));
// save() must never resolve so the SaveStep stays in 'dialog-open' state.
// If it resolves with null, onCancel() fires setCurrentStep(2) and we return
// to Compare, making it impossible to assert we left the Compare step.
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn(), save: vi.fn(() => new Promise(() => {})) }));

Object.defineProperty(URL, 'createObjectURL', { value: vi.fn().mockReturnValue('blob:fake'), writable: true });
Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), writable: true });

afterEach(cleanup);

// ── Helpers ───────────────────────────────────────────────────────────────────

async function setup() {
  const user = userEvent.setup();
  render(<App />);
  // Select Compress PDF from the dashboard to enter the tool flow
  await user.click(screen.getAllByRole('button', { name: /compress pdf/i })[0]);
  return { user };
}

/** Drive App to PDF Configure (step 1). */
async function navigateToPdfConfigure(user: ReturnType<typeof userEvent.setup>) {
  vi.mocked(openFilePicker).mockResolvedValueOnce('/test/report.pdf');
  await user.click(screen.getByText('Open file'));
  await screen.findByRole('button', { name: /generate preview/i }, { timeout: 2000 });
}

/** Drive App through Configure → Compare (step 2). */
async function navigateToPdfCompare(
  user: ReturnType<typeof userEvent.setup>,
  result = FAKE_PDF_RESULT,
) {
  await navigateToPdfConfigure(user);
  vi.mocked(processPdf).mockResolvedValueOnce(result);
  await user.click(screen.getByRole('button', { name: /generate preview/i }));
  // Wait for the Compare step to appear
  await screen.findByText('Before', {}, { timeout: 2000 });
}

// ─────────────────────────────────────────────────────────────────────────────

describe('Suite 03 — PDF Compare Step', () => {
  // PCo-01 ───────────────────────────────────────────────────────────────────
  it('PCo-01 — Compare step appears after processing completes', async () => {
    const { user } = await setup();
    await navigateToPdfCompare(user);
    // Before / After panel headers
    expect(screen.getByText('Before')).toBeInTheDocument();
    expect(screen.getByText('After')).toBeInTheDocument();
  });

  // PCo-02 ───────────────────────────────────────────────────────────────────
  it('PCo-02 — stats bar shows "X MB → Y MB (Z% smaller)" format', async () => {
    const { user } = await setup();
    await navigateToPdfCompare(user);
    // FAKE_PDF_RESULT: 2_400_000 B → 2.29 MB, 1_200_000 B → 1.14 MB, 50% smaller
    const statsBar = screen.getByTestId('stats-bar');
    expect(statsBar).toHaveTextContent('2.29 MB');
    expect(statsBar).toHaveTextContent('1.14 MB');
    expect(screen.getByText(/50% smaller/)).toBeInTheDocument();
  });

  // PCo-03 ───────────────────────────────────────────────────────────────────
  it('PCo-03 — stats bar shows page count', async () => {
    const { user } = await setup();
    await navigateToPdfCompare(user);
    expect(screen.getByText('3 pages')).toBeInTheDocument();
  });

  // PCo-04 ───────────────────────────────────────────────────────────────────
  it('PCo-04 — no "structural only" or "image content unchanged" notice is shown', async () => {
    const { user } = await setup();
    await navigateToPdfCompare(user);
    expect(screen.queryByText(/structural/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/image content is unchanged/i)).not.toBeInTheDocument();
  });

  // PCo-05 ───────────────────────────────────────────────────────────────────
  it('PCo-05 — target-not-met warning appears when targetMet=false', async () => {
    const { user } = await setup();
    await navigateToPdfCompare(user, FAKE_PDF_RESULT_TARGET_UNMET);
    expect(screen.getByText(/target size not achievable/i)).toBeInTheDocument();
    expect(screen.getByText(/best result/i)).toBeInTheDocument();
  });

  // PCo-06 ───────────────────────────────────────────────────────────────────
  it('PCo-06 — Back button returns to the PDF Configure step', async () => {
    const { user } = await setup();
    await navigateToPdfCompare(user);
    await user.click(screen.getByRole('button', { name: /^back$/i }));
    // Configure step has the quality selector heading
    expect(screen.getByText('Optimise file size')).toBeInTheDocument();
  });

  // PCo-07 ───────────────────────────────────────────────────────────────────
  it('PCo-07 — Save… button advances to the Save step', async () => {
    const { user } = await setup();
    await navigateToPdfCompare(user);
    await user.click(screen.getByRole('button', { name: /save/i }));
    // Save step auto-triggers the dialog (which never resolves per mock).
    // Verify that Compare step is gone and SaveStep's dialog-open state is shown.
    await screen.findByText(/choose a save location/i, {}, { timeout: 2000 });
    expect(screen.queryByText('Before')).not.toBeInTheDocument();
  });
});
