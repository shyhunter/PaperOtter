import { describe, it, expect } from 'vitest';
import { COLOR_PRESETS, DEFAULT_TEXT_COLOR, hexToRgb, isLightColor, normaliseHex } from '@/lib/colorPresets';

describe('colorPresets — one colour vocabulary for the whole app', () => {
  it('[COL-01] every preset is a labelled #RRGGBB value', () => {
    for (const preset of COLOR_PRESETS) {
      expect(preset.hex).toMatch(/^#[0-9A-F]{6}$/);
      expect(preset.label.length).toBeGreaterThan(0);
    }
  });

  it('[COL-02] no colour appears twice under two labels', () => {
    const hexes = COLOR_PRESETS.map((p) => p.hex.toLowerCase());
    expect(new Set(hexes).size).toBe(hexes.length);

    const labels = COLOR_PRESETS.map((p) => p.label.toLowerCase());
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('[COL-03] covers every colour the separate lists used to offer', () => {
    const hexes = COLOR_PRESETS.map((p) => p.hex.toUpperCase());
    // Union of the four vocabularies this module replaces: page numbers,
    // both text toolbars, and the watermark's gray/red/blue.
    for (const hex of ['#000000', '#FFFFFF', '#808080', '#DC2626', '#2563EB', '#16A34A']) {
      expect(hexes).toContain(hex);
    }
  });

  it('[COL-04] White is present — numbering or watermarking dark pages needs it', () => {
    expect(COLOR_PRESETS.map((p) => p.hex.toUpperCase())).toContain('#FFFFFF');
  });

  it('[COL-05] the default is black, as every feature defaulted before', () => {
    expect(DEFAULT_TEXT_COLOR).toBe('#000000');
  });

  it('[COL-06] hexToRgb converts to pdf-lib components', () => {
    expect(hexToRgb('#FFFFFF')).toEqual({ r: 1, g: 1, b: 1 });
    expect(hexToRgb('#000000')).toEqual({ r: 0, g: 0, b: 0 });
    // The watermark's old 'gray' was rgb(0.5, 0.5, 0.5); #808080 is the same
    // colour to within a 255th, so switching to hex changes no output.
    const grey = hexToRgb('#808080');
    expect(grey.r).toBeCloseTo(0.5, 2);
  });

  it('[COL-07] hexToRgb falls back to black rather than throwing', () => {
    // The value reaches a PDF content stream, so it must never pass through
    // unvalidated -- but a bad colour should not cost the user their output.
    expect(hexToRgb('not a colour')).toEqual({ r: 0, g: 0, b: 0 });
    expect(hexToRgb('')).toEqual({ r: 0, g: 0, b: 0 });
  });

  it('[COL-08] normaliseHex returns a canonical opaque #rrggbb', () => {
    expect(normaliseHex('#DC2626')).toBe('#dc2626');
    expect(normaliseHex('dc2626')).toBe('#dc2626');
    expect(normaliseHex('#FFFFFF')).toBe('#ffffff');
  });

  it('[COL-09] normaliseHex refuses anything that could paint transparently', () => {
    // This is what stands between user input and a canvas fillStyle. Canvas
    // accepts 'transparent' and 'rgba(0,0,0,0)' happily -- and a redaction box
    // painted with either is invisible over content that is still there.
    expect(normaliseHex('transparent')).toBe('#000000');
    expect(normaliseHex('rgba(0,0,0,0)')).toBe('#000000');
    expect(normaliseHex('#00000000')).toBe('#000000');
    expect(normaliseHex(undefined)).toBe('#000000');
  });

  it('[COL-10] isLightColor spots the colours that vanish on a white page', () => {
    expect(isLightColor('#FFFFFF')).toBe(true);
    expect(isLightColor('#000000')).toBe(false);
    expect(isLightColor('#808080')).toBe(false);
    // Orange reads as bright but is not light: luma weights green far above red.
    expect(isLightColor('#F59E0B')).toBe(false);
  });
});

// Moved with hexToRgb when it left pdfPageNumbers for the shared module.
describe('hexToRgb', () => {
  it('PN-COL-01: converts black and white to pdf-lib 0..1 components', () => {
    expect(hexToRgb('#000000')).toEqual({ r: 0, g: 0, b: 0 });
    expect(hexToRgb('#FFFFFF')).toEqual({ r: 1, g: 1, b: 1 });
  });

  it('PN-COL-02: converts an arbitrary colour', () => {
    const { r, g, b } = hexToRgb('#DC2626');
    expect(r).toBeCloseTo(0xdc / 255, 5);
    expect(g).toBeCloseTo(0x26 / 255, 5);
    expect(b).toBeCloseTo(0x26 / 255, 5);
  });

  it('PN-COL-03: accepts lowercase and a missing leading hash', () => {
    expect(hexToRgb('#ffffff')).toEqual({ r: 1, g: 1, b: 1 });
    expect(hexToRgb('ffffff')).toEqual({ r: 1, g: 1, b: 1 });
  });

  it('PN-COL-04: falls back to black on malformed input rather than throwing', () => {
    // The value reaches a PDF content stream, so it must never pass through raw.
    expect(hexToRgb('not-a-colour')).toEqual({ r: 0, g: 0, b: 0 });
    expect(hexToRgb('#FFF')).toEqual({ r: 0, g: 0, b: 0 });
    expect(hexToRgb('')).toEqual({ r: 0, g: 0, b: 0 });
    expect(hexToRgb('#12345g')).toEqual({ r: 0, g: 0, b: 0 });
  });
});
