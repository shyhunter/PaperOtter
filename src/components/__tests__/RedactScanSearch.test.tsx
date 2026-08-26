// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RedactStep } from '@/components/redact-pdf/RedactStep';
import { recognisePdf } from '@/lib/ocrProcessor';
import { findTextMatches } from '@/lib/pdfTextSearch';
import { REAL_OCR_PAGES } from '@/lib/__tests__/fixtures/realOcrOutput';

// ─── Searching a scan from the redact tool (OCR-05) ──────────────────────────
//
// The brief's bonus, at the seam where a user meets it: a scanned page finds
// nothing and says so; after OCR reads it, the same query finds the name.
//
// pdf.js does not run in this environment at all, so it is mocked to behave as
// it does on a scan — returning no matches — rather than made to throw.

vi.mock('pdfjs-dist', () => ({
  getDocument: vi.fn(() => ({
    promise: Promise.resolve({
      numPages: 2,
      getPage: vi.fn(),
      destroy: vi.fn(),
    }),
  })),
  GlobalWorkerOptions: { workerSrc: '' },
}));
vi.mock('@/lib/pdfTextSearch', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/pdfTextSearch')>()),
  findTextMatches: vi.fn(),
}));
vi.mock('@/lib/ocrProcessor', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/ocrProcessor')>()),
  recognisePdf: vi.fn(),
}));
vi.mock('@/components/shared/PagePreview', () => ({ PagePreview: () => <div /> }));

const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]);

async function searchFor(user: ReturnType<typeof userEvent.setup>, query: string) {
  const input = await screen.findByPlaceholderText(/search/i);
  await user.clear(input);
  await user.type(input, query);
  await user.keyboard('{Enter}');
  await act(async () => {});
}

afterEach(cleanup);
beforeEach(() => {
  vi.mocked(findTextMatches).mockReset().mockResolvedValue([]);   // a scan: no text layer
  vi.mocked(recognisePdf).mockReset();
});

describe('redact search on a scanned page', () => {
  it('[OCR-05a] offers to read the scan when a search finds nothing', async () => {
    const user = userEvent.setup();
    render(<RedactStep pdfBytes={pdfBytes} sourcePath="/scans/permit.pdf" onComplete={vi.fn()} onBack={vi.fn()} />);
    await searchFor(user, 'MUSTERMANN');

    expect(await screen.findByRole('button', { name: /read the text and search again/i }))
      .toBeInTheDocument();
  });

  it('[OCR-05b] finds the name once the scan has been read', async () => {
    const user = userEvent.setup();
    vi.mocked(recognisePdf).mockResolvedValue(REAL_OCR_PAGES);
    render(<RedactStep pdfBytes={pdfBytes} sourcePath="/scans/permit.pdf" onComplete={vi.fn()} onBack={vi.fn()} />);
    await searchFor(user, 'MUSTERMANN');

    await user.click(screen.getByRole('button', { name: /read the text and search again/i }));
    await act(async () => {});

    expect(vi.mocked(recognisePdf)).toHaveBeenCalledWith('/scans/permit.pdf', expect.any(Object));
    expect(await screen.findByText(/1 match/i)).toBeInTheDocument();
  });

  it('[OCR-05c] warns that boxes read off a scan are approximate', async () => {
    // This covers content permanently, and the boxes are interpolated across a
    // whole line of recognised text. Saying so is the honest part.
    const user = userEvent.setup();
    vi.mocked(recognisePdf).mockResolvedValue(REAL_OCR_PAGES);
    render(<RedactStep pdfBytes={pdfBytes} sourcePath="/scans/permit.pdf" onComplete={vi.fn()} onBack={vi.fn()} />);
    await searchFor(user, 'MUSTERMANN');
    await user.click(screen.getByRole('button', { name: /read the text and search again/i }));
    await act(async () => {});

    expect(await screen.findByText(/approximate/i)).toBeInTheDocument();
  });

  it('[OCR-05d] does not re-read the scan for a second search', async () => {
    // Recognition is seconds per page; asking again for every query would make
    // the tool unusable on a long document.
    const user = userEvent.setup();
    vi.mocked(recognisePdf).mockResolvedValue(REAL_OCR_PAGES);
    render(<RedactStep pdfBytes={pdfBytes} sourcePath="/scans/permit.pdf" onComplete={vi.fn()} onBack={vi.fn()} />);
    await searchFor(user, 'MUSTERMANN');
    await user.click(screen.getByRole('button', { name: /read the text and search again/i }));
    await act(async () => {});

    await searchFor(user, 'BERLIN');

    expect(vi.mocked(recognisePdf)).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(/1 match/i)).toBeInTheDocument();
  });

  it('[OCR-05e] offers nothing to read when there is no file on disk', async () => {
    // The editor's redact panel passes bytes without a path; OCR reads a file.
    const user = userEvent.setup();
    render(<RedactStep pdfBytes={pdfBytes} sourcePath={null} onComplete={vi.fn()} onBack={vi.fn()} />);
    await searchFor(user, 'MUSTERMANN');

    expect(screen.queryByRole('button', { name: /read the text/i })).not.toBeInTheDocument();
  });
});
