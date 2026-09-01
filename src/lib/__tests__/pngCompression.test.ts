// PNG compression level mapping (PNGC-01).
//
// Regression tests for a bug found on Ubuntu: the PNG compression slider showed
// ten levels and delivered two. Two separate causes, both here.
import { describe, it, expect } from 'vitest';
import { pngLevelForQuality, PNG_MAX_LEVEL } from '@/lib/pngCompression';

describe('PNG compression level', () => {
  it('[PNGC-01a] reaches both ends of the scale from the slider', () => {
    // The slider runs 1..100, not 0..100. The old mapping divided by 100, so
    // its lowest reachable level was 8 and CompressionType::Best — the entire
    // point of "maximum compression" — could never be selected at all.
    expect(pngLevelForQuality(1)).toBe(9);
    expect(pngLevelForQuality(100)).toBe(0);
  });

  it('[PNGC-01b] every level between 0 and 9 is reachable', () => {
    // Ten labelled steps that produce fewer than ten encodings is the bug.
    const reachable = new Set<number>();
    for (let quality = 1; quality <= 100; quality++) {
      reachable.add(pngLevelForQuality(quality));
    }
    expect([...reachable].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('[PNGC-01c] more quality never means more compression', () => {
    for (let quality = 2; quality <= 100; quality++) {
      expect(
        pngLevelForQuality(quality),
        `level rose between quality ${quality - 1} and ${quality}`,
      ).toBeLessThanOrEqual(pngLevelForQuality(quality - 1));
    }
  });

  it('[PNGC-01d] holds the level the existing interface already showed at 80', () => {
    // IC-02 asserts "Compression: 2/9" at the default quality of 80. The fix
    // must not move the default, only make the extremes reachable.
    expect(pngLevelForQuality(80)).toBe(2);
  });

  it('[PNGC-01e] clamps rather than returning a level the encoder rejects', () => {
    // image 0.25 documents CompressionType::Level as 1..=9, so an out-of-range
    // value is not a display problem, it is an encoder error.
    expect(pngLevelForQuality(0)).toBe(PNG_MAX_LEVEL);
    expect(pngLevelForQuality(-50)).toBe(PNG_MAX_LEVEL);
    expect(pngLevelForQuality(500)).toBe(0);
  });

  it('[PNGC-01f] never rounds a half, so Rust and TypeScript cannot disagree', () => {
    // The original bug was exactly this: TypeScript rounded and Rust truncated,
    // so the label named a level the encoder was not using. Both now round, and
    // they only agree for certain if no input lands on a tie.
    for (let quality = 1; quality <= 100; quality++) {
      const exact = ((100 - quality) * 9) / 99;
      expect(Math.abs(exact - Math.floor(exact) - 0.5), `quality ${quality} is a tie`)
        .toBeGreaterThan(1e-9);
    }
  });
});
