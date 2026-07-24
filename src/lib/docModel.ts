/**
 * PDF → DocModel structure inference.
 *
 * Pure functions over already-extracted text items (see pdfTextExtract.ts), so
 * they run identically in the app (items from pdfjs worker) and in tests (items
 * from the pdfjs legacy build). All the layout heuristics — validated by the
 * throwaway prototype in prototypes/ — live here.
 *
 * Heuristics: heading = larger font OR bold OR short ALL-CAPS line; paragraphs =
 * consecutive body lines reflowed (wrap-join + de-hyphenation); running
 * headers/footers = text repeated near a page edge across most pages.
 */

import type { ExtractedTextItem } from '@/lib/pdfTextExtract';
import type { Block, DocModel } from '@/types/docModel';
import { NoTextLayerError } from '@/types/docModel';

interface Line {
  y: number;
  x: number;
  size: number;
  bold: boolean;
  text: string;
}

const BULLET = /^\s*([•◦▪‣]|[-*]\s)/;
const NUMBERED = /^\s*(\d+[.)]|[a-z][.)])\s+/i;

/** Most frequent value in a list. */
function mode(nums: number[]): number {
  const counts = new Map<number, number>();
  for (const n of nums) counts.set(n, (counts.get(n) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

/** Group a page's items into visual lines by shared baseline y, ordered top→bottom. */
function groupLines(items: ExtractedTextItem[]): Line[] {
  const lines: { y: number; parts: ExtractedTextItem[] }[] = [];
  // pdfjs y-origin is bottom-left → larger y is higher on the page.
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  let cur: { y: number; parts: ExtractedTextItem[] } | null = null;
  for (const it of sorted) {
    if (cur && Math.abs(cur.y - it.y) <= Math.max(2, it.fontSize * 0.5)) {
      cur.parts.push(it);
      cur.y = (cur.y + it.y) / 2;
    } else {
      cur = { y: it.y, parts: [it] };
      lines.push(cur);
    }
  }
  return lines.map((l) => {
    const parts = l.parts.sort((a, b) => a.x - b.x);
    return {
      y: l.y,
      x: Math.min(...parts.map((p) => p.x)),
      size: Math.round(mode(parts.map((p) => p.fontSize)) * 10) / 10,
      bold: parts.some((p) => /bold|black|semibold|heavy/i.test(p.fontName)),
      text: parts.map((p) => p.text).join('').replace(/\s+/g, ' ').trim(),
    };
  }).filter((l) => l.text !== '');
}

/** Body font size = the size covering the most characters across the document. */
function bodySize(pages: Line[][]): number {
  const weight = new Map<number, number>();
  for (const lines of pages) for (const l of lines) {
    weight.set(l.size, (weight.get(l.size) ?? 0) + l.text.length);
  }
  return [...weight.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

/** Text patterns repeated near a page edge on ≥40% of pages (headers/footers/page numbers). */
function repeatedEdgeText(pages: Line[][]): Set<string> {
  const seen = new Map<string, number>();
  for (const lines of pages) {
    if (lines.length === 0) continue;
    const ys = lines.map((l) => l.y);
    const top = Math.max(...ys);
    const bot = Math.min(...ys);
    const margin = (top - bot) * 0.08;
    for (const l of lines) {
      if (l.y <= top - margin && l.y >= bot + margin) continue; // not near an edge
      const key = l.text.replace(/\d+/g, '#'); // normalise page numbers
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
  }
  const threshold = Math.max(2, pages.length * 0.4);
  return new Set([...seen.entries()].filter(([, n]) => n >= threshold).map(([k]) => k));
}

function isHeading(line: Line, body: number): boolean {
  if (line.size > body + 0.5) return true;
  if (line.bold && line.text.length <= 90) return true;
  // Short ALL-CAPS line with letters (catches uniform-font titles the prototype missed).
  if (line.text.length <= 60 && /[A-Z]/.test(line.text) && line.text === line.text.toUpperCase()) {
    return true;
  }
  return false;
}

function isListItem(line: Line): boolean {
  return BULLET.test(line.text) || NUMBERED.test(line.text);
}

/**
 * Infer a structured DocModel from per-page extracted text items.
 * @throws NoTextLayerError when no page yields any text (scanned/image PDF).
 */
export function inferDocModel(pagesItems: ExtractedTextItem[][]): DocModel {
  const pages = pagesItems.map(groupLines);
  if (pages.every((p) => p.length === 0)) throw new NoTextLayerError();

  const body = bodySize(pages);
  const repeated = repeatedEdgeText(pages);

  // Rank distinct heading sizes → heading levels (largest = H1).
  const headingSizes = [...new Set(
    pages.flat().filter((l) => l.size > body + 0.5).map((l) => l.size),
  )].sort((a, b) => b - a).slice(0, 6);

  const blocks: Block[] = [];
  pages.forEach((lines, pageIdx) => {
    const page = pageIdx + 1;
    let para: Extract<Block, { type: 'paragraph' }> | null = null;
    for (const line of lines) {
      if (repeated.has(line.text.replace(/\d+/g, '#'))) continue;

      if (isHeading(line, body)) {
        para = null;
        const idx = headingSizes.indexOf(line.size);
        const level = idx >= 0 ? idx + 1 : 1;
        blocks.push({ type: 'heading', level, text: line.text, page });
      } else if (isListItem(line)) {
        para = null;
        const text = line.text.replace(BULLET, '').replace(NUMBERED, '').trim();
        blocks.push({ type: 'listItem', text, page });
      } else if (para) {
        // Reflow wrapped line: fix end-of-line hyphenation, else join with a space.
        para.text = /[A-Za-z]-$/.test(para.text)
          ? para.text.slice(0, -1) + line.text
          : `${para.text} ${line.text}`;
      } else {
        para = { type: 'paragraph', text: line.text, page };
        blocks.push(para);
      }
    }
  });

  return { blocks };
}
