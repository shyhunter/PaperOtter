/**
 * Exposes the pdf.js-dependent libraries on `window`, so a Playwright spec can
 * drive them against a real document in a real browser.
 *
 * Nothing is mocked here on purpose. The whole reason this layer exists is that
 * every other layer mocks pdf.js — `MVP_BRIEF` §6 says it does not run under
 * vitest at all, `pdfTextSearch`'s own source says extraction "cannot be
 * exercised in tests", and 28 test files stub around it. A harness that stubbed
 * anything would reproduce the gap it was built to close.
 */
import * as pdfjsLib from 'pdfjs-dist';
import { findTextMatches } from '@/lib/pdfTextSearch';
import { extractPageText, extractAllPagesText, getPageDimensions } from '@/lib/pdfTextExtract';
import { applyRedactions } from '@/lib/pdfRedact';
import { matchToRect, type RedactionScope } from '@/lib/redactionScope';

// Same worker wiring the app uses. Without it pdf.js silently renders nothing,
// which is exactly the failure mode this layer is meant to make visible.
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

/**
 * Open a PDF from raw bytes.
 *
 * `.slice()` is not optional: pdf.js transfers the ArrayBuffer to its worker,
 * so the caller's copy is detached afterwards. A spec that opened the same
 * bytes twice would get an empty document the second time and no error saying
 * why — the exact trap recorded for `CompareStep` under React StrictMode.
 */
async function openPdf(bytes: number[]) {
  const data = new Uint8Array(bytes);
  return pdfjsLib.getDocument({ data: data.slice() }).promise;
}

/**
 * `findTextMatches` wants an open document; the extract functions want bytes
 * and open their own. The harness mirrors that split rather than papering over
 * it, so a spec exercises the API the app actually calls.
 */
async function searchBytes(bytes: number[], query: string) {
  const doc = await openPdf(bytes);
  return findTextMatches(doc, query);
}

const toBytes = (bytes: number[]) => new Uint8Array(bytes);

/**
 * Redact every occurrence of a word, through the path the tool itself uses.
 *
 * Search, then `matchToRect`, then `applyRedactions` — the app's own three
 * steps. A spec that built its own rectangles would be checking a conversion
 * nobody ships.
 */
async function redactBySearch(
  bytes: number[],
  query: string,
  scope: RedactionScope,
  color?: string,
) {
  const doc = await openPdf(bytes);
  const matches = await findTextMatches(doc, query);
  const rects = matches.map((m, i) => matchToRect(m, scope, `redaction-${i}`));
  const out = await applyRedactions(toBytes(bytes), rects, color);
  return { rects, bytes: Array.from(out) };
}

/**
 * Redact an explicit rectangle, with no search involved.
 *
 * The search path needs text; the pages where redaction costs the most are
 * scans and photographs, which have none. This is the same `applyRedactions`
 * with the rectangle supplied directly.
 */
async function redactRects(
  bytes: number[],
  rects: { pageIndex: number; x: number; y: number; width: number; height: number }[],
  color?: string,
) {
  const full = rects.map((r, i) => ({ ...r, id: `rect-${i}`, source: 'drawn' as const }));
  const out = await applyRedactions(toBytes(bytes), full, color);
  return Array.from(out);
}

/**
 * The colour of one point on a rendered page.
 *
 * "The text is gone from the text layer" and "the reader cannot see it" are two
 * different claims, and only the second is what a redaction promises. This
 * renders the output the way a viewer would and reads the pixel back.
 *
 * Coordinates are percentages of the rendered page with the origin at the top
 * left — the same frame `applyRedactions` paints its boxes in, and the one
 * pdf.js produces after applying the page's /Rotate.
 */
async function pixelAt(bytes: number[], pageIndex: number, xPercent: number, yPercent: number) {
  const doc = await openPdf(bytes);
  const page = await doc.getPage(pageIndex + 1);
  const viewport = page.getViewport({ scale: 2 });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  await page.render({ canvas, viewport }).promise;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2d context');
  const x = Math.min(canvas.width - 1, Math.max(0, Math.round((xPercent / 100) * canvas.width)));
  const y = Math.min(canvas.height - 1, Math.max(0, Math.round((yPercent / 100) * canvas.height)));
  const [r, g, b, a] = ctx.getImageData(x, y, 1, 1).data;
  return { r, g, b, a };
}

declare global {
  interface Window {
    __papercut: {
      openPdf: typeof openPdf;
      searchBytes: typeof searchBytes;
      extractPageText: (bytes: number[], pageIndex: number) => ReturnType<typeof extractPageText>;
      extractAllPagesText: (bytes: number[]) => ReturnType<typeof extractAllPagesText>;
      getPageDimensions: (bytes: number[], pageIndex: number) => ReturnType<typeof getPageDimensions>;
      redactBySearch: typeof redactBySearch;
      redactRects: typeof redactRects;
      pixelAt: typeof pixelAt;
      pdfjsVersion: string;
    };
  }
}

window.__papercut = {
  openPdf,
  searchBytes,
  extractPageText: (bytes, pageIndex) => extractPageText(toBytes(bytes), pageIndex),
  extractAllPagesText: (bytes) => extractAllPagesText(toBytes(bytes)),
  getPageDimensions: (bytes, pageIndex) => getPageDimensions(toBytes(bytes), pageIndex),
  redactBySearch,
  redactRects,
  pixelAt,
  pdfjsVersion: pdfjsLib.version,
};
