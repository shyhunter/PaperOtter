import { describe, it, expect } from 'vitest';
import { turnImage, type ImageRotation } from '@/lib/imageRotate';
import { turnBy, type RotationDegrees } from '@/lib/pdfRotate';

/**
 * [IMG-ROT] Rotate Image turns the way Rotate PDF turns.
 *
 * It did not. Its cycle was `90 | 180 | 270` with no 0 in it, so the tool
 * opened on an image already turned a quarter, and left and right walked three
 * states that never included the one the user started from — there was no way
 * back to the picture as it arrived. Rotate PDF has always had 0.
 */
describe('[IMG-ROT-01] the same four positions, in the same order', () => {
  it('right goes 0 → 90 → 180 → 270 → 0', () => {
    let at: ImageRotation = 0;
    const seen: ImageRotation[] = [];
    for (let i = 0; i < 4; i++) { at = turnImage(at, 'right'); seen.push(at); }
    expect(seen).toEqual([90, 180, 270, 0]);
  });

  it('left undoes a right, from every position', () => {
    for (const at of [0, 90, 180, 270] as const) {
      expect(turnImage(turnImage(at, 'right'), 'left'), `${at} did not come back`).toBe(at);
    }
  });

  it('two rights are a half turn', () => {
    expect(turnImage(turnImage(0, 'right'), 'right')).toBe(180);
  });

  it('can always return to the image as it arrived', () => {
    // The whole point of having 0: three lefts from 270 is where it started.
    let at: ImageRotation = 270;
    for (let i = 0; i < 3; i++) at = turnImage(at, 'left');
    expect(at).toBe(0);
  });

  it('agrees with Rotate PDF exactly, at every position and in both directions', () => {
    // Two tools doing one job. If these ever disagree, one of them is wrong.
    for (const at of [0, 90, 180, 270] as const) {
      for (const direction of ['left', 'right'] as const) {
        expect(turnImage(at, direction), `${at} ${direction}`)
          .toBe(turnBy(at as RotationDegrees, direction));
      }
    }
  });
});
