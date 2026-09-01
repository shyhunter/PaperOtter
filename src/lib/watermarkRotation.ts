// Watermark rotation stepping.
//
// The angle is set by two arrow buttons rather than typed, matching the Rotate
// tool's gesture. Kept out of the components because both the standalone
// Watermark tool and the editor's Watermark panel need the identical stepping,
// and they are separate code that had drifted apart already: the tool offered
// three fixed presets, the panel a free number input.

/**
 * Degrees per arrow click.
 *
 * 45 is what the tool's three presets (-45/0/45) already implied. It reaches
 * every one of them, keeps the diagonal default a single click from flat, and
 * closes the circle in eight clicks.
 */
export const WATERMARK_ROTATION_STEP = 45;

/**
 * Wraps an angle into (-180, 180].
 *
 * 180 rather than -180 at the boundary: the two are the same angle, the old
 * number input capped at 180, and a control that reads "-180°" looks broken.
 */
export function normalizeWatermarkRotation(degrees: number): number {
  const wrapped = (((degrees + 180) % 360) + 360) % 360 - 180;
  return wrapped === -180 ? 180 : wrapped;
}

/**
 * One arrow click. Wraps rather than clamping, so neither button ever becomes
 * inert at an extreme — an arrow that stops responding reads as a bug.
 *
 * Adds to the current value instead of snapping to the nearest multiple of the
 * step, so an angle that is already off-grid keeps its offset rather than being
 * silently moved.
 */
export function turnWatermarkBy(current: number, direction: 'left' | 'right'): number {
  const delta = direction === 'left' ? -WATERMARK_ROTATION_STEP : WATERMARK_ROTATION_STEP;
  return normalizeWatermarkRotation(current + delta);
}
