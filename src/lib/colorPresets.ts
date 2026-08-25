/**
 * The app's single colour vocabulary.
 *
 * Kept apart from the pdf-lib drawing code so the UI can read it without
 * importing (or mocking) the PDF machinery -- an integration test that mocks a
 * drawing module wholesale must still be able to name a colour.
 *
 * Replaces four separate lists that had drifted apart: page numbers offered
 * five colours, the two text toolbars offered five and eight different ones,
 * and the watermark offered three under an enum with no hex at all.
 */

export interface ColorPreset {
  label: string;
  hex: string;
}

/** What every feature defaulted to before it could be changed. */
export const DEFAULT_TEXT_COLOR = '#000000';

/**
 * The union of what the separate lists offered, deduplicated.
 *
 * White is here deliberately: text, numbering or a watermark over dark pages or
 * full-bleed images needs it, even though it is invisible on plain white.
 */
export const COLOR_PRESETS: readonly ColorPreset[] = [
  { label: 'Black', hex: DEFAULT_TEXT_COLOR },
  { label: 'White', hex: '#FFFFFF' },
  { label: 'Grey', hex: '#808080' },
  { label: 'Red', hex: '#DC2626' },
  { label: 'Orange', hex: '#F59E0B' },
  { label: 'Green', hex: '#16A34A' },
  { label: 'Blue', hex: '#2563EB' },
  { label: 'Purple', hex: '#7C3AED' },
  { label: 'Pink', hex: '#EC4899' },
];

const HEX_COLOR = /^#?([0-9a-fA-F]{6})$/;

/**
 * Converts a #RRGGBB string to pdf-lib's 0..1 components.
 *
 * Falls back to black on anything malformed rather than throwing: this value is
 * written into a PDF content stream, so it must never pass through unvalidated,
 * and a bad colour should not cost the user their output.
 */
export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const match = HEX_COLOR.exec(hex ?? '');
  if (!match) return { r: 0, g: 0, b: 0 };

  const value = parseInt(match[1], 16);
  return {
    r: ((value >> 16) & 0xff) / 255,
    g: ((value >> 8) & 0xff) / 255,
    b: (value & 0xff) / 255,
  };
}
