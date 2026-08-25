/**
 * Corner resizing for editor blocks, in PDF coordinates (y is the bottom edge
 * and grows upward).
 *
 * Kept pure so the one rule that matters can be tested without a layout engine:
 * dragging a corner must leave the opposite corner exactly where it was. A
 * resize that also slides the block is what makes a box hard to size -- you
 * chase it around the page instead of shaping it.
 */

export type Corner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export interface BlockRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ResizeLimits {
  minWidth: number;
  minHeight: number;
}

/**
 * @param dx  Horizontal movement in PDF units (screen pixels / zoom).
 * @param dy  Vertical movement in PDF units, positive upward -- screen down is
 *            negative here, the same flip the CSS positioning makes.
 */
export function resizeFromCorner(
  block: BlockRect,
  corner: Corner,
  dx: number,
  dy: number,
  { minWidth, minHeight }: ResizeLimits,
): BlockRect {
  const left = block.x;
  const right = block.x + block.width;
  const bottom = block.y;
  const top = block.y + block.height;

  const movesLeft = corner === 'top-left' || corner === 'bottom-left';
  const movesBottom = corner === 'bottom-left' || corner === 'bottom-right';

  // Each dragged edge moves; its opposite is the anchor and stays put. The
  // minimum is applied to the resulting extent, not to the moved coordinate --
  // that is what stops a corner dragged past its opposite from inverting the
  // block instead of collapsing it.
  const width = Math.max(minWidth, movesLeft ? right - (left + dx) : (right + dx) - left);
  const height = Math.max(minHeight, movesBottom ? top - (bottom + dy) : (top + dy) - bottom);

  return {
    x: movesLeft ? right - width : left,
    y: movesBottom ? top - height : bottom,
    width,
    height,
  };
}
