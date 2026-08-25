// @vitest-environment jsdom
/**
 * Offering repair at the point of failure.
 *
 * A PDF that will not open is exactly when the Repair tool is wanted, and
 * exactly when the user is least able to reach it: the editor is the thing that
 * failed, and getting to Repair meant going back to the dashboard, finding the
 * tool, and picking the file again.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFile, writeFile } from '@tauri-apps/plugin-fs';
import { invoke } from '@tauri-apps/api/core';
import { PDFDocument } from 'pdf-lib';
import { ToolProvider } from '@/context/ToolContext';
import { EditorView } from '@/components/pdf-editor/EditorView';

vi.mock('pdfjs-dist', () => ({
  getDocument: vi.fn().mockReturnValue({
    promise: Promise.resolve({
      numPages: 1,
      getPage: vi.fn().mockResolvedValue({
        getViewport: vi.fn().mockReturnValue({ width: 612, height: 792 }),
        render: vi.fn().mockReturnValue({ promise: Promise.resolve() }),
      }),
      destroy: vi.fn(),
    }),
  }),
  GlobalWorkerOptions: { workerSrc: '' },
}));

vi.mock('@/lib/pdfThumbnail', () => ({
  renderPdfPageThumbnail: vi.fn().mockResolvedValue('blob:thumb'),
  renderAllPdfPages: vi.fn().mockResolvedValue([]),
  openPdfForLazyRender: vi.fn().mockResolvedValue({
    numPages: 1, pageAspectRatios: [], renderPage: vi.fn(), destroy: vi.fn(),
  }),
  acquireSharedPdfDocument: vi.fn().mockResolvedValue({
    numPages: 1,
    getPage: vi.fn().mockResolvedValue({
      getViewport: vi.fn().mockReturnValue({ width: 612, height: 792 }),
      render: vi.fn().mockReturnValue({ promise: Promise.resolve() }),
    }),
  }),
  releaseSharedPdfDocument: vi.fn(),
}));

vi.stubGlobal('IntersectionObserver', class { observe = vi.fn(); disconnect = vi.fn(); unobserve = vi.fn(); });
vi.stubGlobal('ResizeObserver', class { observe = vi.fn(); disconnect = vi.fn(); unobserve = vi.fn(); });

afterEach(cleanup);

let goodBytes: Uint8Array;
const BROKEN = new Uint8Array([0x6e, 0x6f, 0x70, 0x65]); // not a PDF

beforeEach(async () => {
  const doc = await PDFDocument.create();
  doc.addPage();
  goodBytes = new Uint8Array(await doc.save());

  vi.mocked(readFile).mockReset().mockResolvedValue(BROKEN);
  vi.mocked(writeFile).mockReset();
  vi.mocked(invoke).mockReset();
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true, writable: true, value: vi.fn(),
  });
});

function renderEditor(path = '/tmp/broken.pdf') {
  render(<ToolProvider><EditorView filePath={path} /></ToolProvider>);
}

describe('EditorView — repair at the point of failure', () => {
  it('[ERR-01] a file that will not open offers repair', async () => {
    renderEditor();

    expect(await screen.findByText(/unable to open file/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try to repair/i })).toBeInTheDocument();
  });

  it('[ERR-02] repair runs on the file itself, with no detour through the tool', async () => {
    const user = userEvent.setup();
    vi.mocked(invoke).mockResolvedValue(goodBytes);
    renderEditor('/tmp/broken.pdf');

    await user.click(await screen.findByRole('button', { name: /try to repair/i }));

    await waitFor(() =>
      expect(vi.mocked(invoke)).toHaveBeenCalledWith('repair_pdf', { sourcePath: '/tmp/broken.pdf' }),
    );
  });

  it('[ERR-03] a successful repair carries straight on into the editor', async () => {
    const user = userEvent.setup();
    vi.mocked(invoke).mockResolvedValue(goodBytes);
    renderEditor();

    await user.click(await screen.findByRole('button', { name: /try to repair/i }));

    // The error screen is gone and the document is open -- no second file pick.
    await waitFor(() => expect(screen.queryByText(/unable to open file/i)).toBeNull());
    expect(await screen.findByText('broken.pdf')).toBeInTheDocument();
  });

  it('[ERR-04] a repair that fails says so and leaves the offer standing', async () => {
    const user = userEvent.setup();
    vi.mocked(invoke).mockRejectedValue(new Error('ghostscript exited 1'));
    renderEditor();

    await user.click(await screen.findByRole('button', { name: /try to repair/i }));

    expect(await screen.findByText(/could not be repaired/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try to repair/i })).toBeEnabled();
  });

  it('[ERR-05] a repair that returns something still unreadable does not open a broken editor', async () => {
    const user = userEvent.setup();
    // Ghostscript can exit cleanly and still produce something pdf-lib refuses.
    vi.mocked(invoke).mockResolvedValue(new Uint8Array([1, 2, 3]));
    renderEditor();

    await user.click(await screen.findByRole('button', { name: /try to repair/i }));

    expect(await screen.findByText(/could not be repaired/i)).toBeInTheDocument();
  });

  it('[ERR-06] the repaired document is unsaved, so the broken file on disk is untouched', async () => {
    const user = userEvent.setup();
    vi.mocked(invoke).mockResolvedValue(goodBytes);
    renderEditor();

    await user.click(await screen.findByRole('button', { name: /try to repair/i }));

    await screen.findByText('broken.pdf');

    // Repair happens in memory. Overwriting the original without being asked
    // would destroy the only copy of whatever could not be recovered, so
    // nothing may reach the disk until the user saves.
    // Scoped to the document's own path: diagLog writes to its log file, and
    // asserting "nothing was written at all" would only be catching that.
    const wroteDocument = vi.mocked(writeFile).mock.calls.some(([path]) => path === '/tmp/broken.pdf');
    expect(wroteDocument).toBe(false);
  });
});

void act;
