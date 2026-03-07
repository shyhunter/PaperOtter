// Extracts text with position/font data from PDF pages using pdfjs-dist.
//
// CRITICAL: Always pass pdfBytes.slice() to getDocument() — PDF.js transfers
// the ArrayBuffer to its web worker, which detaches it. React StrictMode
// runs effects twice, so the second run would get a neutered buffer.

import * as pdfjsLib from 'pdfjs-dist';
import type { TextItem } from 'pdfjs-dist/types/src/display/api';

/** A single extracted text item with position, size, and font data. */
export interface ExtractedTextItem {
  /** Unique ID for tracking edits */
  id: string;
  /** The text content */
  text: string;
  /** X position in PDF points (from left edge) */
  x: number;
  /** Y position in PDF points (from bottom edge) */
  y: number;
  /** Text width in PDF points */
  width: number;
  /** Text height in PDF points (derived from font size) */
  height: number;
  /** Font size in PDF points */
  fontSize: number;
  /** Font name (e.g. "g_d0_f1") */
  fontName: string;
  /** Raw 6-element transform matrix [scaleX, skewY, skewX, scaleY, translateX, translateY] */
  transform: number[];
}

/**
 * Extract text items with position/font data from a single PDF page.
 * @param pdfBytes - The PDF file bytes
 * @param pageIndex - Zero-based page index
 * @returns Array of extracted text items sorted top-to-bottom, left-to-right
 */
export async function extractPageText(
  pdfBytes: Uint8Array,
  pageIndex: number,
): Promise<ExtractedTextItem[]> {
  const loadingTask = pdfjsLib.getDocument({ data: pdfBytes.slice() });
  const pdfDoc = await loadingTask.promise;

  try {
    const pageNum = pageIndex + 1; // pdfjs is 1-indexed
    if (pageNum < 1 || pageNum > pdfDoc.numPages) {
      return [];
    }

    const page = await pdfDoc.getPage(pageNum);
    const textContent = await page.getTextContent();

    const items: ExtractedTextItem[] = [];

    for (const item of textContent.items) {
      // Filter to TextItem type (items with 'str' property)
      if (!('str' in item) || typeof (item as TextItem).str !== 'string') {
        continue;
      }

      const textItem = item as TextItem;
      if (!textItem.str.trim()) continue; // skip whitespace-only items

      // Transform matrix: [scaleX, skewY, skewX, scaleY, translateX, translateY]
      const transform = textItem.transform;
      const x = transform[4];
      const y = transform[5];
      const fontSize = Math.abs(transform[3]); // scaleY encodes font size
      const width = textItem.width;
      const height = fontSize; // approximate height from font size

      items.push({
        id: crypto.randomUUID(),
        text: textItem.str,
        x,
        y,
        width,
        height,
        fontSize,
        fontName: textItem.fontName,
        transform: [...transform],
      });
    }

    // Sort by y descending (top-to-bottom) then x ascending (left-to-right)
    items.sort((a, b) => {
      const yDiff = b.y - a.y;
      if (Math.abs(yDiff) > 1) return yDiff; // tolerance for same-line items
      return a.x - b.x;
    });

    return items;
  } finally {
    pdfDoc.destroy();
  }
}

/**
 * Extract text from all pages in a PDF.
 * @param pdfBytes - The PDF file bytes
 * @returns Map keyed by zero-based page index, values are arrays of ExtractedTextItem
 */
export async function extractAllPagesText(
  pdfBytes: Uint8Array,
): Promise<Map<number, ExtractedTextItem[]>> {
  const loadingTask = pdfjsLib.getDocument({ data: pdfBytes.slice() });
  const pdfDoc = await loadingTask.promise;

  try {
    const result = new Map<number, ExtractedTextItem[]>();

    for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
      const page = await pdfDoc.getPage(pageNum);
      const textContent = await page.getTextContent();

      const items: ExtractedTextItem[] = [];

      for (const item of textContent.items) {
        if (!('str' in item) || typeof (item as TextItem).str !== 'string') {
          continue;
        }

        const textItem = item as TextItem;
        if (!textItem.str.trim()) continue;

        const transform = textItem.transform;
        const x = transform[4];
        const y = transform[5];
        const fontSize = Math.abs(transform[3]);
        const width = textItem.width;
        const height = fontSize;

        items.push({
          id: crypto.randomUUID(),
          text: textItem.str,
          x,
          y,
          width,
          height,
          fontSize,
          fontName: textItem.fontName,
          transform: [...transform],
        });
      }

      // Sort by y descending then x ascending
      items.sort((a, b) => {
        const yDiff = b.y - a.y;
        if (Math.abs(yDiff) > 1) return yDiff;
        return a.x - b.x;
      });

      result.set(pageNum - 1, items);
    }

    return result;
  } finally {
    pdfDoc.destroy();
  }
}

/**
 * Get the dimensions of a PDF page in PDF points.
 * @param pdfBytes - The PDF file bytes
 * @param pageIndex - Zero-based page index
 * @returns Page width and height in PDF points
 */
export async function getPageDimensions(
  pdfBytes: Uint8Array,
  pageIndex: number,
): Promise<{ width: number; height: number }> {
  const loadingTask = pdfjsLib.getDocument({ data: pdfBytes.slice() });
  const pdfDoc = await loadingTask.promise;

  try {
    const pageNum = pageIndex + 1;
    if (pageNum < 1 || pageNum > pdfDoc.numPages) {
      throw new Error(`Page ${pageNum} out of range (1-${pdfDoc.numPages})`);
    }

    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1.0 });

    return { width: viewport.width, height: viewport.height };
  } finally {
    pdfDoc.destroy();
  }
}
