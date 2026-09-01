// @vitest-environment jsdom
/**
 * A placed redaction box must be opaque.
 *
 * Reported from a real build: the text under a redaction was still readable
 * through the box. The output was never at risk -- applyRedactions rasterises
 * any page carrying a redaction, so the characters are genuinely destroyed --
 * but a redaction tool that shows you the words you just covered gives no way
 * to confirm the job before committing to it, and reads as broken.
 *
 * The box being dragged out stays translucent: while aiming, seeing the target
 * is the point. Once placed, the decision is made and it covers.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { RedactOverlay, type RedactionRect } from '@/components/redact-pdf/RedactOverlay';

afterEach(cleanup);

const PLACED: RedactionRect = {
  id: 'r1', pageIndex: 0, x: 10, y: 10, width: 30, height: 8, source: 'drawn',
};

function renderOverlay(redactions: RedactionRect[] = [PLACED]) {
  const { container } = render(
    <RedactOverlay
      redactions={redactions}
      onAddRedaction={() => {}}
      onRemoveRedaction={() => {}}
      color="#000000"
      width={600}
      height={800}
    />,
  );
  return container;
}

/** Effective alpha of a rect, whether it came from fill-opacity or an rgba fill. */
function alphaOf(rect: SVGRectElement): number {
  const fo = rect.getAttribute('fill-opacity');
  if (fo !== null) return Number(fo);
  const m = /rgba\([^)]*,\s*([\d.]+)\s*\)/.exec(rect.getAttribute('fill') ?? '');
  return m ? Number(m[1]) : 1;
}

describe('Redaction box opacity', () => {
  it('[RDO-01] a placed box is fully opaque', () => {
    const container = renderOverlay();
    const rects = Array.from(container.querySelectorAll('rect'));
    expect(rects.length, 'the placed redaction should have rendered').toBeGreaterThan(0);

    for (const rect of rects) {
      expect(
        alphaOf(rect),
        'text stayed readable through a redaction box',
      ).toBe(1);
    }
  });

  it('[RDO-02] the box being dragged out stays see-through', () => {
    const container = renderOverlay([]);
    const svg = container.querySelector('svg')!;
    // jsdom has no layout, so give the SVG a box for the percentage maths.
    svg.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 600, height: 800, right: 600, bottom: 800, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;

    fireEvent.mouseDown(svg, { clientX: 60, clientY: 80 });
    fireEvent.mouseMove(svg, { clientX: 260, clientY: 160 });

    const rects = Array.from(container.querySelectorAll('rect'));
    expect(rects.length, 'the drag preview should have rendered').toBe(1);
    expect(
      alphaOf(rects[0]),
      'you must be able to see what you are aiming at while dragging',
    ).toBeLessThan(1);
  });
});
