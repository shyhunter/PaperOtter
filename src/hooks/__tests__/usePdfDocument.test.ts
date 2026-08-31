// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * [PERF-01] One PDF document per grid, not one per thumbnail.
 *
 * Reported from a real Linux build: opening Split PDF on a 3-4 MB, 134-page
 * document froze the window for minutes, Ubuntu reported "Tauri App is not
 * responding", and scrolling made it worse.
 *
 * LazyPageThumbnail did the lazy part correctly -- an IntersectionObserver keeps
 * off-screen pages unrendered -- but each tile that did become visible ran
 * `pdfjsLib.getDocument({ data: pdfBytes.slice() })` for itself. That is a full
 * copy of the file plus a complete parse of every page, per tile. With a 4-6
 * column grid and a 200px root margin, roughly twenty tiles activate at once:
 * ~80 MB of copies and twenty full parses racing on the main thread. Scrolling
 * activated more, which is why scrolling deepened the freeze.
 *
 * The document is now loaded once by the grid and shared. Four tools use this
 * component -- Split, Rotate, Organize and PDF to JPG -- so all four had it.
 */

const getDocument = vi.fn();
vi.mock('pdfjs-dist', () => ({
  getDocument: (...args: unknown[]) => getDocument(...args),
  GlobalWorkerOptions: { workerSrc: '' },
}));

beforeEach(() => {
  getDocument.mockReset();
  getDocument.mockReturnValue({
    promise: Promise.resolve({ numPages: 134, getPage: vi.fn(), destroy: vi.fn() }),
  });
});

describe('shared pdf document', () => {
  it('[PERF-01a] the thumbnail component never loads a document itself', () => {
    // Comments are stripped first: the comment explaining this fix names
    // getDocument, and a naive scan would match the prose about the bug rather
    // than the bug. Same trap as UI-04c.
    const src = readFileSync('src/components/shared/LazyPageThumbnail.tsx', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    expect(
      src.includes('getDocument'),
      'a per-tile getDocument is the bug: one copy and one full parse per thumbnail',
    ).toBe(false);
  });

  it('[PERF-01b] every page-grid call site shares one document', () => {
    // Enumerated from source, in the shape of ToolIcons.test.tsx: nothing in the
    // type system connects these files, so a fifth grid would regress silently.
    const grids = [
      'src/components/split/SplitSelectStep.tsx',
      'src/components/rotate/RotateStep.tsx',
      'src/components/organize-pdf/OrganizePdfFlow.tsx',
      'src/components/pdf-to-jpg/PdfToJpgFlow.tsx',
    ];
    const missing = grids.filter((f) => !readFileSync(f, 'utf8').includes('usePdfDocument'));
    expect(missing, 'page grids not sharing a document').toEqual([]);
  });

  it('[PERF-01c] the hook loads the document exactly once for one byte array', async () => {
    const { renderHook, waitFor } = await import('@testing-library/react');
    const { usePdfDocument } = await import('@/hooks/usePdfDocument');
    const bytes = new Uint8Array([1, 2, 3, 4]);

    const { result, rerender } = renderHook(({ b }) => usePdfDocument(b), {
      initialProps: { b: bytes },
    });
    await waitFor(() => expect(result.current).not.toBeNull());
    rerender({ b: bytes });
    rerender({ b: bytes });

    expect(getDocument, 'same bytes must not reload').toHaveBeenCalledTimes(1);
  });

  it('[PERF-01d] it passes a copy, because pdf.js transfers the buffer', async () => {
    const { renderHook, waitFor } = await import('@testing-library/react');
    const { usePdfDocument } = await import('@/hooks/usePdfDocument');
    const bytes = new Uint8Array([1, 2, 3, 4]);

    const { result } = renderHook(() => usePdfDocument(bytes));
    await waitFor(() => expect(result.current).not.toBeNull());

    const passed = getDocument.mock.calls[0][0].data;
    expect(passed, 'must not hand pdf.js the caller-owned array').not.toBe(bytes);
    expect(Array.from(passed as Uint8Array)).toEqual([1, 2, 3, 4]);
  });
});
