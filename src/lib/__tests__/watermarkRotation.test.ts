// Watermark rotation stepping (WMROT-01).
//
// The watermark angle used to be typed: three fixed presets in the standalone
// tool (-45/0/45) and a free `<input type="number">` in the editor panel. Both
// are now arrow buttons that turn by a fixed step, so the stepping itself has
// to be a pure function that can be tested without rendering anything.
import { describe, it, expect } from 'vitest';
import {
  WATERMARK_ROTATION_STEP,
  normalizeWatermarkRotation,
  turnWatermarkBy,
} from '@/lib/watermarkRotation';

describe('Watermark rotation stepping', () => {
  it('[WMROT-01a] turns by 45 degrees, the step the presets already used', () => {
    // -45, 0 and 45 were the three offered angles. A 45-degree step reaches all
    // of them and keeps the diagonal default one click away from flat.
    expect(WATERMARK_ROTATION_STEP).toBe(45);
  });

  it('[WMROT-01b] right turns the default diagonal towards flat', () => {
    expect(turnWatermarkBy(-45, 'right')).toBe(0);
    expect(turnWatermarkBy(0, 'right')).toBe(45);
  });

  it('[WMROT-01c] left turns the other way', () => {
    expect(turnWatermarkBy(-45, 'left')).toBe(-90);
    expect(turnWatermarkBy(0, 'left')).toBe(-45);
  });

  it('[WMROT-01d] wraps rather than dead-ending at the extremes', () => {
    // An arrow that stops responding at 180 looks broken. Angles are a circle,
    // so the buttons never become inert.
    expect(turnWatermarkBy(135, 'right')).toBe(180);
    expect(turnWatermarkBy(180, 'right')).toBe(-135);
    expect(turnWatermarkBy(-135, 'left')).toBe(180);
  });

  it('[WMROT-01e] eight clicks in either direction return to where they started', () => {
    for (const direction of ['left', 'right'] as const) {
      let angle = -45;
      for (let i = 0; i < 8; i++) angle = turnWatermarkBy(angle, direction);
      expect(angle, `${direction} did not close the circle`).toBe(-45);
    }
  });

  it('[WMROT-01f] normalises to (-180, 180], never showing -180', () => {
    // -180 and 180 are the same angle; showing "-180°" reads as a bug, and the
    // old number input capped at 180.
    expect(normalizeWatermarkRotation(-180)).toBe(180);
    expect(normalizeWatermarkRotation(180)).toBe(180);
    expect(normalizeWatermarkRotation(225)).toBe(-135);
    expect(normalizeWatermarkRotation(-225)).toBe(135);
    expect(normalizeWatermarkRotation(720)).toBe(0);
  });

  it('[WMROT-01g] keeps an off-grid angle off-grid rather than snapping it', () => {
    // The editor accepted any integer, so state can hold 30. Snapping to the
    // nearest multiple of 45 would silently change a value the user chose.
    expect(turnWatermarkBy(30, 'right')).toBe(75);
    expect(turnWatermarkBy(30, 'left')).toBe(-15);
  });
});
