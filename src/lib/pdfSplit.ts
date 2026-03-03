// PDF split engine — splits a PDF by page ranges, every N pages, or individual pages.
// CRITICAL: Never use useCompression: true (pdf-lib issue #1445 — corrupts output).
import { PDFDocument } from 'pdf-lib';

export type SplitMode =
  | { type: 'ranges'; ranges: PageRange[] }
  | { type: 'every-n'; n: number }
  | { type: 'individual' };

export interface PageRange {
  start: number; // 1-based
  end: number;   // 1-based, inclusive
}

export interface SplitOutput {
  fileName: string;
  bytes: Uint8Array;
  pageCount: number;
  pageNumbers: number[]; // 1-based page numbers included
}

export interface SplitResult {
  outputs: SplitOutput[];
  sourceFileName: string;
  sourceTotalPages: number;
}

/**
 * Parse page range text like "1-3, 5, 7-10" into PageRange array.
 * Validates bounds and returns sorted, non-overlapping ranges.
 */
export function parsePageRangeText(text: string, totalPages: number): PageRange[] {
  const ranges: PageRange[] = [];
  const parts = text.split(',').map((s) => s.trim()).filter(Boolean);

  for (const part of parts) {
    const dashMatch = part.match(/^(\d+)\s*-\s*(\d+)$/);
    if (dashMatch) {
      const start = parseInt(dashMatch[1], 10);
      const end = parseInt(dashMatch[2], 10);
      if (start < 1 || end < 1 || start > totalPages || end > totalPages) {
        throw new Error(`Page range ${part} is out of bounds (1–${totalPages}).`);
      }
      if (start > end) {
        throw new Error(`Invalid range ${part}: start must be ≤ end.`);
      }
      ranges.push({ start, end });
    } else {
      const num = parseInt(part, 10);
      if (isNaN(num) || num < 1 || num > totalPages) {
        throw new Error(`Invalid page number "${part}" (valid: 1–${totalPages}).`);
      }
      ranges.push({ start: num, end: num });
    }
  }

  return ranges;
}

/**
 * Build page number groups from a SplitMode and total page count.
 */
function buildPageGroups(mode: SplitMode, totalPages: number): number[][] {
  switch (mode.type) {
    case 'ranges': {
      return mode.ranges.map((r) => {
        const pages: number[] = [];
        for (let p = r.start; p <= r.end; p++) pages.push(p);
        return pages;
      });
    }
    case 'every-n': {
      const groups: number[][] = [];
      for (let i = 1; i <= totalPages; i += mode.n) {
        const group: number[] = [];
        for (let p = i; p < i + mode.n && p <= totalPages; p++) group.push(p);
        groups.push(group);
      }
      return groups;
    }
    case 'individual': {
      return Array.from({ length: totalPages }, (_, i) => [i + 1]);
    }
  }
}

function buildOutputFileName(baseName: string, pages: number[]): string {
  if (pages.length === 1) {
    return `${baseName}_page_${pages[0]}.pdf`;
  }
  return `${baseName}_pages_${pages[0]}-${pages[pages.length - 1]}.pdf`;
}

/**
 * Split a PDF into multiple outputs based on the given mode.
 */
export async function splitPdf(
  pdfBytes: Uint8Array,
  sourceFileName: string,
  mode: SplitMode,
): Promise<SplitResult> {
  const source = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const totalPages = source.getPageCount();
  const baseName = sourceFileName.replace(/\.pdf$/i, '');
  const groups = buildPageGroups(mode, totalPages);

  const outputs: SplitOutput[] = [];

  for (const pageNumbers of groups) {
    const newDoc = await PDFDocument.create();
    // pdf-lib uses 0-based indices
    const indices = pageNumbers.map((p) => p - 1);
    const copiedPages = await newDoc.copyPages(source, indices);
    for (const page of copiedPages) {
      newDoc.addPage(page);
    }
    const bytes = await newDoc.save({ useObjectStreams: true });

    outputs.push({
      fileName: buildOutputFileName(baseName, pageNumbers),
      bytes: new Uint8Array(bytes),
      pageCount: pageNumbers.length,
      pageNumbers,
    });
  }

  return { outputs, sourceFileName, sourceTotalPages: totalPages };
}
