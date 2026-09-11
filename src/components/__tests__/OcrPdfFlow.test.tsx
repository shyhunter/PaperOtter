// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ocrPdf } from '@/lib/ocrProcessor';
import { OcrPdfFlow } from '@/components/ocr-pdf/OcrPdfFlow';
import { openFilePicker } from '@/hooks/useFileOpen';

vi.mock('@/hooks/useFileOpen', () => ({ openFilePicker: vi.fn() }));

// ─── OCR flow (OCR-03) ───────────────────────────────────────────────────────
//
// The acceptance criterion this covers is the honest one: "an honest result on a
// scan too poor to read". A tool that hands back a confident-looking searchable
// PDF containing nothing is worse than one that says it could not read the page.

vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn(), save: vi.fn(() => new Promise(() => {})) }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(() => Promise.resolve(() => {})) }));
vi.mock('@/lib/ocrProcessor', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/ocrProcessor')>()),
  ocrPdf: vi.fn(),
}));
vi.mock('@/context/ToolContext', () => ({
  useToolContext: () => ({ pendingFiles: [], setPendingFiles: vi.fn() }),
}));
// The picker is populated from the OS at runtime, so the list has to be stubbed
// for the flow to have anything to select.
vi.mock('@/lib/ocrLanguages', () => ({
  listOcrLanguages: vi.fn(async () => [
    { tag: 'en-US', name: 'English' },
    { tag: 'de-DE', name: 'German' },
    { tag: 'tr-TR', name: 'Turkish' },
  ]),
}));

const result = (over: Partial<Awaited<ReturnType<typeof ocrPdf>>['summary']> = {}) => ({
  bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
  pages: [],
  summary: {
    pageCount: 2, wordCount: 87, foundText: true,
    meanConfidence: 0.96, lowConfidence: false, ...over,
  },
});

async function reachSummary(user: ReturnType<typeof userEvent.setup>) {
  render(<OcrPdfFlow />);
  vi.mocked(openFilePicker).mockResolvedValueOnce('/scans/permit.pdf');
  await user.click(screen.getByRole('button', { name: /open file/i }));
  await act(async () => {});
  await user.click(await screen.findByRole('button', { name: /read the text/i }));
  await act(async () => {});
}

afterEach(cleanup);
beforeEach(() => {
  vi.mocked(openFilePicker).mockReset();
  vi.mocked(ocrPdf).mockReset();
});

describe('OcrPdfFlow', () => {
  it('[OCR-03a] reports what it found before offering to save', async () => {
    vi.mocked(ocrPdf).mockResolvedValue(result());
    await reachSummary(userEvent.setup());

    expect(await screen.findByText(/87 words/i)).toBeInTheDocument();
    expect(screen.getByText(/2 pages/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save searchable pdf/i })).toBeInTheDocument();
  });

  it('[OCR-03b] warns that a hard-to-read scan will contain mistakes', async () => {
    vi.mocked(ocrPdf).mockResolvedValue(result({ lowConfidence: true, meanConfidence: 0.3 }));
    await reachSummary(userEvent.setup());

    expect(await screen.findByText(/hard to read/i)).toBeInTheDocument();
    // Still saveable — poor text is usually better than none, as long as the
    // user is told.
    expect(screen.getByRole('button', { name: /save searchable pdf/i })).toBeInTheDocument();
  });

  it('[OCR-03c] does not offer a save when nothing readable was found', async () => {
    vi.mocked(ocrPdf).mockResolvedValue(result({ foundText: false, wordCount: 0 }));
    await reachSummary(userEvent.setup());

    expect(await screen.findByText(/no readable text/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /save searchable pdf/i })).not.toBeInTheDocument();
    // and says what might help, rather than only that it failed
    expect(screen.getByText(/too dark or blurred/i)).toBeInTheDocument();
  });

  it('[OCR-03d] passes the chosen language to the engine', async () => {
    const user = userEvent.setup();
    vi.mocked(ocrPdf).mockResolvedValue(result());
    render(<OcrPdfFlow />);
    vi.mocked(openFilePicker).mockResolvedValueOnce('/scans/permit.pdf');
    await user.click(screen.getByRole('button', { name: /open file/i }));
    await act(async () => {});

    await user.selectOptions(await screen.findByLabelText(/language/i), 'tr-TR');
    await user.click(screen.getByRole('button', { name: /read the text/i }));
    await act(async () => {});

    expect(vi.mocked(ocrPdf)).toHaveBeenCalledWith('/scans/permit.pdf', { languages: ['tr-TR'] });
  });

  it('[OCR-03e] surfaces an engine failure instead of a blank screen', async () => {
    vi.mocked(ocrPdf).mockRejectedValue(new Error('This PDF could not be opened.'));
    await reachSummary(userEvent.setup());

    expect(await screen.findByText(/could not be opened/i)).toBeInTheDocument();
  });
});
