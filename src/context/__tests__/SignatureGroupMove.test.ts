import { describe, it, expect } from 'vitest';
import { editorReducer } from '@/context/EditorContext';
import type { ImageBlock, PageEditState } from '@/types/editor';

/**
 * [SIG-GROUP] A signature placed on every page moves as one.
 *
 * Reported: "I move on first page the signature and all pages are choosen, it
 * means all pages have the exact same position of signature that I moved."
 *
 * Placing on N pages produced N unrelated blocks, each given its own position
 * stepped from what that page already carried. So they did not start in the
 * same place, and moving one moved only that one — a 438-page document ended up
 * with the signature somewhere different on every sheet.
 */

const IMAGE = new Uint8Array([1, 2, 3]);

function block(over: Partial<ImageBlock> = {}): ImageBlock {
  return {
    id: 'b1', pageIndex: 0, x: 10, y: 10, width: 100, height: 40,
    imageBytes: IMAGE, rotation: 0, flipH: false, flipV: false, isNew: true,
    ...over,
  };
}

function page(index: number, blocks: ImageBlock[]): PageEditState {
  return {
    pageIndex: index, textBlocks: [], imageBlocks: blocks,
    deletedTextIds: [], deletedImageIds: [], deletedTextBounds: [],
  } as unknown as PageEditState;
}

function stateWith(pages: PageEditState[]) {
  return { pages, isDirty: false, selectedBlockId: null } as never;
}

describe('[SIG-GROUP-01] a grouped stamp moves together', () => {
  const grouped = (id: string, pageIndex: number) =>
    block({ id, pageIndex, groupId: 'stamp-1' });

  it('carries a move to every page the stamp is on', () => {
    const state = stateWith([
      page(0, [grouped('b0', 0)]),
      page(1, [grouped('b1', 1)]),
      page(2, [grouped('b2', 2)]),
    ]);

    const moved = { ...grouped('b0', 0), x: 250, y: 400 };
    const next = editorReducer(state, { type: 'UPDATE_IMAGE_BLOCK', pageIdx: 0, block: moved });

    for (const [i, p] of next.pages.entries()) {
      expect(p.imageBlocks[0], `page ${i} did not follow`).toMatchObject({ x: 250, y: 400 });
    }
  });

  it('carries a resize, a rotation and a flip too', () => {
    const state = stateWith([page(0, [grouped('b0', 0)]), page(1, [grouped('b1', 1)])]);

    const changed = { ...grouped('b0', 0), width: 300, height: 90, rotation: 90 as const, flipH: true };
    const next = editorReducer(state, { type: 'UPDATE_IMAGE_BLOCK', pageIdx: 0, block: changed });

    expect(next.pages[1].imageBlocks[0]).toMatchObject({
      width: 300, height: 90, rotation: 90, flipH: true,
    });
  });

  it('leaves each sibling its own identity and page', () => {
    // Copying the whole block across would give every page the same id and the
    // same pageIndex, which is a different document to the one intended.
    const state = stateWith([page(0, [grouped('b0', 0)]), page(1, [grouped('b1', 1)])]);

    const moved = { ...grouped('b0', 0), x: 99 };
    const next = editorReducer(state, { type: 'UPDATE_IMAGE_BLOCK', pageIdx: 0, block: moved });

    expect(next.pages[1].imageBlocks[0].id).toBe('b1');
    expect(next.pages[1].imageBlocks[0].pageIndex).toBe(1);
  });

  it('does not disturb a block from a different stamp on the same page', () => {
    const other = block({ id: 'other', pageIndex: 1, groupId: 'stamp-2', x: 5, y: 5 });
    const state = stateWith([page(0, [grouped('b0', 0)]), page(1, [grouped('b1', 1), other])]);

    const moved = { ...grouped('b0', 0), x: 250 };
    const next = editorReducer(state, { type: 'UPDATE_IMAGE_BLOCK', pageIdx: 0, block: moved });

    expect(next.pages[1].imageBlocks.find((b) => b.id === 'other')).toMatchObject({ x: 5, y: 5 });
  });

  it('leaves an ungrouped block alone, so a second stamp does not drag the first', () => {
    const first = block({ id: 'first', pageIndex: 0, x: 5, y: 5 });
    const second = block({ id: 'second', pageIndex: 0, x: 40, y: 40 });
    const state = stateWith([page(0, [first, second])]);

    const moved = { ...second, x: 300 };
    const next = editorReducer(state, { type: 'UPDATE_IMAGE_BLOCK', pageIdx: 0, block: moved });

    expect(next.pages[0].imageBlocks.find((b) => b.id === 'first')).toMatchObject({ x: 5, y: 5 });
    expect(next.pages[0].imageBlocks.find((b) => b.id === 'second')).toMatchObject({ x: 300 });
  });
});
