/**
 * Extract a PDF's embedded outline (bookmarks / table of contents) as chapter
 * boundaries. This is the author-defined chapter structure — far more reliable
 * than inferring headings from font sizes on professionally-typeset PDFs.
 *
 * Only the top level of the outline is used (chapters, not sub-sections).
 */

import * as pdfjsLib from 'pdfjs-dist';
import type { PageBoundary } from '@/lib/splitDoc';

/** A raw outline node as returned by pdfjs (only the fields we use). */
export interface OutlineNode {
  title: string;
  dest: string | unknown[] | null;
}

/** Resolves a pdfjs destination to a 1-based page number, or null. */
export type PageResolver = (dest: string | unknown[] | null) => Promise<number | null>;

/**
 * Map top-level outline nodes to page boundaries using an injected resolver.
 * Pure/testable — no pdfjs. Drops entries with no title or unresolved page,
 * sorts by page, and dedupes boundaries that land on the same page.
 */
export async function outlineToBoundaries(
  nodes: OutlineNode[],
  resolve: PageResolver,
): Promise<PageBoundary[]> {
  const out: PageBoundary[] = [];
  for (const node of nodes) {
    const title = node.title?.trim();
    if (!title) continue;
    const startPage = await resolve(node.dest);
    if (startPage == null) continue;
    out.push({ title, startPage });
  }
  out.sort((a, b) => a.startPage - b.startPage);
  // Dedupe: keep the first title when several bookmarks target the same page.
  return out.filter((b, i) => i === 0 || b.startPage !== out[i - 1].startPage);
}

/** Extract top-level outline boundaries from a PDF's bytes ([] if none). */
export async function extractPdfOutline(pdfBytes: Uint8Array): Promise<PageBoundary[]> {
  const pdfDoc = await pdfjsLib.getDocument({ data: pdfBytes.slice() }).promise;
  try {
    const outline = (await pdfDoc.getOutline()) as OutlineNode[] | null;
    if (!outline || outline.length === 0) return [];

    const resolve: PageResolver = async (dest) => {
      try {
        const explicit = typeof dest === 'string' ? await pdfDoc.getDestination(dest) : dest;
        if (!Array.isArray(explicit) || explicit.length === 0 || explicit[0] == null) return null;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pageIndex = await pdfDoc.getPageIndex(explicit[0] as any);
        return pageIndex + 1; // 1-based to match DocModel block.page
      } catch {
        return null;
      }
    };

    return await outlineToBoundaries(outline, resolve);
  } finally {
    pdfDoc.destroy();
  }
}
