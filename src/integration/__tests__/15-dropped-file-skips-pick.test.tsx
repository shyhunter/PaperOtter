// @vitest-environment jsdom
/**
 * Suite 15 — A dropped file must not be asked for again
 *
 * Covers: PENDING-03, PENDING-04, PENDING-05
 *
 * Eighteen of the twenty flows already advance past their pick step when a file
 * arrives from the dashboard. The two multi-file tools do not: they add the
 * dropped files to the pick step and leave the user staring at a screen asking
 * them to choose files they have already chosen.
 *
 * Both have a Back button to step 0, so advancing costs nothing — Merge's step 0
 * is purely a picker (ordering lives at step 1), and JPG to PDF's step 0 can be
 * returned to whenever an image needs adding or reordering.
 *
 * NOTE: No fake timers — user-event v14 deadlocks with fake timers active.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { StrictMode } from 'react';
import { render, screen, cleanup, act, waitFor } from '@testing-library/react';
import { open } from '@tauri-apps/plugin-dialog';
import App from '@/App';

/**
 * OCR is macOS-only (Vision), and the platform gate in src/lib/platform.ts now
 * hides every OCR entry point elsewhere. jsdom's default user agent is not a
 * Mac, so these tests must say which platform they are exercising -- otherwise
 * they assert on an offer the gate correctly withholds.
 */
Object.defineProperty(window.navigator, 'userAgent', {
  value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
  configurable: true,
});


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

// Merge loads real PDFs through pdf-lib; stub it the way suite 09 does.
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

// These flows parse the PDF before advancing, and the globally-mocked readFile
// bytes are not a real document. Stub the parse the way suite 07 does, so a
// failure here means the handoff broke — not that the fixture is fake.
// Unlock and Protect both ask whether the dropped document is encrypted, and
// they want opposite answers: Unlock accepts only a locked file, Protect only an
// unlocked one. Neither can be served by a fixed stub, so the tests set it.
const pdfState = vi.hoisted(() => ({ isEncrypted: false }));

vi.mock('pdf-lib', () => ({
  PDFDocument: {
    load: vi.fn().mockImplementation(async () => ({
      get isEncrypted() { return pdfState.isEncrypted; },
      getPageCount: vi.fn().mockReturnValue(3),
      // Crop reads the first page's size to seed its crop box.
      getPage: vi.fn().mockReturnValue({ getSize: () => ({ width: 595, height: 842 }) }),
      getPages: vi.fn().mockReturnValue([{ getSize: () => ({ width: 595, height: 842 }) }]),
    })),
    create: vi.fn().mockResolvedValue({
      addPage: vi.fn(),
      save: vi.fn().mockResolvedValue(new Uint8Array([0x25, 0x50, 0x44, 0x46])),
    }),
  },
  degrees: (d: number) => d,
  rgb: () => ({}),
  StandardFonts: { Helvetica: 'Helvetica', HelveticaBold: 'HelveticaBold' },
}));

// App dynamically imports this for the "file-opened" listener. Under StrictMode
// the effect runs twice and the real module gets pulled in, which then reaches
// for Tauri internals that do not exist here. Mock it explicitly.
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
  emit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/imageInput', () => ({
  readImageBytes: vi.fn().mockResolvedValue({
    bytes: new Uint8Array([0xff, 0xd8, 0xff]),
    sizeBytes: 1024,
  }),
}));

// JPG to PDF builds its own thumbnails on a real canvas, which jsdom has no
// backend for. Same stub the image-tools suite uses.
Object.defineProperty(URL, 'createObjectURL', { value: vi.fn().mockReturnValue('blob:fake'), writable: true });
Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), writable: true });
Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
  value: vi.fn().mockReturnValue({
    drawImage: vi.fn(),
    getImageData: vi.fn().mockReturnValue({ data: new Uint8Array(4) }),
  }),
  writable: true,
});
Object.defineProperty(HTMLCanvasElement.prototype, 'toDataURL', {
  value: vi.fn().mockReturnValue('data:image/jpeg;base64,fake'),
  writable: true,
});

type DropPayload = { type: string; paths?: string[] };
const dropHandlers: Array<(e: { payload: DropPayload }) => void> = [];
vi.mock('@tauri-apps/api/webview', () => ({
  getCurrentWebview: vi.fn(() => ({
    onDragDropEvent: vi.fn((cb: (e: { payload: DropPayload }) => void) => {
      dropHandlers.push(cb);
      return Promise.resolve(() => {});
    }),
  })),
}));

// main.tsx wraps the app in StrictMode, and no other integration test does — so
// nothing in the suite has ever exercised the double render the real app does.
// That gap hid a bug in five flows: a ref flipped during the first render pass
// made the second pass compute an empty file list, and the mount effect closes
// over the second pass.
const renderApp = () => render(<StrictMode><App /></StrictMode>);

const dropOnDashboard = async (paths: string[]) => {
  await act(async () => {
    for (const cb of dropHandlers) cb({ payload: { type: 'drop', paths } });
  });
};

const clickTool = async (label: RegExp) => {
  // Tool cards are buttons; the same words also appear in descriptions, so match
  // the accessible name and anchor it the way the other suites do.
  const card = (await screen.findAllByRole('button', { name: label }))[0];
  await act(async () => { card.click(); });
};

afterEach(cleanup);
beforeEach(() => {
  dropHandlers.length = 0;
  vi.mocked(open).mockClear();
  vi.mocked(open).mockResolvedValue(null);
});

describe('Suite 15 — dropped files skip the pick step', () => {
  it('[PENDING-03] JPG to PDF shows the dropped image already selected', async () => {
    renderApp();
    await waitFor(() => expect(dropHandlers.length).toBeGreaterThan(0));

    await dropOnDashboard(['/Users/me/Desktop/id-photo.jpg']);
    await clickTool(/^JPG to PDF/);

    // Multi-file tools keep their pick step: it is where you see what is
    // selected and add a second image. What must not happen is landing there
    // with an empty list, which is what the StrictMode capture bug caused.
    await waitFor(() => {
      expect(screen.getByText('id-photo.jpg')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /^continue$/i })).not.toBeDisabled();
    // Adding a second image must still be possible from here — the button turns
    // into "Add More" once the list is non-empty.
    expect(screen.getByRole('button', { name: /add more/i })).toBeInTheDocument();
  });

  it('[PENDING-04] Merge PDF shows the dropped files already selected', async () => {
    renderApp();
    await waitFor(() => expect(dropHandlers.length).toBeGreaterThan(0));

    await dropOnDashboard(['/Users/me/Desktop/a.pdf', '/Users/me/Desktop/b.pdf']);
    await clickTool(/^Merge PDF/);

    // Same reasoning as JPG to PDF: a merge of two dropped files is very often a
    // merge of three, and the pick step is the only place to add the third.
    await waitFor(() => {
      expect(screen.getByText('a.pdf')).toBeInTheDocument();
    });
    expect(screen.getByText('b.pdf')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^continue$/i })).not.toBeDisabled();
  });

  // [PENDING-06] The other tools, checked end-to-end rather than by reading them.
  //
  // Code reading said EditPdfFlow was fine; the bug was in the route *around* it,
  // which no amount of reading the component would have found. So this asserts
  // the thing the user actually sees: after dropping a file and choosing a tool,
  // no "select a file" button is left on screen.
  const PICK_BUTTON = /^(select|choose|add) (a )?(pdf|pdfs|image|images|file|files)$/i;

  const PDF_TOOLS: Array<[string, RegExp]> = [
    ['Split PDF', /^Split PDF/],
    ['Rotate PDF', /^Rotate PDF/],
    ['Protect PDF', /^Protect PDF/],
    ['Unlock PDF', /^Unlock PDF/],
    ['Repair PDF', /^Repair PDF/],
    ['PDF to JPG', /^PDF to JPG/],
    ['Organize PDF', /^Organi[sz]e PDF/],
    ['Page numbers', /^Page [Nn]umbers/],
    ['Watermark', /^Watermark/],
    ['Crop PDF', /^Crop PDF/],
  ];

  it.each(PDF_TOOLS)('[PENDING-06] %s uses the dropped PDF instead of asking again', async (_name, label) => {
    // Unlock takes only a locked document; Protect only an unlocked one.
    pdfState.isEncrypted = _name === 'Unlock PDF';
    renderApp();
    await waitFor(() => expect(dropHandlers.length).toBeGreaterThan(0));

    await dropOnDashboard(['/Users/me/Desktop/scan.pdf']);
    await clickTool(label);

    // Prove the tool actually opened before asserting what is absent from it.
    // The dashboard has no pick button either, so without this the assertion
    // below would pass forever while checking nothing.
    await screen.findByRole('button', { name: /back to dashboard/i });
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: PICK_BUTTON })).not.toBeInTheDocument();
    });
  });

  const MORE_PDF_TOOLS: Array<[string, RegExp]> = [
    ['Sign PDF', /^Sign PDF/],
    ['Redact PDF', /^Redact/],
    ['OCR', /^(Make Searchable|OCR)/],
    ['PDF\\/A', /^(PDF\/A|Convert to PDF\/A)/],
  ];

  it.each(MORE_PDF_TOOLS)('[PENDING-07] %s uses the dropped PDF instead of asking again', async (_name, label) => {
    renderApp();
    await waitFor(() => expect(dropHandlers.length).toBeGreaterThan(0));

    await dropOnDashboard(['/Users/me/Desktop/scan.pdf']);
    await clickTool(label);

    // Prove the tool actually opened before asserting what is absent from it.
    // The dashboard has no pick button either, so without this the assertion
    // below would pass forever while checking nothing.
    await screen.findByRole('button', { name: /back to dashboard/i });
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: PICK_BUTTON })).not.toBeInTheDocument();
    });
  });

  it('[PENDING-09] Convert Document uses the dropped file instead of asking again', async () => {
    // The fifth flow with the StrictMode capture bug, and the only one whose
    // input is a Word document rather than a PDF or an image.
    renderApp();
    await waitFor(() => expect(dropHandlers.length).toBeGreaterThan(0));

    await dropOnDashboard(['/Users/me/Desktop/letter.docx']);
    await clickTool(/^Convert Document/);

    await screen.findByRole('button', { name: /back to dashboard/i });
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: PICK_BUTTON })).not.toBeInTheDocument();
    });
  });

  const IMAGE_TOOLS: Array<[string, RegExp]> = [
    ['Convert image', /^Convert [Ii]mage/],
    ['Rotate image', /^Rotate [Ii]mage/],
  ];

  it.each(IMAGE_TOOLS)('[PENDING-08] %s uses the dropped image instead of asking again', async (_name, label) => {
    renderApp();
    await waitFor(() => expect(dropHandlers.length).toBeGreaterThan(0));

    await dropOnDashboard(['/Users/me/Desktop/id-photo.jpg']);
    await clickTool(label);

    // Prove the tool actually opened before asserting what is absent from it.
    // The dashboard has no pick button either, so without this the assertion
    // below would pass forever while checking nothing.
    await screen.findByRole('button', { name: /back to dashboard/i });
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: PICK_BUTTON })).not.toBeInTheDocument();
    });
  });

  it('[PENDING-05] Merge PDF still shows its picker when nothing was dropped', async () => {
    // Opening the tool cold must keep working.
    renderApp();
    await waitFor(() => expect(dropHandlers.length).toBeGreaterThan(0));

    await clickTool(/^Merge PDF/);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /select pdfs/i })).toBeInTheDocument();
    });
  });
});
