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

/** Where a new stamp lands, in PDF points, before it is dragged into place. */
export const STAMP_DROP_X = 100;
export const STAMP_DROP_Y = 120;

/** How far each successive stamp steps, and how many steps before it repeats. */
const STAMP_STEP = 18;
const STAMP_CYCLE = 6;

/**
 * Where to drop the next stamp on a page that already has `existing` of them.
 *
 * Every placement used to land on the same point, so pressing Place twice put
 * an identical copy in the identical spot: nothing moved, nothing looked
 * different, and the extra copies could not be selected apart or removed.
 * Reported as "it copy and paste the signature and suddenly I have many
 * signatures of same one".
 *
 * The step cycles rather than growing without limit, so the twentieth stamp is
 * still on the page rather than off the edge of it.
 */
export function nextStampPosition(existing: number): { x: number; y: number } {
  const step = (Math.max(0, existing) % STAMP_CYCLE) * STAMP_STEP;
  // Down and to the right on screen, which is +x and -y in PDF coordinates.
  return { x: STAMP_DROP_X + step, y: STAMP_DROP_Y - step };
}
