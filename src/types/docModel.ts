/**
 * Intermediate document model — the "waist" of the converter.
 *
 * Every input parser (PDF via pdfjs, DOCX via mammoth) produces a DocModel;
 * every output renderer (Markdown, HTML, plain text, JSON) consumes one.
 * Adding an input = one parser; adding an output = one renderer.
 */

export type Block =
  | { type: 'heading'; level: number; text: string; page: number }
  | { type: 'paragraph'; text: string; page: number }
  | { type: 'listItem'; text: string; page: number };

export interface DocModel {
  blocks: Block[];
}

/** Thrown when a PDF has no extractable text layer (e.g. a scanned/image PDF). */
export class NoTextLayerError extends Error {
  constructor(message = 'This document has no extractable text — it looks scanned or image-only.') {
    super(message);
    this.name = 'NoTextLayerError';
  }
}
