// @vitest-environment jsdom
/**
 * Suite 08 — Image Tool Flows (Rotate Image, Convert Image)
 *
 * Covers: RI-01..RI-08, CI-01..CI-07
 * Tests image tool flows from dashboard navigation through file selection,
 * format/rotation configuration, and save step.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
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
vi.mock('@/lib/pdfThumbnail', () => ({
  renderAllPdfPages: vi.fn().mockResolvedValue([]),
  renderPdfThumbnail: vi.fn().mockResolvedValue('blob:preview'),
}));
vi.mock('@/lib/pdfProcessor', () => ({
  processPdf: vi.fn(),
  estimateOutputSizeBytes: vi.fn().mockReturnValue(500 * 1024),
  getPdfCompressibility: vi.fn().mockResolvedValue({ imageCount: 0, compressibilityScore: 0.5 }),
}));
vi.mock('@/lib/imageProcessor', () => ({ processImage: vi.fn() }));

// Rotate image lib — return fake image bytes
vi.mock('@/lib/imageRotate', () => ({
  rotateImage: vi.fn().mockResolvedValue(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])),
}));

// save() must never resolve so SaveStep stays in 'dialog-open' state
vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn().mockResolvedValue(null),
  save: vi.fn(() => new Promise(() => {})),
  ask: vi.fn().mockResolvedValue(true),
}));

Object.defineProperty(URL, 'createObjectURL', { value: vi.fn().mockReturnValue('blob:fake'), writable: true });
Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), writable: true });

// Mock canvas API — jsdom doesn't implement canvas
Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
  value: vi.fn().mockReturnValue({
    drawImage: vi.fn(),
    getImageData: vi.fn().mockReturnValue({ data: new Uint8Array(4) }),
  }),
  writable: true,
});
Object.defineProperty(HTMLCanvasElement.prototype, 'toDataURL', {
  value: vi.fn().mockReturnValue('data:image/jpeg;base64,fakeimagedata'),
  writable: true,
});

afterEach(cleanup);

// ── Shared helpers ────────────────────────────────────────────────────────────

/** Navigate to a tool whose card name STARTS WITH the given prefix (avoids description substring matches). */
async function navigateToTool(toolNamePrefix: RegExp) {
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getAllByRole('button', { name: toolNamePrefix })[0]);
  return { user };
}

async function selectImageFile(user: ReturnType<typeof userEvent.setup>, filePath: string) {
  vi.mocked(open).mockResolvedValueOnce(filePath);
  await user.click(await screen.findByRole('button', { name: /select image/i }));
}

// ══════════════════════════════════════════════════════════════════════════════
// Rotate Image
// ══════════════════════════════════════════════════════════════════════════════
describe('Suite 08a — Rotate Image', () => {
  // RI-01 ─────────────────────────────────────────────────────────────────────
  it('RI-01 — navigating to Rotate Image shows the landing page', async () => {
    // Use "^Rotate Image" to avoid matching "Rotate Image" in other contexts
    await navigateToTool(/^Rotate Image/);
    // Check for the unique description text on the landing page
    expect(screen.getByText('Select an image to rotate 90, 180, or 270 degrees.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /select image/i })).toBeInTheDocument();
  });

  // RI-02 ─────────────────────────────────────────────────────────────────────
  it('RI-02 — selecting an image advances to the rotation configure step', async () => {
    const { user } = await navigateToTool(/^Rotate Image/);
    await selectImageFile(user, '/test/photo.jpg');
    // After file load, "Apply & Save" button should appear
    await screen.findByRole('button', { name: /apply & save/i }, { timeout: 2000 });
    expect(screen.getByRole('button', { name: /apply & save/i })).toBeInTheDocument();
  });

  // RI-03 ─────────────────────────────────────────────────────────────────────
  it('RI-03 — rotation controls are shown (Left 90, 180, Right 90)', async () => {
    const { user } = await navigateToTool(/^Rotate Image/);
    await selectImageFile(user, '/test/photo.jpg');
    await screen.findByRole('button', { name: /left 90/i }, { timeout: 2000 });

    expect(screen.getByRole('button', { name: /left 90/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^180$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /right 90/i })).toBeInTheDocument();
  });

  // RI-04 ─────────────────────────────────────────────────────────────────────
  it('RI-04 — initial rotation is 90 degrees clockwise', async () => {
    const { user } = await navigateToTool(/^Rotate Image/);
    await selectImageFile(user, '/test/photo.jpg');
    await screen.findByRole('button', { name: /apply & save/i }, { timeout: 2000 });

    expect(screen.getByText(/current: 90 degrees clockwise/i)).toBeInTheDocument();
  });

  // RI-05 ─────────────────────────────────────────────────────────────────────
  it('RI-05 — clicking Right 90 changes rotation to 180 degrees', async () => {
    const { user } = await navigateToTool(/^Rotate Image/);
    await selectImageFile(user, '/test/photo.jpg');
    await screen.findByRole('button', { name: /right 90/i }, { timeout: 2000 });

    await user.click(screen.getByRole('button', { name: /right 90/i }));
    expect(screen.getByText(/current: 180 degrees clockwise/i)).toBeInTheDocument();
  });

  // RI-06 ─────────────────────────────────────────────────────────────────────
  it('RI-06 — output format selector shows JPG, PNG, WebP options', async () => {
    const { user } = await navigateToTool(/^Rotate Image/);
    await selectImageFile(user, '/test/photo.jpg');
    await screen.findByText(/output format/i, {}, { timeout: 2000 });

    expect(screen.getByRole('button', { name: /^jpg$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^png$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^webp$/i })).toBeInTheDocument();
  });

  // RI-07 ─────────────────────────────────────────────────────────────────────
  it('RI-07 — applying rotation advances to the save step', async () => {
    const { user } = await navigateToTool(/^Rotate Image/);
    await selectImageFile(user, '/test/photo.jpg');
    await screen.findByRole('button', { name: /apply & save/i }, { timeout: 2000 });

    await user.click(screen.getByRole('button', { name: /apply & save/i }));
    await screen.findByText(/choose a save location/i, {}, { timeout: 3000 });
  });

  // RI-08 ─────────────────────────────────────────────────────────────────────
  it('RI-08 — Back button from configure step returns to the file picker', async () => {
    const { user } = await navigateToTool(/^Rotate Image/);
    await selectImageFile(user, '/test/photo.jpg');
    await screen.findByRole('button', { name: /apply & save/i }, { timeout: 2000 });

    await user.click(screen.getByRole('button', { name: /^back$/i }));
    expect(screen.getByRole('button', { name: /select image/i })).toBeInTheDocument();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Convert Image
// ══════════════════════════════════════════════════════════════════════════════
describe('Suite 08b — Convert Image', () => {
  // CI-01 ─────────────────────────────────────────────────────────────────────
  it('CI-01 — navigating to Convert Image shows the landing page', async () => {
    // Use "^Convert Image" to avoid matching "convert images" in other tool descriptions
    await navigateToTool(/^Convert Image/);
    expect(screen.getByText('Select an image to convert between formats.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /select image/i })).toBeInTheDocument();
  });

  // CI-02 ─────────────────────────────────────────────────────────────────────
  it('CI-02 — selecting a JPEG image advances to the format configure step', async () => {
    const { user } = await navigateToTool(/^Convert Image/);
    await selectImageFile(user, '/test/photo.jpg');
    await screen.findByText(/output format/i, {}, { timeout: 2000 });
    expect(screen.getByText(/output format/i)).toBeInTheDocument();
  });

  // CI-03 ─────────────────────────────────────────────────────────────────────
  it('CI-03 — source format and file name are shown in the configure step', async () => {
    const { user } = await navigateToTool(/^Convert Image/);
    await selectImageFile(user, '/test/photo.jpg');
    await screen.findByText('photo.jpg', {}, { timeout: 2000 });
    expect(screen.getByText('photo.jpg')).toBeInTheDocument();
    // Source format label shows "JPEG" for .jpg files
    expect(screen.getByText(/JPEG/)).toBeInTheDocument();
  });

  // CI-04 ─────────────────────────────────────────────────────────────────────
  it('CI-04 — default output for JPEG source is PNG (convert button shows "Convert to PNG")', async () => {
    const { user } = await navigateToTool(/^Convert Image/);
    await selectImageFile(user, '/test/photo.jpg');
    // For a JPEG source, the default output format is PNG
    await screen.findByRole('button', { name: /convert to png/i }, { timeout: 2000 });
    expect(screen.getByRole('button', { name: /convert to png/i })).toBeInTheDocument();
  });

  // CI-05 ─────────────────────────────────────────────────────────────────────
  it('CI-05 — clicking WebP output format changes the convert button label', async () => {
    const { user } = await navigateToTool(/^Convert Image/);
    await selectImageFile(user, '/test/photo.jpg');
    await screen.findByRole('button', { name: /^webp$/i }, { timeout: 2000 });

    await user.click(screen.getByRole('button', { name: /^webp$/i }));
    expect(screen.getByRole('button', { name: /convert to webp/i })).toBeInTheDocument();
  });

  // CI-06 ─────────────────────────────────────────────────────────────────────
  it('CI-06 — converting image advances to the save step', async () => {
    const { user } = await navigateToTool(/^Convert Image/);
    await selectImageFile(user, '/test/photo.jpg');
    await screen.findByRole('button', { name: /convert to/i }, { timeout: 2000 });

    vi.mocked(invoke).mockResolvedValueOnce(new Uint8Array([0x89, 0x50, 0x4e, 0x47]));
    await user.click(screen.getByRole('button', { name: /convert to/i }));

    await screen.findByText(/choose a save location/i, {}, { timeout: 3000 });
  });

  // CI-07 ─────────────────────────────────────────────────────────────────────
  it('CI-07 — Back button from configure step returns to the file picker', async () => {
    const { user } = await navigateToTool(/^Convert Image/);
    await selectImageFile(user, '/test/photo.jpg');
    await screen.findByText(/output format/i, {}, { timeout: 2000 });

    await user.click(screen.getByRole('button', { name: /^back$/i }));
    expect(screen.getByRole('button', { name: /select image/i })).toBeInTheDocument();
  });
});
