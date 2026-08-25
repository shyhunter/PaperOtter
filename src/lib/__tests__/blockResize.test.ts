import { describe, it, expect } from 'vitest';
import { resizeFromCorner, type Corner } from '@/lib/blockResize';

// PDF coordinates: y is the bottom edge and grows upward.
const BLOCK = { x: 100, y: 100, width: 200, height: 50 };
const MIN = { minWidth: 30, minHeight: 12 };

/** The corner opposite the one being dragged must not move. */
function corners(b: { x: number; y: number; width: number; height: number }) {
  return {
    'bottom-left': [b.x, b.y],
    'bottom-right': [b.x + b.width, b.y],
    'top-left': [b.x, b.y + b.height],
    'top-right': [b.x + b.width, b.y + b.height],
  } as Record<Corner, [number, number]>;
}

const OPPOSITE: Record<Corner, Corner> = {
  'top-left': 'bottom-right',
  'top-right': 'bottom-left',
  'bottom-left': 'top-right',
  'bottom-right': 'top-left',
};

describe('resizeFromCorner', () => {
  it('[BR-01] every corner leaves the opposite corner exactly where it was', () => {
    // This is the whole contract. Without it a corner drag slides the block
    // around while resizing it, which is what makes a box hard to size.
    for (const corner of Object.keys(OPPOSITE) as Corner[]) {
      const result = resizeFromCorner(BLOCK, corner, 40, -30, MIN);
      const anchor = OPPOSITE[corner];

      expect(corners(result)[anchor][0]).toBeCloseTo(corners(BLOCK)[anchor][0], 6);
      expect(corners(result)[anchor][1]).toBeCloseTo(corners(BLOCK)[anchor][1], 6);
    }
  });

  it('[BR-02] dragging the bottom-right corner out grows the block', () => {
    const result = resizeFromCorner(BLOCK, 'bottom-right', 40, -30, MIN);

    expect(result.width).toBeCloseTo(240, 6);
    expect(result.height).toBeCloseTo(80, 6);
    // The bottom edge moved down, so y — the bottom — is lower than it was.
    expect(result.y).toBeCloseTo(70, 6);
    expect(result.x).toBeCloseTo(100, 6);
  });

  it('[BR-03] dragging the top-left corner out grows it the other way', () => {
    const result = resizeFromCorner(BLOCK, 'top-left', -40, 30, MIN);

    expect(result.x).toBeCloseTo(60, 6);
    expect(result.y).toBeCloseTo(100, 6);
    expect(result.width).toBeCloseTo(240, 6);
    expect(result.height).toBeCloseTo(80, 6);
  });

  it('[BR-04] a corner dragged past its opposite stops at the minimum', () => {
    // Not inverted, not negative: the block collapses to its floor and the
    // anchored corner still holds.
    const result = resizeFromCorner(BLOCK, 'bottom-right', -1000, 1000, MIN);

    expect(result.width).toBe(30);
    expect(result.height).toBe(12);
    expect(result.x).toBeCloseTo(100, 6);
    expect(result.y + result.height).toBeCloseTo(150, 6);
  });

  it('[BR-05] collapsing from the top-left keeps the bottom-right pinned', () => {
    const result = resizeFromCorner(BLOCK, 'top-left', 1000, -1000, MIN);

    expect(result.width).toBe(30);
    expect(result.height).toBe(12);
    expect(result.x + result.width).toBeCloseTo(300, 6);
    expect(result.y).toBeCloseTo(100, 6);
  });

  it('[BR-06] a corner that has not moved changes nothing', () => {
    for (const corner of Object.keys(OPPOSITE) as Corner[]) {
      expect(resizeFromCorner(BLOCK, corner, 0, 0, MIN)).toEqual(BLOCK);
    }
  });
});
