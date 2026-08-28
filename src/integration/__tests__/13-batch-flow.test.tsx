// @vitest-environment jsdom
/**
 * Suite 13 — Batch processing (BATCH-07)
 *
 * The persona's actual case: a stack of scans for an application, not one file.
 * Drives the whole path through the real App — several files dropped, one set of
 * options, a run, and a summary that says what happened to each.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { StrictMode } from 'react';
import { render, screen, cleanup, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '@/App';
import { processImage } from '@/lib/imageProcessor';
import { FAKE_IMAGE_RESULT } from '@/integration/fixtures';

type DropPayload = { type: string; paths?: string[] };
let dropHandler: ((e: { payload: DropPayload }) => void) | undefined;

vi.mock('@tauri-apps/api/webview', () => ({
  getCurrentWebview: vi.fn(() => ({
    onDragDropEvent: vi.fn((cb: (e: { payload: DropPayload }) => void) => {
      dropHandler = cb;
      return Promise.resolve(() => {});
    }),
  })),
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
vi.mock('@/lib/pdfProcessor', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/pdfProcessor')>()),
  processPdf: vi.fn(),
  recommendQualityForTarget: vi.fn().mockReturnValue('screen'),
  estimateOutputSizeBytes: vi.fn().mockReturnValue(500 * 1024),
  getPdfImageCount: vi.fn().mockResolvedValue(0),
  getPdfCompressibility: vi.fn().mockResolvedValue({ imageCount: 0, compressibilityScore: 0.5 }),
}));
vi.mock('@/lib/imageProcessor', () => ({ processImage: vi.fn() }));
vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: vi.fn() }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn(), save: vi.fn(() => new Promise(() => {})) }));

Object.defineProperty(URL, 'createObjectURL', { value: vi.fn().mockReturnValue('blob:fake'), writable: true });
Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), writable: true });

afterEach(cleanup);
// processImage is stubbed per test with a mix of mockResolvedValue and
// ...Once chains; without a reset the leftovers queue up and the suite only
// passes in one order.
beforeEach(() => { vi.mocked(processImage).mockReset(); dropHandler = undefined; });

/** Drops several images on the window and reaches the Configure step. */
async function dropImages(user: ReturnType<typeof userEvent.setup>, paths: string[]) {
  // main.tsx wraps the app in StrictMode. Rendering without it hid a bug in five
  // flows where a ref flipped during the first render pass left the second pass
  // — the one the mount effect closes over — with no file at all.
  render(<StrictMode><App /></StrictMode>);
  await user.click(screen.getByRole('button', { name: /compress image/i }));
  await act(async () => { dropHandler?.({ payload: { type: 'drop', paths } }); });
  // 600 ms staged-load delay before Configure appears.
  await screen.findByRole('slider', {}, { timeout: 3000 });
}

const three = ['/scans/a.jpg', '/scans/b.jpg', '/scans/c.jpg'];

describe('Suite 13 — Batch processing', () => {
  it('BATCH-07a — three dropped scans are all processed, not just the first', async () => {
    const user = userEvent.setup();
    vi.mocked(processImage).mockResolvedValue(FAKE_IMAGE_RESULT);
    await dropImages(user, three);

    await user.click(screen.getByRole('button', { name: /generate preview/i }));
    await screen.findByText(/3 files ready to save/i, {}, { timeout: 3000 });

    expect(vi.mocked(processImage)).toHaveBeenCalledTimes(3);
  });

  it('BATCH-07b — one bad scan does not cost the other two', async () => {
    const user = userEvent.setup();
    vi.mocked(processImage)
      .mockResolvedValueOnce(FAKE_IMAGE_RESULT)
      .mockRejectedValueOnce(new Error('This image could not be read'))
      .mockResolvedValueOnce(FAKE_IMAGE_RESULT);
    await dropImages(user, three);

    await user.click(screen.getByRole('button', { name: /generate preview/i }));

    expect(await screen.findByText(/2 files ready to save/i, {}, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.getByText(/could not be read/i)).toBeInTheDocument();
    expect(screen.getByText(/b\.jpg/)).toBeInTheDocument();
  });

  it('BATCH-07d — the batch summary leads to a save step that can actually save', async () => {
    // BAT-06 and BAT-07 both start here and neither was performable: step 3 only
    // rendered when pdfProcessor.result or imageProcessor.result was set, and a
    // batch populates neither. "Save 3 files" advanced the step onto a blank
    // screen, so the non-destructive naming in MultiFileSave — the whole point of
    // BATCH-02 — had never once run on a batch.
    const user = userEvent.setup();
    vi.mocked(processImage).mockResolvedValue(FAKE_IMAGE_RESULT);
    await dropImages(user, three);

    await user.click(screen.getByRole('button', { name: /generate preview/i }));
    await screen.findByText(/3 files ready to save/i, {}, { timeout: 3000 });

    await user.click(screen.getByRole('button', { name: /save 3 files/i }));

    // Both destinations, the same pair SplitFlow offers. They are radios inside
    // labels, not buttons.
    expect(await screen.findByRole('radio', { name: /save to folder/i }, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /zip/i })).toBeInTheDocument();
    // The copy must not call a compress batch "the split files".
    expect(screen.queryByText(/split files/i)).not.toBeInTheDocument();

    // Which destination is selected has to be visible, not inferred from a small
    // radio dot. The chosen option carries a marked state its sibling does not.
    const folder = screen.getByRole('radio', { name: /save to folder/i });
    const zip = screen.getByRole('radio', { name: /zip/i });
    expect(folder).toBeChecked();
    expect(zip).not.toBeChecked();
    expect(folder.closest('label')).toHaveAttribute('data-selected', 'true');
    expect(zip.closest('label')).toHaveAttribute('data-selected', 'false');

    await user.click(zip);
    expect(zip.closest('label')).toHaveAttribute('data-selected', 'true');
    expect(folder.closest('label')).toHaveAttribute('data-selected', 'false');
  });

  it('BATCH-07c — a single dropped file still uses the ordinary compare flow', async () => {
    // The batch path must not swallow the single-file case, which is still the
    // common one and shows a real before/after.
    const user = userEvent.setup();
    vi.mocked(processImage).mockResolvedValue(FAKE_IMAGE_RESULT);
    await dropImages(user, ['/scans/only.jpg']);

    await user.click(screen.getByRole('button', { name: /generate preview/i }));

    expect(await screen.findByText('Before', {}, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.queryByText(/ready to save/i)).not.toBeInTheDocument();
  });
});
