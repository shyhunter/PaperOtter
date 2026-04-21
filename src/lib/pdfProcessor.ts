// PDF processing engine — pdf-lib + Ghostscript sidecar for real image recompression.
// CRITICAL: Never use useCompression: true with pdf-lib (issue #1445 — corrupts output).
// For real compression, GS sidecar is invoked via invoke('compress_pdf').
import { readFile } from '@tauri-apps/plugin-fs';
import { PDFDocument, PageSizes, PDFName, PDFDict, PDFStream } from 'pdf-lib';
import { invoke } from '@tauri-apps/api/core';
import type { PdfProcessingOptions, PdfProcessingResult, PdfPagePreset, PdfQualityLevel } from '@/types/file';

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
        throw new Error('Custom page size requires both width and height in mm');
      }
      return [mmToPoints(widthMm), mmToPoints(heightMm)];
    }
  }
}

// Count image XObjects in the PDF using pdf-lib metadata.
// This is a best-effort scan — counts embedded XObject entries with Subtype=Image.
// Uses pdf-lib's type-safe lookupMaybe API to traverse the page resource dictionary.
async function scanPdfImages(pdfDoc: PDFDocument): Promise<{ imageCount: number; compressibilityScore: number }> {
  let imageCount = 0;
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
        // Each XObject entry is typically a PDFStream (possibly via a ref).
        // lookupMaybe(key) resolves refs and returns the object without type checking.
        // We get the Subtype from either PDFStream.dict or the PDFDict itself.
        const xObj = xObjectDict.lookup(key);
        if (!xObj) continue;

        // Extract the dict — PDFStream has .dict, PDFDict is its own dict
        let dict: PDFDict | undefined;
        if (xObj instanceof PDFStream) {
          dict = xObj.dict;
        } else if (xObj instanceof PDFDict) {
          dict = xObj;
        }
        if (!dict) continue;

        const subtype = dict.lookupMaybe(PDFName.of('Subtype'), PDFName);
        if (subtype?.toString() === '/Image') {
          imageCount++;
        }
      }
    } catch {
      // Non-critical: if traversal fails, skip page
    }
  }

  // compressibilityScore: images per page, saturating at 2 images/page → 1.0
  const imagesPerPage = pages.length > 0 ? imageCount / pages.length : 0;
  const compressibilityScore = Math.min(1.0, imagesPerPage / 2);

  return { imageCount, compressibilityScore };
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
 */
export function estimateOutputSizeBytes(
  quality: PdfQualityLevel,
  fileSizeBytes: number,
  compressibilityScore: number,
): number {
  const [high, low] = ESTIMATE_RATIOS[quality] ?? ESTIMATE_RATIOS.screen;
  // Linear interpolation: at score=1.0 use high ratio; at score=0.0 use low ratio
  const ratio = low + (high - low) * compressibilityScore;
  const estimate = Math.round(fileSizeBytes * ratio);
  return Math.max(estimate, 1024); // floor at 1 KB
}

export async function getPdfImageCount(sourcePath: string): Promise<number> {
  const bytes = await readFile(sourcePath);
  const pdfDoc = await PDFDocument.load(bytes);
  const { imageCount } = await scanPdfImages(pdfDoc);
  return imageCount;
}

export async function getPdfCompressibility(sourcePath: string): Promise<{ imageCount: number; compressibilityScore: number }> {
  const bytes = await readFile(sourcePath);
  const pdfDoc = await PDFDocument.load(bytes);
  return scanPdfImages(pdfDoc);
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
  const { imageCount, compressibilityScore } = await scanPdfImages(pdfDoc);

  // 4. Apply per-page resize if enabled
  if (options.resizeEnabled && options.selectedPageIndices.length > 0) {
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

  // 4b. Strip metadata if requested
  if (options.stripMetadata) {
    pdfDoc.setTitle('');
    pdfDoc.setAuthor('');
    pdfDoc.setSubject('');
    pdfDoc.setKeywords([]);
    pdfDoc.setCreator('');
    pdfDoc.setProducer('');
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
  };
}
