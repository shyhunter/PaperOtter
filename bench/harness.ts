// Repro harness: runs the app's REAL pdf render/extract modules against a large
// fixture in a real browser, with a main-thread heartbeat, so main-thread
// blocking can be observed directly instead of inferred.
import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument } from 'pdf-lib';
import {
  acquireSharedPdfDocument,
  releaseSharedPdfDocument,
  renderPdfPageThumbnail,
} from '@/lib/pdfThumbnail';
import { extractPageText } from '@/lib/pdfTextExtract';

const out = document.getElementById('out')!;
const lines: string[] = [];
type Ev = { t: number; msg: string };
const events: Ev[] = [];
function log(msg: string) {
  const e = { t: Math.round(performance.now()), msg };
  events.push(e);
  lines.push(`[${e.t}] ${msg}`);
  out.textContent = lines.join('\n');
  console.log(`[${e.t}] ${msg}`);
}
(window as any).__BENCH = { events, done: false, maxDrift: 0 };

// ── main-thread heartbeat ────────────────────────────────────────────
let last = performance.now();
let maxDrift = 0;
setInterval(() => {
  const now = performance.now();
  const drift = now - last - 100;
  last = now;
  if (drift > maxDrift) {
    maxDrift = drift;
    (window as any).__BENCH.maxDrift = Math.round(maxDrift);
  }
  if (drift > 250) log(`!! MAIN THREAD BLOCKED ${Math.round(drift)}ms`);
}, 100);

const FIXTURE = new URLSearchParams(location.search).get('f') || '/large_stress.pdf';

async function phase<T>(name: string, fn: () => Promise<T>): Promise<T> {
  log(`> ${name}`);
  const t0 = performance.now();
  try {
    const r = await fn();
    log(`< ${name} OK ${Math.round(performance.now() - t0)}ms`);
    return r;
  } catch (err) {
    log(`< ${name} THREW ${Math.round(performance.now() - t0)}ms ${err}`);
    throw err;
  }
}

async function main() {
  log(`fixture=${FIXTURE}`);
  const buf = await phase('fetch fixture', async () =>
    new Uint8Array(await (await fetch(FIXTURE)).arrayBuffer()));
  log(`bytes=${(buf.byteLength / 1048576).toFixed(1)}MB`);

  // Does pdf.js actually get a real worker here, or silently fall back to
  // parsing on the main thread?
  await phase('pdf.js worker probe', async () => {
    const w = new pdfjsLib.PDFWorker({ name: 'probe' });
    await w.promise;
    log(`   workerSrc=${pdfjsLib.GlobalWorkerOptions.workerSrc}`);
    log(`   REAL WORKER = ${(w as any).port != null}`);
    w.destroy();
  });

  // EditorView.tsx:114 — pdf-lib load just to get the page count, on every open.
  await phase('pdf-lib PDFDocument.load (page count)', async () => {
    const d = await PDFDocument.load(buf, { ignoreEncryption: true });
    log(`   pageCount=${d.getPageCount()}`);
  });

  // The editor's steady-state concurrency: main canvas renders currentPage±3,
  // TextEditingLayer extracts text for each visible page, page panel renders
  // thumbnails — all at once, all against the same bytes.
  await phase('editor open burst (4 canvas + 4 text + 8 thumbs)', async () => {
    const jobs: Promise<unknown>[] = [];
    for (let i = 0; i < 4; i++) jobs.push(renderCanvasPage(buf, i));
    for (let i = 0; i < 4; i++) jobs.push(extractPageText(buf, i));
    for (let i = 0; i < 8; i++) jobs.push(renderPdfPageThumbnail(buf, i, 0.2));
    await Promise.all(jobs);
  });

  // Everything above released the shared doc. This is the "click a tool" case:
  // a fresh acquire with an empty cache.
  await phase('tool panel open (before thumb, cold cache)', () =>
    renderPdfPageThumbnail(buf, 0, 0.5));
  await phase('tool option change (after thumb, cold cache again)', () =>
    renderPdfPageThumbnail(buf, 0, 0.5));

  // Scrolling: the virtualization window slides, acquiring/releasing each step.
  await phase('scroll 10 pages (acquire/release churn)', async () => {
    for (let p = 4; p < 14; p++) {
      await Promise.all([renderCanvasPage(buf, p), extractPageText(buf, p)]);
    }
  });

  log(`MAX MAIN-THREAD BLOCK = ${Math.round(maxDrift)}ms`);
  (window as any).__BENCH.done = true;
  log('DONE');
}

// Mirrors EditorCanvas's PageCanvasRenderer effect.
async function renderCanvasPage(bytes: Uint8Array, idx: number) {
  const doc = await acquireSharedPdfDocument(bytes);
  try {
    const page = await doc.getPage(idx + 1);
    const viewport = page.getViewport({ scale: 1 });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvas, viewport }).promise;
  } finally {
    releaseSharedPdfDocument(bytes);
  }
}

main().catch((e) => {
  log(`FATAL ${e}`);
  (window as any).__BENCH.done = true;
});
