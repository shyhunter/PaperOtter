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

declare global {
  interface Window {
    __papercut: {
      openPdf: typeof openPdf;
      searchBytes: typeof searchBytes;
      extractPageText: (bytes: number[], pageIndex: number) => ReturnType<typeof extractPageText>;
      extractAllPagesText: (bytes: number[]) => ReturnType<typeof extractAllPagesText>;
      getPageDimensions: (bytes: number[], pageIndex: number) => ReturnType<typeof getPageDimensions>;
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
  pdfjsVersion: pdfjsLib.version,
};
