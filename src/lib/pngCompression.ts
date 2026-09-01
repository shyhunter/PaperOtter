// PNG compression level, shared by the slider label and — by construction —
// the Rust encoder.
//
// PNG is lossless, so the slider does not trade quality: it sets how hard
// deflate works. Higher level, smaller file, slower encode, identical pixels.
// The slider itself still runs 1..100 like the JPEG one, because it is the same
// control; only its meaning and its label change with the output format.
//
// This exists as its own module because the mapping was previously written
// twice — once in TypeScript for the label, once in Rust for the encoder — and
// the two did not agree. See PNGC-01 and the Rust `png_compression_level` tests.

/** Highest deflate level. `image` documents CompressionType::Level as 1..=9. */
export const PNG_MAX_LEVEL = 9;

/**
 * Maps the 1..100 slider to a 0..9 deflate level, inverted: quality 100 is
 * level 0 (fastest, largest), quality 1 is level 9 (smallest, slowest).
 *
 * Divides by 99, not 100, because the slider's range is 1..100 — 99 steps. The
 * previous `/100` meant the bottom of the slider produced level 8 and level 9
 * was unreachable, so "maximum compression" silently was not.
 *
 * Rust performs the identical calculation. PNGC-01f pins the one property that
 * makes that safe: no slider position lands on a .5 tie, so the two languages'
 * rounding rules cannot diverge.
 */
export function pngLevelForQuality(quality: number): number {
  const level = Math.round(((100 - quality) * PNG_MAX_LEVEL) / 99);
  return Math.min(PNG_MAX_LEVEL, Math.max(0, level));
}
