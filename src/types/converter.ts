/** Document/ebook conversion types — used by the Convert Document tool. */

export type ConvertFormat =
  | 'docx'
  | 'doc'
  | 'odt'
  | 'epub'
  | 'mobi'
  | 'azw3'
  | 'txt'
  | 'rtf'
  | 'pdf';

export type EpubLayout = 'reflowable' | 'fixed';

export interface ConvertOptions {
  outputFormat: ConvertFormat;
  fontFamily?: string;
  fontSize?: number;
  marginTop?: number;
  marginRight?: number;
  marginBottom?: number;
  marginLeft?: number;
  lineSpacing?: number;
  paragraphSpacing?: number;
  epubLayout?: EpubLayout;
}

export interface ConvertResult {
  outputBytes: Uint8Array;
  outputFormat: ConvertFormat;
  originalSize: number;
  outputSize: number;
}

/** All converter backends the app can use. */
export type ConverterEngine = 'textutil' | 'word' | 'libreoffice' | 'calibre' | 'pandoc';

/** Which backends are available on this system (detected once at startup). */
export interface ConverterAvailability {
  textutil: boolean;
  word: boolean;
  libreoffice: boolean;
  calibre: boolean;
  pandoc: boolean;
}

/** Formats textutil can produce (macOS built-in). */
export const TEXTUTIL_OUTPUT_FORMATS: readonly ConvertFormat[] = [
  'txt', 'rtf', 'doc', 'docx', 'odt',
] as const;

/** Formats Word can produce. */
export const WORD_OUTPUT_FORMATS: readonly ConvertFormat[] = [
  'pdf', 'docx', 'doc', 'rtf', 'txt', 'odt',
] as const;

/** Formats LibreOffice can produce. */
export const LIBREOFFICE_OUTPUT_FORMATS: readonly ConvertFormat[] = [
  'pdf', 'docx', 'doc', 'odt', 'txt', 'rtf',
] as const;

/** Formats Calibre can produce. */
export const CALIBRE_OUTPUT_FORMATS: readonly ConvertFormat[] = [
  'epub', 'mobi', 'azw3', 'pdf',
] as const;

// Keep for backward compat with existing imports
export const DOCUMENT_FORMATS = LIBREOFFICE_OUTPUT_FORMATS;
export const EBOOK_FORMATS = CALIBRE_OUTPUT_FORMATS;
