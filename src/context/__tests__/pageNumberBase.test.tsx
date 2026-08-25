// @vitest-environment jsdom
/**
 * Page numbers in the editor are removable until another tool applies or the
 * file is saved. That rests on keeping one snapshot of the bytes as they were
 * before numbering, and on being strict about when it is dropped: restoring a
 * stale base would silently destroy another tool's work.
 */
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { EditorProvider, useEditorContext, createEditorViewState } from '@/context/EditorContext';

const BASE = new Uint8Array([1, 1, 1, 1]);
const NUMBERED = new Uint8Array([2, 2, 2, 2]);
const CROPPED = new Uint8Array([3, 3, 3, 3]);

function setup() {
  const hook = renderHook(() => useEditorContext(), { wrapper: EditorProvider });
  act(() => {
    hook.result.current.initState(createEditorViewState(BASE, 1, 'sample.pdf', null, 1));
  });
  return hook;
}

describe('editor page-number base', () => {
  it('PNE-01: applying records the pre-numbering bytes and shows the numbered ones', () => {
    const { result } = setup();

    act(() => result.current.applyPageNumbers(BASE, NUMBERED));

    expect(result.current.state.pdfBytes).toEqual(NUMBERED);
    expect(result.current.state.pageNumberBase).toEqual(BASE);
  });

  it('PNE-02: removing restores the pre-numbering bytes exactly', () => {
    const { result } = setup();

    act(() => result.current.applyPageNumbers(BASE, NUMBERED));
    act(() => result.current.removePageNumbers());

    expect(result.current.state.pdfBytes).toEqual(BASE);
    expect(result.current.state.pageNumberBase).toBeNull();
  });

  it('PNE-03: re-applying keeps the ORIGINAL base, so colour changes replace rather than stack', () => {
    const { result } = setup();
    const recoloured = new Uint8Array([4, 4, 4, 4]);

    act(() => result.current.applyPageNumbers(BASE, NUMBERED));
    // A colour change re-derives from the base, and must not treat the already
    // numbered bytes as the new base -- that is how two sets of numbers stack.
    act(() => result.current.applyPageNumbers(BASE, recoloured));

    expect(result.current.state.pdfBytes).toEqual(recoloured);
    expect(result.current.state.pageNumberBase).toEqual(BASE);

    act(() => result.current.removePageNumbers());
    expect(result.current.state.pdfBytes).toEqual(BASE);
  });

  it('PNE-04: another tool applying ends removability', () => {
    const { result } = setup();

    act(() => result.current.applyPageNumbers(BASE, NUMBERED));
    act(() => result.current.updatePdfBytes(CROPPED));

    // Keeping the base here would let a later "remove" throw away the crop.
    expect(result.current.state.pageNumberBase).toBeNull();
    expect(result.current.state.pdfBytes).toEqual(CROPPED);
  });

  it('PNE-05: removing with no base is a no-op, not a crash', () => {
    const { result } = setup();

    act(() => result.current.removePageNumbers());

    expect(result.current.state.pdfBytes).toEqual(BASE);
    expect(result.current.state.pageNumberBase).toBeNull();
  });

  it('PNE-06: applying marks the document dirty', () => {
    const { result } = setup();

    act(() => result.current.applyPageNumbers(BASE, NUMBERED));
    expect(result.current.state.isDirty).toBe(true);
  });
});
