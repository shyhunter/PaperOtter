import { invoke } from '@tauri-apps/api/core';

export interface OcrBlock {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Vision's own confidence for this run of text, 0–1. */
  confidence: number;
}

export interface OcrPage {
  index: number;
  /** Page size in points. */
  width: number;
  height: number;
  blocks: OcrBlock[];
}

export interface OcrSummary {
  pageCount: number;
  wordCount: number;
  /** False when nothing readable came back at all — a different problem from a poor read. */
  foundText: boolean;
  meanConfidence: number;
  lowConfidence: boolean;
}

export interface OcrResult {
  /** The searchable PDF. */
  bytes: Uint8Array;
  pages: OcrPage[];
  summary: OcrSummary;
}

/**
 * Below this, the text is reported as uncertain rather than presented as fact.
 * Vision returns ~1.0 on clean print and falls off sharply on a bad scan, so
 * this sits low enough not to cry wolf on an ordinary phone photo.
 */
export const LOW_CONFIDENCE_THRESHOLD = 0.5;

/**
 * Describes what OCR actually achieved, honestly.
 *
 * "An honest result on a scan too poor to read" is an acceptance criterion, and
 * it splits in two: nothing found at all, and plenty found but probably wrong.
 * Conflating them tells someone their blank page is blurry.
 */
export function summarise(pages: OcrPage[]): OcrSummary {
  const blocks = pages.flatMap((p) => p.blocks);
  const wordCount = blocks.reduce(
    (sum, b) => sum + b.text.trim().split(/\s+/).filter(Boolean).length,
    0,
  );

  // Weighted by text length: one misread character in a corner should not drag
  // down an otherwise clean page, and a long confident block should not hide a
  // bad one.
  const totalChars = blocks.reduce((sum, b) => sum + b.text.length, 0);
  const meanConfidence = totalChars > 0
    ? blocks.reduce((sum, b) => sum + b.confidence * b.text.length, 0) / totalChars
    : 0;

  const foundText = wordCount > 0;
  return {
    pageCount: pages.length,
    wordCount,
    foundText,
    meanConfidence,
    lowConfidence: foundText && meanConfidence < LOW_CONFIDENCE_THRESHOLD,
  };
}

export interface OcrOptions {
  /** BCP-47 tags Vision should look for, e.g. ['de-DE', 'tr-TR']. */
  languages: string[];
}

/**
 * Reads a scanned PDF and returns a searchable copy of it.
 *
 * Two Rust calls rather than one: recognition is the slow part and its output is
 * useful on its own — the summary below, and redaction search over a scan — so
 * the recognised text is passed back to write the layer instead of recognising
 * the document twice.
 */
export async function ocrPdf(sourcePath: string, options: OcrOptions): Promise<OcrResult> {
  const json: string = await invoke('ocr_pdf', {
    sourcePath,
    languages: options.languages,
  });
  const pages: OcrPage[] = JSON.parse(json);

  const bytes: Uint8Array = await invoke('write_searchable_pdf', {
    sourcePath,
    pagesJson: json,
  });

  return { bytes, pages, summary: summarise(pages) };
}
