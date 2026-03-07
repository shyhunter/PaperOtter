/** Document/ebook conversion types — used by the Convert Document tool (Phase 13). */

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

/** Tracks which engine handles a given conversion. */
export type ConverterEngine = 'libreoffice' | 'calibre' | 'js';

/** Formats handled by LibreOffice (system binary). */
export const DOCUMENT_FORMATS: readonly ConvertFormat[] = [
  'docx',
  'doc',
  'odt',
  'txt',
  'rtf',
  'pdf',
] as const;

/** Formats handled by Calibre ebook-convert (system binary). */
export const EBOOK_FORMATS: readonly ConvertFormat[] = [
  'epub',
  'mobi',
  'azw3',
] as const;
