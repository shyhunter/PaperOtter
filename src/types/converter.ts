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
  | 'pdf'
  | 'md'
  | 'html'
  | 'json';

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
  /** Built-in engine only: split output into one file per chapter (H1), packaged as a .zip. */
  splitByChapter?: boolean;
}

export interface ConvertResult {
  outputBytes: Uint8Array;
  outputFormat: ConvertFormat;
  originalSize: number;
  outputSize: number;
  /** True when outputBytes is a .zip of per-chapter files (save with a .zip extension). */
  archive?: boolean;
}

/** All converter backends the app can use. `builtin` is the in-process engine (always available). */
export type ConverterEngine = 'builtin' | 'textutil' | 'word' | 'libreoffice' | 'calibre' | 'pandoc';

/** Which backends are available on this system (detected once at startup). */
export interface ConverterAvailability {
  /** In-process engine (PDF → md/html/txt/json). Always true — no external tool needed. */
  builtin: boolean;
  textutil: boolean;
  word: boolean;
  libreoffice: boolean;
  calibre: boolean;
  pandoc: boolean;
}

/** AI-friendly, structure-preserving formats produced in-process by the built-in engine. */
export const BUILTIN_OUTPUT_FORMATS: readonly ConvertFormat[] = [
  'md', 'html', 'json',
] as const;

/** Input formats the built-in engine can parse in-process. */
export const BUILTIN_INPUT_FORMATS: readonly ConvertFormat[] = ['pdf', 'docx'] as const;

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
