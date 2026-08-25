// @vitest-environment jsdom
/**
 * "Revert to original" is the way back for someone who edited the wrong
 * document. It restores the load-time snapshot the editor already keeps, and
 * must clear every derived piece of edit state with it -- a leftover overlay or
 * page-number base would be applied on top of the restored bytes at save time.
 */
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { EditorProvider, useEditorContext, createEditorViewState } from '@/context/EditorContext';

const ORIGINAL = new Uint8Array([1, 1, 1, 1]);
const EDITED = new Uint8Array([2, 2, 2, 2]);

function setup(pageCount = 3) {
  const hook = renderHook(() => useEditorContext(), { wrapper: EditorProvider });
  act(() => {
    hook.result.current.initState(createEditorViewState(ORIGINAL, pageCount, 'sample.pdf', '/tmp/sample.pdf', 1));
  });
  return hook;
}

describe('revertToOriginal', () => {
  it('RV-01: restores the bytes the document was opened with', () => {
    const { result } = setup();

    act(() => result.current.updatePdfBytes(EDITED));
    expect(result.current.state.pdfBytes).toEqual(EDITED);

    act(() => result.current.revertToOriginal());

    expect(result.current.state.pdfBytes).toEqual(ORIGINAL);
  });

  it('RV-02: drops the page-number base, so a later remove cannot resurrect edits', () => {
    const { result } = setup();

    act(() => result.current.applyPageNumbers(ORIGINAL, EDITED));
    act(() => result.current.revertToOriginal());

    expect(result.current.state.pageNumberBase).toBeNull();
  });

  it('RV-03: clears pending page overlays and restores the original page count', () => {
    const { result } = setup(3);

    act(() => result.current.setPageTextBlocks(0, [
      { id: 'b1', text: 'hi', x: 0, y: 0, width: 10, height: 10, fontSize: 12, fontName: 'Helvetica' },
    ] as never));
    expect(result.current.state.pages[0].textBlocks).toHaveLength(1);

    act(() => result.current.revertToOriginal());

    // Overlays are applied at save time, so a survivor would be written back
    // on top of the restored bytes.
    expect(result.current.state.pages[0].textBlocks).toHaveLength(0);
    expect(result.current.state.pages).toHaveLength(3);
    expect(result.current.state.pageCount).toBe(3);
  });

  it('RV-04: leaves the document dirty, so the original can be written back over saved edits', () => {
    const { result } = setup();

    act(() => result.current.updatePdfBytes(EDITED));
    act(() => result.current.revertToOriginal());

    // If the user already saved, the file on disk still holds the edits; the
    // in-memory document now differs from it and needs writing.
    expect(result.current.state.isDirty).toBe(true);
  });
});
