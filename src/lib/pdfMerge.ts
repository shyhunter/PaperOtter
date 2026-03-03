// PDF merge engine — combines multiple PDFs into one using pdf-lib.
// CRITICAL: Never use useCompression: true (pdf-lib issue #1445 — corrupts output).
import { readFile } from '@tauri-apps/plugin-fs';
import { PDFDocument } from 'pdf-lib';

export interface MergeInput {
  filePath: string;
  fileName: string;
  pageCount: number;
  bytes: Uint8Array;
}

export interface MergeResult {
  bytes: Uint8Array;
  totalPages: number;
  sourceFiles: string[];
}

/**
 * Load a PDF file and extract metadata for merging.
 * Reads via Tauri fs, loads with pdf-lib for page count.
 */
export async function loadPdfForMerge(filePath: string): Promise<MergeInput> {
  const bytes = await readFile(filePath);
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const pageCount = doc.getPageCount();
  const fileName = filePath.split('/').pop() ?? filePath.split('\\').pop() ?? filePath;

  return { filePath, fileName, pageCount, bytes };
}

/**
 * Merge multiple PDFs into a single document.
 * Pages are copied in the order of the inputs array.
 */
export async function mergePdfs(inputs: MergeInput[]): Promise<MergeResult> {
  if (inputs.length < 2) {
    throw new Error('At least 2 PDFs are required to merge.');
  }

  const merged = await PDFDocument.create();

  for (const input of inputs) {
    const source = await PDFDocument.load(input.bytes, { ignoreEncryption: true });
    const pages = await merged.copyPages(source, source.getPageIndices());
    for (const page of pages) {
      merged.addPage(page);
    }
  }

  const bytes = await merged.save({ useObjectStreams: true });

  return {
    bytes: new Uint8Array(bytes),
    totalPages: merged.getPageCount(),
    sourceFiles: inputs.map((i) => i.fileName),
  };
}
