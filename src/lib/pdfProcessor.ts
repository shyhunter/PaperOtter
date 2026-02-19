// PDF processing engine — pdf-lib only.
// CRITICAL: Never use useCompression: true (pdf-lib issue #1445 — corrupts output).
// Structural packing only via useObjectStreams: true.
import { readFile } from '@tauri-apps/plugin-fs';
import { PDFDocument, PageSizes } from 'pdf-lib';
import type { PdfProcessingOptions, PdfProcessingResult, PdfPagePreset } from '@/types/file';

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

  // 3. Apply per-page resize if enabled
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

  // 4. Structural re-save — the only viable "compression" in pdf-lib.
  // useObjectStreams packs cross-reference tables. useCompression is NEVER used (bug #1445).
  const processedBytes = await pdfDoc.save({ useObjectStreams: true });
  const outputSizeBytes = processedBytes.byteLength;

  // 5. Evaluate target size constraint
  let targetMet = true;
  let bestAchievableSizeBytes: number | null = null;

  if (options.compressionEnabled && options.targetSizeBytes != null) {
    if (outputSizeBytes > options.targetSizeBytes) {
      targetMet = false;
      bestAchievableSizeBytes = outputSizeBytes;
    }
  }

  // Capture first page dimensions (in PDF points) for display in CompareStep
  const pages = pdfDoc.getPages();
  const outputPageDimensions = pages.length > 0
    ? pages[0].getSize()  // { width: number; height: number } in points
    : null;

  return {
    bytes: processedBytes,
    outputSizeBytes,
    inputSizeBytes,
    pageCount,
    outputPageDimensions: outputPageDimensions
      ? { widthPt: outputPageDimensions.width, heightPt: outputPageDimensions.height }
      : null,
    targetMet,
    bestAchievableSizeBytes,
  };
}
