/** Colour data for page numbers, kept apart from the pdf-lib drawing code so the
 * UI can read it without importing (or mocking) the PDF machinery. */

export interface ColorPreset {
  label: string;
  hex: string;
}

/** Matches the behaviour from before page numbers had a colour. */
export const DEFAULT_NUMBER_COLOR = '#000000';

/** Common page-number colours. White is here deliberately: numbering over dark
 * pages or full-bleed images needs it, even though it is invisible on plain white. */
export const COLOR_PRESETS: readonly ColorPreset[] = [
  { label: 'Black', hex: DEFAULT_NUMBER_COLOR },
  { label: 'White', hex: '#FFFFFF' },
  { label: 'Grey', hex: '#808080' },
  { label: 'Red', hex: '#DC2626' },
  { label: 'Blue', hex: '#2563EB' },
];
