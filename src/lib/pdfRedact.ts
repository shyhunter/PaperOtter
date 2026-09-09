// pdfRedact.ts: True permanent redaction via render-to-image approach.
//
// TRADEOFF: Pages with redactions are flattened to images — text on those pages
// becomes non-selectable. This is the CORRECT behavior for a redaction tool:
// security over convenience. Non-redacted pages pass through unchanged with
// selectable text preserved.
//
// Process:
// 1. Group redactions by page
// 2. Non-redacted pages: copy as-is (preserves text selectability)
// 3. Redacted pages: render to canvas → draw redaction rects → export as PNG → embed
import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument } from 'pdf-lib';
import type { RedactionRect } from '@/components/redact-pdf/RedactOverlay';
import { normaliseHex } from '@/lib/colorPresets';

/** What redactions were before they could be any other colour. */
export const DEFAULT_REDACTION_COLOR = '#000000';

/**
 * The colour a redaction box is actually painted with.
 *
 * Never passes a caller's string to `fillStyle` directly: canvas accepts
 * `transparent` and `rgba(0,0,0,0)`, and a box painted with either leaves the
 * content it was meant to cover fully visible in the rasterised page -- the
 * redaction would look applied and not be.
 */
export function resolveRedactionFill(color: string | undefined): string {
  return normaliseHex(color ?? DEFAULT_REDACTION_COLOR);
}

/**
 * The most pixels one redacted page is ever rasterised to.
 *
 * Twelve million is chosen so that no ordinary page is touched at all: A4 at 2x
 * is 2.0 MP and A2 is 8.0 MP, both comfortably under. Only A1 and larger — the
 * poster-sized pages that produced 68-megapixel renders and 28 MB of PNG for a
 * single page — are scaled down, and those are exactly the pages where 2x was
 * never a sensible thing to ask for.
 *
 * The cap is on area rather than on either edge, because it is area that decides
 * the cost: the encode, pdf-lib's parse of the PNG, the bytes written into the
 * output, and the memory all scale with it.
 */
export const MAX_RASTER_MEGAPIXELS = 12;

/**
 * The scale to rasterise at: the one asked for, or as much of it as the budget
 * allows.
 *
 * Never scales *up* — a small page is not improved by being asked for more
 * pixels than the caller wanted.
 */
export function rasterScale(
  unscaledWidth: number,
  unscaledHeight: number,
  desired = 2.0,
): number {
  const area = unscaledWidth * unscaledHeight * desired * desired;
  const budget = MAX_RASTER_MEGAPIXELS * 1_000_000;
  if (area <= budget) return desired;
  return desired * Math.sqrt(budget / area);
}

/**
 * What the output document is made of, one entry per page.
 *
 * The split this type creates is the point of it: deciding *what* each page
 * becomes needs a canvas and pdf.js, while actually building the document needs
 * only pdf-lib. Naming the boundary lets the second half run somewhere other
 * than the thread the window is drawn on.
 */
export type PagePlan =
  | { kind: 'copy'; index: number }
  | { kind: 'raster'; index: number; png: Uint8Array; width: number; height: number };

/**
 * Build the output document from a plan. Pure pdf-lib — no DOM, no canvas.
 *
 * Deliberately free of anything browser-shaped so it can run in a worker, which
 * is where it does run: `embedPng` parsing a large PNG and `save` serialising it
 * were together a 2.5-second task with nothing else able to happen, and no API
 * choice fixes that because both are single synchronous calls inside pdf-lib.
 * Moving them is the only option, so this is the piece that moves.
 */
export async function assembleRedacted(
  sourceBytes: Uint8Array,
  plan: PagePlan[],
): Promise<Uint8Array> {
  const sourceDoc = await PDFDocument.load(sourceBytes, { ignoreEncryption: true });
  const outputDoc = await PDFDocument.create();

  for (const entry of plan) {
    if (entry.kind === 'copy') {
      // Copied rather than rasterised, so its text stays selectable. Only the
      // pages someone actually marked lose theirs.
      const [copied] = await outputDoc.copyPages(sourceDoc, [entry.index]);
      outputDoc.addPage(copied);
    } else {
      const image = await outputDoc.embedPng(entry.png);
      const page = outputDoc.addPage([entry.width, entry.height]);
      page.drawImage(image, { x: 0, y: 0, width: entry.width, height: entry.height });
    }
  }

  return new Uint8Array(await outputDoc.save({ useObjectStreams: false }));
}

/**
 * Run the assembly off the main thread when there is one to run it on.
 *
 * Falls back to running it here when `Worker` does not exist — under vitest, and
 * on any engine without workers. The fallback is the same function, so the
 * output is identical either way and only the freeze differs; a fallback that
 * did something *different* would be a second implementation to keep honest.
 */
async function assembleOffThread(
  sourceBytes: Uint8Array,
  plan: PagePlan[],
): Promise<Uint8Array> {
  if (typeof Worker === 'undefined') return assembleRedacted(sourceBytes, plan);

  const worker = new Worker(new URL('./pdfRedactAssembly.worker.ts', import.meta.url), {
    type: 'module',
  });

  try {
    return await new Promise<Uint8Array>((resolve, reject) => {
      worker.onmessage = (event: MessageEvent<{ ok: true; bytes: ArrayBuffer } | { ok: false; error: string }>) => {
        const data = event.data;
        if (data.ok) resolve(new Uint8Array(data.bytes));
        else reject(new Error(data.error));
      };
      worker.onerror = (event) => reject(new Error(event.message || 'Redaction worker failed'));

      // The rasters are ours and are large, so they are transferred rather than
      // copied. The source bytes belong to the caller and are cloned.
      const transfer = plan
        .filter((e): e is Extract<PagePlan, { kind: 'raster' }> => e.kind === 'raster')
        .map((e) => e.png.buffer as ArrayBuffer);
      worker.postMessage({ sourceBytes, plan }, transfer);
    });
  } finally {
    worker.terminate();
  }
}

/**
 * Apply permanent redactions to a PDF.
 * Returns new PDF bytes with redacted content permanently removed.
 */
export async function applyRedactions(
  pdfBytes: Uint8Array,
  redactions: RedactionRect[],
  color?: string,
): Promise<Uint8Array> {
  const fill = resolveRedactionFill(color);

  if (redactions.length === 0) {
    return pdfBytes;
  }

  // Group redactions by page
  const redactionsByPage = new Map<number, RedactionRect[]>();
  for (const r of redactions) {
    const existing = redactionsByPage.get(r.pageIndex) ?? [];
    existing.push(r);
    redactionsByPage.set(r.pageIndex, existing);
  }

  // pdf.js only: the source is no longer opened with pdf-lib here, because the
  // pdf-lib half of the work now happens in a worker.
  const pdfJsDoc = await pdfjsLib.getDocument({ data: pdfBytes.slice() }).promise;
  const pageCount = pdfJsDoc.numPages;

  try {
    const plan: PagePlan[] = [];

    for (let i = 0; i < pageCount; i++) {
      const pageRedactions = redactionsByPage.get(i);

      if (!pageRedactions || pageRedactions.length === 0) {
        // No redactions on this page — copy as-is, which preserves its text.
        plan.push({ kind: 'copy', index: i });
        continue;
      }

      // Page has redactions — render to an image, which is what makes the
      // redaction permanent rather than cosmetic.
      const page = await pdfJsDoc.getPage(i + 1); // pdfjs is 1-based
      // 2x where the page is a normal size, less where it is enormous. The
      // page's own dimensions come from an unscaled viewport, so /Rotate is
      // already applied and a turned page is budgeted by what the reader
      // actually sees.
      const unscaled = page.getViewport({ scale: 1 });
      const renderScale = rasterScale(unscaled.width, unscaled.height);
      const viewport = page.getViewport({ scale: renderScale });

      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;

      await page.render({ canvas, viewport }).promise;

      // Draw the redaction boxes over the rendered page. The content beneath
      // is gone either way -- this page is being replaced by a flat image --
      // so the colour is what the reader sees, not what protects them.
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = fill;
        for (const rect of pageRedactions) {
          const x = (rect.x / 100) * canvas.width;
          const y = (rect.y / 100) * canvas.height;
          const w = (rect.width / 100) * canvas.width;
          const h = (rect.height / 100) * canvas.height;
          ctx.fillRect(x, y, w, h);
        }
      }

      // Export the canvas as PNG bytes without ever building a base64 string.
      //
      // `toDataURL` encodes on the main thread and cannot yield, and the base64
      // it returns then has to be decoded a character at a time -- together one
      // 2,251ms task on a large page, per page, with the window painting
      // nothing. `toBlob` hands the encode to the browser's own thread and
      // `arrayBuffer()` skips base64 entirely, at zero measured blocking.
      const pngBlob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/png'),
      );
      // Loudly, not quietly: a redaction that half-worked is worse than one that
      // failed, because the page would be embedded without its cover.
      if (!pngBlob) throw new Error('Canvas to blob failed');
      const png = new Uint8Array(await pngBlob.arrayBuffer());

      // The size the reader sees, taken from the viewport rather than from
      // getSize(). pdf.js has already applied the page's /Rotate here, so on a
      // turned page the render is landscape while getSize() still reports the
      // portrait box underneath -- and the replacement page carries no /Rotate
      // of its own, so building it at the raw size squashed a landscape image
      // into a portrait sheet and turned the content with it.
      plan.push({
        kind: 'raster',
        index: i,
        png,
        width: viewport.width / renderScale,
        height: viewport.height / renderScale,
      });

      // Let the window paint between pages. Without it a multi-page redaction
      // is one unbroken run of renders and the UI cannot show progress even
      // though it knows it.
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    return await assembleOffThread(pdfBytes, plan);
  } finally {
    pdfJsDoc.destroy();
  }
}
