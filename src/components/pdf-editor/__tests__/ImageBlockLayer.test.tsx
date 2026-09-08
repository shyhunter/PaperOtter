// @vitest-environment jsdom
/**
 * Image blocks on the canvas. The editor's type and its PDF export both
 * supported them already; nothing could put one on a page or move it once
 * there, which is why a rasterised signature had nowhere to live.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { useEffect } from 'react';
import { EditorProvider, useEditorContext, createEditorViewState } from '@/context/EditorContext';
import { ImageBlockLayer } from '@/components/pdf-editor/ImageBlockLayer';
import type { ImageBlock } from '@/types/editor';

afterEach(cleanup);

const PAGE_H = 800;

function block(overrides: Partial<ImageBlock> = {}): ImageBlock {
  return {
    id: 'sig-1',
    pageIndex: 0,
    x: 100,
    y: 100,
    width: 200,
    height: 50,
    imageBytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
    rotation: 0,
    flipH: false,
    flipV: false,
    isNew: true,
    ...overrides,
  };
}

let ctxRef: ReturnType<typeof useEditorContext> | null = null;

function Harness({ initial }: { initial?: ImageBlock }) {
  const ctx = useEditorContext();
  useEffect(() => {
    ctx.initState(createEditorViewState(new Uint8Array([0x25, 0x50, 0x44, 0x46]), 1, 't.pdf', '/tmp/t.pdf', 1.0));
    if (initial) ctx.addImageBlock(0, initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  ctxRef = ctx;
  return <ImageBlockLayer pageIndex={0} pageHeight={PAGE_H} zoom={1} />;
}

function renderLayer(initial?: ImageBlock) {
  ctxRef = null;
  render(
    <EditorProvider>
      <Harness initial={initial} />
    </EditorProvider>,
  );
}

function current(): ImageBlock | undefined {
  return ctxRef?.state.pages[0]?.imageBlocks[0];
}

function drag(el: HTMLElement, fromX: number, fromY: number, toX: number, toY: number) {
  act(() => {
    fireEvent.mouseDown(el, { clientX: fromX, clientY: fromY, button: 0 });
    fireEvent.mouseMove(document, { clientX: toX, clientY: toY });
    fireEvent.mouseUp(document);
  });
}

describe('ImageBlockLayer', () => {
  it('[IBL-01] draws nothing on a page with no image blocks', () => {
    renderLayer();
    expect(screen.queryByTestId('image-block-sig-1')).toBeNull();
  });

  it('[IBL-02] places a block using PDF coordinates', () => {
    renderLayer(block());

    const el = screen.getByTestId('image-block-sig-1');
    expect(el.style.left).toBe('100px');
    // PDF y is the bottom edge; CSS top runs from the other end of the page.
    expect(el.style.top).toBe(`${PAGE_H - 100 - 50}px`);
  });

  it('[IBL-03] dragging moves it, inverting Y for PDF coordinates', () => {
    renderLayer(block());

    drag(screen.getByTestId('image-block-sig-1'), 150, 650, 190, 620);

    expect(current()!.x).toBeCloseTo(140, 6);
    expect(current()!.y).toBeCloseTo(130, 6);
  });

  it('[IBL-04] a click without movement does not nudge it', () => {
    renderLayer(block());

    drag(screen.getByTestId('image-block-sig-1'), 150, 650, 150, 650);

    expect(current()!.x).toBe(100);
    expect(current()!.y).toBe(100);
  });

  it('[IBL-05] selecting reveals four working corner handles', () => {
    renderLayer(block());

    fireEvent.click(screen.getByTestId('image-block-sig-1'));

    for (const corner of ['top-left', 'top-right', 'bottom-left', 'bottom-right']) {
      expect(screen.getByTestId(`image-resize-${corner}`)).toBeInTheDocument();
    }
  });

  it('[IBL-06] a corner resize keeps the opposite corner pinned', () => {
    renderLayer(block());
    fireEvent.click(screen.getByTestId('image-block-sig-1'));

    drag(screen.getByTestId('image-resize-bottom-right'), 300, 700, 340, 730);

    const b = current()!;
    expect(b.width).toBeCloseTo(240, 6);
    expect(b.height).toBeCloseTo(80, 6);
    // Top-left corner: x and y + height.
    expect(b.x).toBeCloseTo(100, 6);
    expect(b.y + b.height).toBeCloseTo(150, 6);
  });

  it('[IBL-07] Delete removes the selected block', () => {
    renderLayer(block());
    fireEvent.click(screen.getByTestId('image-block-sig-1'));

    act(() => {
      fireEvent.keyDown(document, { key: 'Delete' });
    });

    expect(current()).toBeUndefined();
  });

  it('[IBL-08] Delete does nothing once nothing is selected', () => {
    // Placing a stamp selects it, so this has to deselect first -- otherwise the
    // test would be asserting against a selection it never cleared.
    renderLayer(block());
    act(() => { ctxRef!.selectBlock(null); });

    act(() => {
      fireEvent.keyDown(document, { key: 'Delete' });
    });

    expect(current()).toBeDefined();
  });

  it('[IBL-09] Delete pressed in a text field is left alone', () => {
    renderLayer(block());

    const input = document.createElement('input');
    document.body.appendChild(input);
    act(() => {
      fireEvent.keyDown(input, { key: 'Delete' });
    });

    // Backspacing in the signature text field must not delete the stamp.
    expect(current()).toBeDefined();
    input.remove();
  });

  it('[IBL-10] clicking a block reveals a delete control that removes it', () => {
    // Delete has worked from the keyboard since the layer was written and the
    // button was added later, and neither was discoverable from the Sign panel,
    // where the only visible delete removes a *saved* signature. Reported as
    // "no possibility to delete signature in the edit mode on the pdf without
    // deleting saved signature". The panel now carries its own control; this
    // pins the on-canvas one it complements.
    renderLayer(block());
    const el = screen.getByTestId('image-block-sig-1');
    fireEvent.mouseDown(el, { button: 0, clientX: 10, clientY: 10 });
    fireEvent.mouseUp(el);
    fireEvent.click(el);
    const del = screen.queryByTestId('image-block-delete');
    expect(del, 'delete control after selecting').not.toBeNull();
    act(() => { fireEvent.click(del!); });
    expect(screen.queryByTestId('image-block-sig-1'), 'block gone').toBeNull();
  });
});

void vi;
