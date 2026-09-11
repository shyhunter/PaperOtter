// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { readFile } from '@tauri-apps/plugin-fs';
import { FilePickStep } from '@/components/FilePickStep';
import { ToolProvider } from '@/context/ToolContext';

vi.mock('@tauri-apps/plugin-store', () => ({
  LazyStore: class {
    get() { return Promise.resolve(null); }
    set() { return Promise.resolve(undefined); }
    save() { return Promise.resolve(undefined); }
  },
}));

afterEach(cleanup);

/** The handler useFileDrop registers, so a test can fire a real drop at it. */
let fireDrop: ((payload: unknown) => void) | null = null;

beforeEach(() => {
  fireDrop = null;
  vi.mocked(getCurrentWebview).mockReturnValue({
    onDragDropEvent: vi.fn(async (handler: (e: { payload: unknown }) => void) => {
      fireDrop = (payload) => handler({ payload });
      return () => {};
    }),
  } as unknown as ReturnType<typeof getCurrentWebview>);
});

function drop(paths: string[]) {
  expect(fireDrop, 'nothing registered a drop listener').not.toBeNull();
  fireDrop!({ type: 'drop', paths });
}

function setup(props: Partial<React.ComponentProps<typeof FilePickStep>> = {}) {
  const onFileReady = vi.fn();
  render(
    <ToolProvider>
      <FilePickStep acceptedFormats={['pdf']} onFileReady={onFileReady} {...props} />
    </ToolProvider>,
  );
  return { onFileReady };
}

/**
 * [DROP-01] A file dropped inside a tool opens it.
 *
 * This is the defect the shared picker exists for. `useFileDrop` was called in
 * exactly one place in the app -- the compress flow -- so seventeen tools drew a
 * screen that said "Drop file here" and then ignored anything dropped on it. No
 * error, no hint. The gesture worked on the dashboard and stopped working the
 * moment you opened a tool, which is worse than never having offered it.
 */
describe('[DROP-01] a dropped file reaches the tool', () => {
  it('hands the path over once it passes the guards', async () => {
    const { onFileReady } = setup();

    drop(['/scans/report.pdf']);

    await waitFor(() => expect(onFileReady).toHaveBeenCalledWith('/scans/report.pdf', []));
  });

  it('carries the rest of a multi-file drop alongside it', async () => {
    const { onFileReady } = setup();

    drop(['/a.pdf', '/b.pdf', '/c.pdf']);

    await waitFor(() => expect(onFileReady).toHaveBeenCalledWith('/a.pdf', ['/b.pdf', '/c.pdf']));
  });

  it('drops the files of a type this tool cannot take', async () => {
    // The options chosen later are type-specific, so a PDF and a JPEG cannot
    // share a run. The odd one out is left behind rather than refusing the lot.
    const { onFileReady } = setup();

    drop(['/a.pdf', '/photo.jpg']);

    await waitFor(() => expect(onFileReady).toHaveBeenCalledWith('/a.pdf', []));
  });

  it('refuses a file this tool does not work on, and says which tool does', async () => {
    const { onFileReady } = setup({ acceptedFormats: ['image'] });

    drop(['/scans/report.pdf']);

    expect(await screen.findByTestId('invalid-drop-error')).toBeInTheDocument();
    expect(onFileReady).not.toHaveBeenCalled();
  });

  it('refuses an empty file rather than opening a tool on nothing', async () => {
    vi.mocked(readFile).mockResolvedValueOnce(new Uint8Array(0));
    const { onFileReady } = setup();

    drop(['/scans/empty.pdf']);

    expect(await screen.findByTestId('empty-file-error')).toBeInTheDocument();
    expect(onFileReady).not.toHaveBeenCalled();
  });

  it('blocks a PDF that is not a PDF, and offers to repair it', async () => {
    // The guard seventeen tools skipped: without it this surfaced three steps
    // later as a parse error from whichever engine met it first.
    const notAPdf = new Uint8Array(1024);
    notAPdf.set([0x50, 0x4b, 0x03, 0x04]); // a zip, as a renamed .docx often is
    vi.mocked(readFile).mockResolvedValue(notAPdf);
    const { onFileReady } = setup();

    drop(['/scans/broken.pdf']);

    expect((await screen.findAllByText(/repair with/i))[0]).toBeInTheDocument();
    expect(onFileReady).not.toHaveBeenCalled();
    vi.mocked(readFile).mockReset();
  });
});
