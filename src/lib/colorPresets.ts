
import { t } from '@/i18n';/**
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
 * Charcoal and Navy earn their place the same way: the editor's redact panel
 * offered a dark grey and its sign panel a navy ink, and unifying a vocabulary
 * must not quietly take a colour away from the feature that had it.
 *
 * White is here deliberately: text, numbering or a watermark over dark pages or
 * full-bleed images needs it, even though it is invisible on plain white.
 */
export const COLOR_PRESETS: readonly ColorPreset[] = [
  { label: t('colorPresets.black'), hex: DEFAULT_TEXT_COLOR },
  { label: t('colorPresets.white'), hex: '#FFFFFF' },
  { label: t('colorPresets.charcoal'), hex: '#333333' },
  { label: t('colorPresets.grey'), hex: '#808080' },
  { label: t('colorPresets.red'), hex: '#DC2626' },
  { label: t('colorPresets.orange'), hex: '#F59E0B' },
  { label: t('colorPresets.green'), hex: '#16A34A' },
  { label: t('colorPresets.blue'), hex: '#2563EB' },
  { label: t('colorPresets.navy'), hex: '#1A365D' },
  { label: t('colorPresets.purple'), hex: '#7C3AED' },
  { label: t('colorPresets.pink'), hex: '#EC4899' },
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

/**
 * Reduces a colour to a canonical, opaque `#rrggbb`, or black if it is not one.
 *
 * This is what stands between user input and a canvas `fillStyle`, which will
 * accept `transparent`, `rgba(0,0,0,0)` or `none` without complaint. Anywhere a
 * colour paints over content that must stay hidden, an invisible fill is not a
 * cosmetic bug -- so nothing but six hex digits gets through.
 */
export function normaliseHex(hex: string | undefined | null): string {
  const match = HEX_COLOR.exec(hex ?? '');
  return match ? `#${match[1].toLowerCase()}` : DEFAULT_TEXT_COLOR;
}

/**
 * Whether a colour is light enough to disappear against a white page.
 *
 * Rec. 601 luma, which is close enough for a yes/no about visibility and needs
 * no gamma handling. Used where a fill is meant to *show* that something was
 * covered -- a redaction box the reader cannot see is a box they cannot check.
 */
export function isLightColor(hex: string): boolean {
  const { r, g, b } = hexToRgb(normaliseHex(hex));
  return 0.299 * r + 0.587 * g + 0.114 * b > 0.75;
}
