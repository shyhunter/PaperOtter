// @vitest-environment jsdom
/**
 * Suite 04 — Image Flow (Configure + Compare)
 *
 * Covers: IC-01 to IC-08, ICo-01 to ICo-05
 * Tests the image configure screen interactions and the image compare step
 * reachable through the full App component.
 *
 * NOTE: No fake timers — user-event v14 with Vitest 4 deadlocks when
 * fake timers are active. Real timers + findBy* handle navigation.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '@/App';
import { openFilePicker } from '@/hooks/useFileOpen';
import { processImage } from '@/lib/imageProcessor';
import { FAKE_IMAGE_RESULT, FAKE_IMAGE_RESULT_RESIZED } from '@/integration/fixtures';

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
}));
vi.mock('@/lib/imageProcessor', () => ({ processImage: vi.fn() }));
vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: vi.fn() }));
// save() must never resolve so SaveStep stays in 'dialog-open' state (see 03-pdf-compare.test.tsx).
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn(), save: vi.fn(() => new Promise(() => {})) }));

Object.defineProperty(URL, 'createObjectURL', { value: vi.fn().mockReturnValue('blob:fake'), writable: true });
Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), writable: true });

afterEach(cleanup);

// ── Helpers ───────────────────────────────────────────────────────────────────

function setup() {
  const user = userEvent.setup();
  render(<App />);
  return { user };
}

/** Drive App to Image Configure (step 1). */
async function navigateToImageConfigure(user: ReturnType<typeof userEvent.setup>, ext = 'jpg') {
  vi.mocked(openFilePicker).mockResolvedValueOnce(`/test/photo.${ext}`);
  await user.click(screen.getByText('Open file'));
  await screen.findByRole('slider', {}, { timeout: 2000 });
}

/** Drive App through Image Configure → Image Compare (step 2). */
async function navigateToImageCompare(user: ReturnType<typeof userEvent.setup>, result = FAKE_IMAGE_RESULT) {
  await navigateToImageConfigure(user);
  vi.mocked(processImage).mockResolvedValueOnce(result);
  await user.click(screen.getByRole('button', { name: /generate preview/i }));
  await screen.findByText('Before', {}, { timeout: 2000 });
}

// ─────────────────────────────────────────────────────────────────────────────

describe('Suite 04 — Image Configure Step', () => {
  // IC-01 ────────────────────────────────────────────────────────────────────
  it('IC-01 — quality slider defaults to 80% for JPEG', async () => {
    const { user } = setup();
    await navigateToImageConfigure(user, 'jpg');
    expect(screen.getByText('80%')).toBeInTheDocument();
    expect(screen.getByRole('slider')).toHaveValue('80');
  });

  // IC-02 ────────────────────────────────────────────────────────────────────
  it('IC-02 — PNG shows "Compression: N/9" not a percentage', async () => {
    const { user } = setup();
    await navigateToImageConfigure(user, 'png');
    // quality=80 → PNG compression = round((100-80)*9/100) = 2
    expect(screen.getByText('Compression: 2/9')).toBeInTheDocument();
    expect(screen.queryByText('80%')).not.toBeInTheDocument();
  });

  // IC-03 ────────────────────────────────────────────────────────────────────
  it('IC-03 — dragging the slider updates the label but does NOT trigger processing', async () => {
    const { user } = setup();
    await navigateToImageConfigure(user, 'jpg');
    fireEvent.change(screen.getByRole('slider'), { target: { value: '42' } });
    expect(screen.getByText('42%')).toBeInTheDocument();
    expect(vi.mocked(processImage)).not.toHaveBeenCalled();
  });

  // IC-04 ────────────────────────────────────────────────────────────────────
  it('IC-04 — switching to WebP keeps the percentage quality label', async () => {
    const { user } = setup();
    await navigateToImageConfigure(user, 'jpg');
    await user.click(screen.getByRole('button', { name: /^webp$/i }));
    expect(screen.getByText('80%')).toBeInTheDocument();
  });

  // IC-05 ────────────────────────────────────────────────────────────────────
  it('IC-05 — switching format to PNG changes quality label to Compression display', async () => {
    const { user } = setup();
    await navigateToImageConfigure(user, 'jpg');
    await user.click(screen.getByRole('button', { name: /^png$/i }));
    expect(screen.getByText(/Compression: \d\/9/)).toBeInTheDocument();
  });

  // IC-06 ────────────────────────────────────────────────────────────────────
  it('IC-06 — resize toggle is OFF by default', async () => {
    const { user } = setup();
    await navigateToImageConfigure(user, 'jpg');
    const toggle = screen.getByRole('switch', { name: /enable resize/i });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
  });

  // IC-07 ────────────────────────────────────────────────────────────────────
  it('IC-07 — enabling resize shows width and height inputs', async () => {
    const { user } = setup();
    await navigateToImageConfigure(user, 'jpg');
    await user.click(screen.getByRole('switch', { name: /enable resize/i }));
    expect(screen.getByLabelText(/width/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/height/i)).toBeInTheDocument();
  });

  // IC-08 ────────────────────────────────────────────────────────────────────
  it('IC-08 — Back button from Image Configure returns to the landing page', async () => {
    const { user } = setup();
    await navigateToImageConfigure(user, 'jpg');
    await user.click(screen.getByRole('button', { name: /^back$/i }));
    expect(screen.getByText('Open file')).toBeInTheDocument();
  });
});

describe('Suite 04 — Image Compare Step', () => {
  // ICo-01 ───────────────────────────────────────────────────────────────────
  it('ICo-01 — Image Compare shows Before / After panels after processing', async () => {
    const { user } = setup();
    await navigateToImageCompare(user);
    expect(screen.getByText('Before')).toBeInTheDocument();
    expect(screen.getByText('After')).toBeInTheDocument();
  });

  // ICo-02 ───────────────────────────────────────────────────────────────────
  it('ICo-02 — stats bar shows size delta and quality', async () => {
    const { user } = setup();
    await navigateToImageCompare(user);
    // FAKE_IMAGE_RESULT: savings 1_120_000 B → 47% → "−1.07 MB (47%)"
    expect(screen.getByText(/47%/)).toBeInTheDocument();
    expect(screen.getByText(/Quality: 80%/)).toBeInTheDocument();
  });

  // ICo-03 ───────────────────────────────────────────────────────────────────
  it('ICo-03 — when resize was applied, dimensions change is shown in stats', async () => {
    const { user } = setup();
    await navigateToImageCompare(user, FAKE_IMAGE_RESULT_RESIZED);
    // source 300×200 → output 1920×1080
    expect(screen.getByText(/300.*200.*1920.*1080/)).toBeInTheDocument();
  });

  // ICo-04 ───────────────────────────────────────────────────────────────────
  it('ICo-04 — Back from Image Compare returns to Image Configure', async () => {
    const { user } = setup();
    await navigateToImageCompare(user);
    await user.click(screen.getByRole('button', { name: /^back$/i }));
    expect(screen.getByRole('slider')).toBeInTheDocument(); // quality slider
  });

  // ICo-05 ───────────────────────────────────────────────────────────────────
  it('ICo-05 — Save… button in Image Compare advances to the Save step', async () => {
    const { user } = setup();
    await navigateToImageCompare(user);
    await user.click(screen.getByRole('button', { name: /save/i }));
    await screen.findByText(/choose a save location/i, {}, { timeout: 2000 });
    expect(screen.queryByText('Before')).not.toBeInTheDocument();
  });
});
