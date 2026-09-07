// PDF processing engine — pdf-lib + Ghostscript sidecar for real image recompression.
// CRITICAL: Never use useCompression: true with pdf-lib (issue #1445 — corrupts output).
// For real compression, GS sidecar is invoked via invoke('compress_pdf').
import { readFile } from '@tauri-apps/plugin-fs';
import { PDFDocument, PageSizes, PDFName, PDFDict, PDFStream, PDFArray, PDFRef } from 'pdf-lib';
import { invoke } from '@tauri-apps/api/core';
import type { PdfProcessingOptions, PdfProcessingResult, PdfPagePreset, PdfQualityLevel } from '@/types/file';
import { plural, t } from '@/i18n';

// Quality level → Ghostscript -dPDFSETTINGS preset mapping.
// These are GS native preset names — must match the compress_pdf allow-list in Rust.
const QUALITY_TO_GS_PRESET: Record<PdfQualityLevel, string> = {
  web:     'screen',    // 72 dpi — smallest output
  screen:  'ebook',     // 150 dpi — balanced
  print:   'printer',   // 300 dpi — high quality
  archive: 'prepress',  // lossless — archival
  custom:  'screen',    // placeholder — custom must be resolved to a real preset before processing
};

// Cascade order: from least-aggressive (highest quality) to most-aggressive (smallest output).
// When a target size is set, processPdf tries presets starting from the recommended one,
// cascading toward 'web' until the target is met or all presets are exhausted.
const QUALITY_CASCADE: PdfQualityLevel[] = ['archive', 'print', 'screen', 'web'];

// Above this share of image bytes being JPXDecode (JPEG2000), Ghostscript's compression
// presets are treated as unable to help — GS doesn't meaningfully re-encode JPX images.
const JPX_BYTE_SHARE_THRESHOLD = 0.9;

// NOTE: no absolute file-size floor here (e.g. "under 50 KB"). GS's own output overhead
// is real, but it's already handled reactively by the bloat guard below (processedBytes
// reverts to the original when GS's output is larger) — an upfront predictive threshold
// isn't needed on top of that, and picking one without solid data on real GS overhead
// risks being wrong in both directions (blocking small files that would still compress,
// or missing larger files that still don't).

/**
 * Whether compression is predictably futile for this file, based on the pre-scan alone —
 * used to disable the compression UI and to skip Ghostscript entirely rather than making
 * the user wait through a pass we already know won't help.
 */
export function isPredictablyNonCompressible(
  compressibilityScore: number,
  jpxByteShare: number,
): boolean {
  return compressibilityScore < 0.1 || jpxByteShare > JPX_BYTE_SHARE_THRESHOLD;
}

export type NonCompressibleReason = 'text-only' | 'jpx' | null;

/** Which specific reason (if any) compression is predictably futile — drives the UI message. */
export function getNonCompressibleReason(
  compressibilityScore: number,
  jpxByteShare: number,
): NonCompressibleReason {
  if (compressibilityScore < 0.1) return 'text-only';
  if (jpxByteShare > JPX_BYTE_SHARE_THRESHOLD) return 'jpx';
  return null;
}

/**
 * The single canonical explanation for a NonCompressibleReason — reused verbatim by
 * ConfigureStep and CompareStep so the same file never shows differently-worded
 * explanations of the same fact in different places.
 */
export function nonCompressibleMessage(reason: NonCompressibleReason, imageCount: number): string | null {
  switch (reason) {
    case 'text-only':
      return t('pdfProcessor.thisFileIsMostlyText');
    case 'jpx':
      return t('pdfProcessor.jpxAlreadyEncoded', { images: plural('count.image', imageCount) });
    case null:
      return null;
  }
}

// Estimate ratios at [score=1.0, score=0.0] for each quality level.
// Ratios represent expected output / input size based on GS preset typical behaviour.
// score=1.0 = fully image-heavy (maximum compressibility)
// score=0.0 = text-only (minimal compressibility)
const ESTIMATE_RATIOS: Record<PdfQualityLevel, [high: number, low: number]> = {
  web:     [0.15, 0.92],
  screen:  [0.32, 0.93],
  print:   [0.68, 0.95],
  archive: [0.97, 0.99],
  custom:  [0.32, 0.93], // mirrors screen as a fallback
};

// PDF points per mm: 1 pt = 1/72 inch = 0.3528 mm
function mmToPoints(mm: number): number {
  return (mm / 25.4) * 72;
}

function getTargetPageSize(preset: PdfPagePreset, widthMm: number | null, heightMm: number | null): [number, number] {
  switch (preset) {
    case 'A4':     return PageSizes.A4;      // [595.28, 841.89]
    case 'A3':     return PageSizes.A3;      // [841.89, 1190.55]
    case 'Letter': return PageSizes.Letter;  // [612, 792]
    case 'custom': {
      if (widthMm == null || heightMm == null) {
        throw new Error(t('pdfProcessor.customPageSizeRequiresBoth'));
      }
      return [mmToPoints(widthMm), mmToPoints(heightMm)];
    }
  }
}

// Count image XObjects in the PDF using pdf-lib metadata.
// This is a best-effort scan — counts embedded XObject entries with Subtype=Image.
// Uses pdf-lib's type-safe lookupMaybe API to traverse the page resource dictionary.
async function scanPdfImages(
  pdfDoc: PDFDocument,
): Promise<{ imageCount: number; compressibilityScore: number; jpxByteShare: number }> {
  let imageCount = 0;
  let totalImageBytes = 0;
  let jpxImageBytes = 0;
  // Same image XObject (e.g. a repeated header/logo) is often referenced by every
  // page via the same indirect object — count it once, not once per page, or a
  // large shared non-JPX image can dilute jpxByteShare far below the real figure.
  const seenImageRefs = new Set<string>();
  const pages = pdfDoc.getPages();

  for (const page of pages) {
    try {
      // page.node is a PDFPageLeaf (extends PDFDict); Resources() resolves ref if needed
      const resources = page.node.Resources();
      if (!resources) continue;

      // XObject dict may be a direct dict or a ref — lookupMaybe resolves either
      const xObjectDict = resources.lookupMaybe(PDFName.of('XObject'), PDFDict);
      if (!xObjectDict) continue;

      for (const key of xObjectDict.keys()) {
        // get() (unresolved) lets us dedupe by indirect reference before resolving.
        const rawEntry = xObjectDict.get(key);
        if (rawEntry instanceof PDFRef) {
          if (seenImageRefs.has(rawEntry.tag)) continue;
          seenImageRefs.add(rawEntry.tag);
        }

        // Each XObject entry is typically a PDFStream (possibly via a ref).
        // lookupMaybe(key) resolves refs and returns the object without type checking.
        // We get the Subtype from either PDFStream.dict or the PDFDict itself.
        const xObj = xObjectDict.lookup(key);
        if (!xObj) continue;

        // Extract the dict — PDFStream has .dict, PDFDict is its own dict
        let dict: PDFDict | undefined;
        let contentSize = 0;
        if (xObj instanceof PDFStream) {
          dict = xObj.dict;
          try { contentSize = xObj.getContentsSize(); } catch { contentSize = 0; }
        } else if (xObj instanceof PDFDict) {
          dict = xObj;
        }
        if (!dict) continue;

        const subtype = dict.lookupMaybe(PDFName.of('Subtype'), PDFName);
        if (subtype?.toString() === '/Image') {
          imageCount++;
          totalImageBytes += contentSize;

          // Filter may be a single Name or an Array of Names (chained filters).
          // JPXDecode (JPEG2000) is not meaningfully re-encoded by Ghostscript's
          // pdfwrite compression presets — track its share of image bytes so the
          // UI can explain a "0% smaller" result accurately instead of just
          // "already optimal", based on how much of the content it actually is
          // (not just whether any JPX image exists at all).
          const filter = dict.lookup(PDFName.of('Filter'));
          const filterNames: string[] = [];
          if (filter instanceof PDFName) {
            filterNames.push(filter.toString());
          } else if (filter instanceof PDFArray) {
            for (let i = 0; i < filter.size(); i++) {
              const f = filter.lookup(i);
              if (f instanceof PDFName) filterNames.push(f.toString());
            }
          }
          if (filterNames.includes('/JPXDecode')) {
            jpxImageBytes += contentSize;
          }
        }
      }
    } catch {
      // Non-critical: if traversal fails, skip page
    }
  }

  // compressibilityScore: images per page, saturating at 2 images/page → 1.0
  const imagesPerPage = pages.length > 0 ? imageCount / pages.length : 0;
  const compressibilityScore = Math.min(1.0, imagesPerPage / 2);
  const jpxByteShare = totalImageBytes > 0 ? jpxImageBytes / totalImageBytes : 0;

  return { imageCount, compressibilityScore, jpxByteShare };
}

// Given a target size (bytes), input size (bytes), and estimated compressibility,
// return the recommended quality level most likely to hit the target.
// This recommendation is a hint only — user can always override.
export function recommendQualityForTarget(
  targetBytes: number,
  inputBytes: number,
  compressibilityScore: number,
): PdfQualityLevel {
  if (inputBytes <= 0 || compressibilityScore < 0.1) {
    // Text-only PDF: not very compressible regardless of setting
    return 'screen';
  }
  const ratio = targetBytes / inputBytes;
  // Thresholds are conservative estimates based on GS preset typical ratios:
  // screen (~72dpi):  ~0.1–0.25 of original for photo-heavy PDFs
  // ebook (~150dpi):  ~0.25–0.5 of original
  // printer (~300dpi): ~0.5–0.8 of original
  // prepress (lossless): ~0.9–1.0 of original
  if (ratio < 0.25) return 'web';
  if (ratio < 0.5)  return 'screen';
  if (ratio < 0.8)  return 'print';
  return 'archive';
}

/**
 * Estimate the output size (in bytes) for a given quality level, based on the file's
 * compressibility score. Uses linear interpolation between the high-compressibility
 * and low-compressibility ratios from ESTIMATE_RATIOS.
 * Result is floored at 1 KB to avoid unrealistic sub-kilobyte estimates.
 *
 * jpxByteShare (0–1, optional) diminishes the effective compressibility score —
 * JPX-encoded image bytes don't actually shrink under Ghostscript's presets, so a
 * JPX-heavy PDF shouldn't get the same optimistic estimate as a JPEG-heavy one just
 * because both have a high image-per-page count.
 */
export function estimateOutputSizeBytes(
  quality: PdfQualityLevel,
  fileSizeBytes: number,
  compressibilityScore: number,
  jpxByteShare = 0,
): number {
  const effectiveScore = compressibilityScore * (1 - jpxByteShare);
  const [high, low] = ESTIMATE_RATIOS[quality] ?? ESTIMATE_RATIOS.screen;
  // Linear interpolation: at score=1.0 use high ratio; at score=0.0 use low ratio
  const ratio = low + (high - low) * effectiveScore;
  const estimate = Math.round(fileSizeBytes * ratio);
  return Math.max(estimate, 1024); // floor at 1 KB
}

export async function getPdfImageCount(sourcePath: string): Promise<number> {
  const bytes = await readFile(sourcePath);
  const pdfDoc = await PDFDocument.load(bytes);
  const { imageCount } = await scanPdfImages(pdfDoc);
  return imageCount;
}

/**
 * Loads and scans a PDF once for everything the Configure step needs: page count,
 * file size, and compressibility. Previously the caller (App.tsx) separately loaded
 * and parsed the same file again just for page count/size — for a large PDF with a
 * complex xref table, parsing it twice noticeably slowed the Pick→Configure transition.
 */
export interface PdfCompressibility {
  pageCount: number;
  fileSizeBytes: number;
  imageCount: number;
  compressibilityScore: number;
  jpxByteShare: number;
}

/**
 * Same analysis as getPdfCompressibility, for bytes already in memory.
 *
 * The PDF editor works on bytes that may differ from anything on disk -- other
 * tools may have already been applied -- so it cannot go through the path.
 */
export async function getPdfCompressibilityFromBytes(
  bytes: Uint8Array,
): Promise<PdfCompressibility> {
  const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const scan = await scanPdfImages(pdfDoc);
  return {
    pageCount: pdfDoc.getPageCount(),
    fileSizeBytes: bytes.byteLength,
    ...scan,
  };
}

export async function getPdfCompressibility(sourcePath: string): Promise<PdfCompressibility> {
  return getPdfCompressibilityFromBytes(await readFile(sourcePath));
}

/** What resizePagesInDocument needs, which is the resize half of the options. */
export interface PageResizeOptions {
  pagePreset: PdfPagePreset;
  customWidthMm: number | null;
  customHeightMm: number | null;
  /** Zero-based indices to resize. An empty list resizes nothing. */
  selectedPageIndices: number[];
  onProgress?: (current: number, total: number) => void;
}

/**
 * Resizes pages in place, scaling their content to fit and centring it.
 *
 * Shared rather than inlined in processPdf, because the editor's compress panel
 * needs the same thing from bytes it already holds. It had no resize at all --
 * the standalone tool's page-size controls simply were not there -- and a second
 * implementation of scale-to-fit is how the preview and the output come to
 * disagree about what a page looks like.
 *
 * Mutates the document rather than returning bytes: processPdf has one loaded
 * already and goes on to use it, and a round trip through save/load for every
 * resize would cost the larger documents the most.
 */
export function resizePagesInDocument(pdfDoc: PDFDocument, options: PageResizeOptions): void {
  const [targetW, targetH] = getTargetPageSize(
    options.pagePreset,
    options.customWidthMm,
    options.customHeightMm,
  );
  const pages = pdfDoc.getPages();
  const indices = options.selectedPageIndices;

  for (let i = 0; i < indices.length; i++) {
    const idx = indices[i];
    if (idx < 0 || idx >= pages.length) continue;

    const page = pages[idx];
    const { width: origW, height: origH } = page.getSize();

    // Scale-to-fit: uniform scale preserving aspect ratio, always fully visible
    const scale = Math.min(targetW / origW, targetH / origH);

    // Order matters: setSize first, then scale, then translate.
    // translateContent offset is relative to new page dimensions.
    page.setSize(targetW, targetH);
    page.scaleContent(scale, scale);

    // Center the scaled content within the new page
    const xOffset = (targetW - origW * scale) / 2;
    const yOffset = (targetH - origH * scale) / 2;
    page.translateContent(xOffset, yOffset);

    // Report progress after each page resize
    options.onProgress?.(i + 1, indices.length);
  }
}

export async function processPdf(
  sourcePath: string,
  options: PdfProcessingOptions,
): Promise<PdfProcessingResult> {
  // 1. Read source bytes from disk
  const sourceBytes = await readFile(sourcePath);
  const inputSizeBytes = sourceBytes.byteLength;

  // 2. Load into pdf-lib
  const pdfDoc = await PDFDocument.load(sourceBytes);
  const pageCount = pdfDoc.getPageCount();

  // 3. Pre-scan: count image XObjects to populate compressibility metadata
  const { imageCount, compressibilityScore, jpxByteShare } = await scanPdfImages(pdfDoc);

  // 4. Apply per-page resize if enabled
  if (options.resizeEnabled && options.selectedPageIndices.length > 0) {
    resizePagesInDocument(pdfDoc, options);
  }


  // 5. Produce output bytes — GS for real compression, or structural re-save only
  let processedBytes: Uint8Array;
  let wasAlreadyOptimal = false;

  if (options.compressionEnabled) {
    // Custom must be resolved to a real preset by the UI before reaching the processor
    if (options.qualityLevel === 'custom') {
      throw new Error('Custom quality must be resolved to a preset before processing');
    }

    // Run pdf-lib resize first (if enabled) — GS must receive the post-resize bytes.
    // IMPORTANT: passing sourceBytes to GS when resize is enabled would silently discard the resize.
    const pdfLibBytes: Uint8Array = options.resizeEnabled
      ? await pdfDoc.save({ useObjectStreams: false }) // save post-resize state
      : sourceBytes; // no resize — pass original bytes to GS directly

    if (isPredictablyNonCompressible(compressibilityScore, jpxByteShare)) {
      // The pre-scan already tells us Ghostscript can't help here (text-only, JPX-dominated,
      // or too small for GS's own overhead to be worth it) — skip the slow GS pass entirely
      // rather than making the user wait for a result we can already predict.
      processedBytes = pdfLibBytes;
      wasAlreadyOptimal = true;
    } else {
      // Build temp paths using @tauri-apps/api/path join() to avoid separator bugs.
      const { tempDir } = await import('@tauri-apps/api/path');
      const tmpBase = await tempDir(); // e.g. "/var/folders/.../T/"
      const ts = Date.now();
      const { join } = await import('@tauri-apps/api/path');
      const tempInputPath = await join(tmpBase, `papercut_gs_input_${ts}.pdf`);

      // Write post-resize bytes to temp path (NOT sourceBytes — resizeEnabled may have changed them)
      // NOTE: fs:allow-write-file scoped to $TEMP/** is in capabilities/default.json (added in Plan 01 Task 1)
      await import('@tauri-apps/plugin-fs').then(m => m.writeFile(tempInputPath, pdfLibBytes));

      if (options.targetSizeBytes != null) {
        // CASCADE MODE: when a target size is set, try presets from the recommended one
        // down to 'web' (most aggressive), stopping as soon as the target is met.
        // This fixes the "already optimal" false positive where a single preset bloated
        // the file but more aggressive presets could still achieve the target.
        const startIdx = QUALITY_CASCADE.indexOf(options.qualityLevel);
        const presetsToTry = startIdx >= 0 ? QUALITY_CASCADE.slice(startIdx) : QUALITY_CASCADE;

        let bestBytes: Uint8Array | null = null;
        let bestSize = Infinity;

        for (const level of presetsToTry) {
          const levelPreset = QUALITY_TO_GS_PRESET[level];
          const gsResult: ArrayBuffer = await invoke('compress_pdf', {
            sourcePath: tempInputPath,
            preset: levelPreset,
          });
          const gsBytes = new Uint8Array(gsResult);

          // Skip bloated results — GS added more than it compressed (e.g. ICC profile overhead)
          if (gsBytes.byteLength > pdfLibBytes.byteLength) continue;

          // Track the best (smallest non-bloating) result
          if (gsBytes.byteLength < bestSize) {
            bestBytes = gsBytes;
            bestSize = gsBytes.byteLength;
          }

          // Stop early if this preset already meets the target
          if (gsBytes.byteLength <= options.targetSizeBytes) break;
        }

        // Clean up temp input file
        await import('@tauri-apps/plugin-fs').then(m => m.remove(tempInputPath).catch(() => {}));

        if (bestBytes !== null) {
          processedBytes = bestBytes;
        } else {
          // All presets bloated the file — revert to pdfLibBytes
          processedBytes = pdfLibBytes;
          wasAlreadyOptimal = true;
        }
      } else {
        // SINGLE PRESET MODE: no target set, run once with the specified quality level.
        // No cascade — user explicitly chose a quality and just wants it applied.
        const preset = QUALITY_TO_GS_PRESET[options.qualityLevel];
        const gsResult: ArrayBuffer = await invoke('compress_pdf', {
          sourcePath: tempInputPath,
          preset,
        });

        processedBytes = new Uint8Array(gsResult);

        // Clean up temp input file (ignore errors — OS will clean eventually)
        // NOTE: fs:allow-remove scoped to $TEMP/** is in capabilities/default.json (added in Plan 01 Task 1)
        await import('@tauri-apps/plugin-fs').then(m =>
          m.remove(tempInputPath).catch(() => {})
        );

        // GS bloat guard: if GS produced a larger file than the bytes it received, revert.
        // This happens for text-only PDFs — GS adds ICC profiles and overhead with no image data to compress.
        if (processedBytes.byteLength > pdfLibBytes.byteLength) {
          processedBytes = pdfLibBytes; // pdfLibBytes = post-resize bytes (or sourceBytes when no resize)
          wasAlreadyOptimal = true;
        }
      }
    }
  } else {
    // Structural re-save only (no GS) — pdf-lib useObjectStreams
    // useCompression is NEVER used (pdf-lib bug #1445 — corrupts output)
    processedBytes = await pdfDoc.save({ useObjectStreams: true });
  }

  const outputSizeBytes = processedBytes.byteLength;

  // 7. Evaluate target size constraint
  let targetMet = true;
  let bestAchievableSizeBytes: number | null = null;

  if (options.compressionEnabled && options.targetSizeBytes != null) {
    // When already optimal, compare against the actual output (= original size), not GS inflation
    if (outputSizeBytes > options.targetSizeBytes) {
      targetMet = false;
      bestAchievableSizeBytes = outputSizeBytes; // = inputSizeBytes when wasAlreadyOptimal
    }
  }

  // Capture first page dimensions (in PDF points) for display in CompareStep
  const pages = pdfDoc.getPages();
  const outputPageDimensions = pages.length > 0
    ? pages[0].getSize()  // { width: number; height: number } in points
    : null;

  return {
    bytes: processedBytes,
    sourceBytes,          // original bytes — used by CompareStep for Before preview
    outputSizeBytes,
    inputSizeBytes,
    pageCount,
    outputPageDimensions: outputPageDimensions
      ? { widthPt: outputPageDimensions.width, heightPt: outputPageDimensions.height }
      : null,
    targetMet,
    bestAchievableSizeBytes,
    wasAlreadyOptimal,
    imageCount,
    compressibilityScore,
    jpxByteShare,
  };
}
