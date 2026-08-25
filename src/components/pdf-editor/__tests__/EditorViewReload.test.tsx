// @vitest-environment jsdom
/**
 * Opening a different document while the editor is already open.
 *
 * EditorView is rendered at a fixed position with no key, so React keeps the
 * same instance when the path changes. Loading only on mount meant the new file
 * was picked, accepted, and then silently ignored.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { readFile } from '@tauri-apps/plugin-fs';
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
  // EditorCanvas reaches for these on mount. Omitting them threw out of an
  // effect, which vitest counts as an unhandled error rather than a test
  // failure -- the suite still reported every test passing.
  acquireSharedPdfDocument: vi.fn().mockResolvedValue({
    numPages: 1,
    getPage: vi.fn().mockResolvedValue({
      getViewport: vi.fn().mockReturnValue({ width: 612, height: 792 }),
      render: vi.fn().mockReturnValue({ promise: Promise.resolve() }),
    }),
  }),
  releaseSharedPdfDocument: vi.fn(),
}));

vi.stubGlobal('IntersectionObserver', class {
  observe = vi.fn(); disconnect = vi.fn(); unobserve = vi.fn();
});
vi.stubGlobal('ResizeObserver', class {
  observe = vi.fn(); disconnect = vi.fn(); unobserve = vi.fn();
});

afterEach(cleanup);

beforeEach(async () => {
  const doc = await PDFDocument.create();
  doc.addPage();
  const bytes = new Uint8Array(await doc.save());
  vi.mocked(readFile).mockReset();
  vi.mocked(readFile).mockResolvedValue(bytes);
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true, writable: true, value: vi.fn(),
  });
});

describe('EditorView — opening a different document', () => {
  it('[EVR-01] loads the file it was given', async () => {
    render(<ToolProvider><EditorView filePath="/tmp/first.pdf" /></ToolProvider>);

    await waitFor(() => expect(vi.mocked(readFile)).toHaveBeenCalledWith('/tmp/first.pdf'));
    expect(await screen.findByText('first.pdf')).toBeInTheDocument();
  });

  it('[EVR-02] loads the new file when the path changes', async () => {
    const { rerender } = render(
      <ToolProvider><EditorView filePath="/tmp/first.pdf" /></ToolProvider>,
    );
    await screen.findByText('first.pdf');

    rerender(<ToolProvider><EditorView filePath="/tmp/second.pdf" /></ToolProvider>);

    await waitFor(() => expect(vi.mocked(readFile)).toHaveBeenCalledWith('/tmp/second.pdf'));
    expect(await screen.findByText('second.pdf')).toBeInTheDocument();
  });

  it('[EVR-03] the same path is not reloaded on every render', async () => {
    const { rerender } = render(
      <ToolProvider><EditorView filePath="/tmp/first.pdf" /></ToolProvider>,
    );
    await screen.findByText('first.pdf');
    const callsAfterLoad = vi.mocked(readFile).mock.calls.length;

    rerender(<ToolProvider><EditorView filePath="/tmp/first.pdf" /></ToolProvider>);
    rerender(<ToolProvider><EditorView filePath="/tmp/first.pdf" /></ToolProvider>);

    // Re-reading the document on an unrelated re-render would throw away
    // whatever the user had edited.
    expect(vi.mocked(readFile).mock.calls.length).toBe(callsAfterLoad);
  });
});
