/**
 * PDF image extraction — extracts images from PDF pages with position/size data.
 *
 * Uses pdf-lib to enumerate XObject image resources and pdfjs-dist operator list
 * to determine image positions on the page.
 *
 * CRITICAL: Always pass pdfBytes.slice() to getDocument() — PDF.js transfers
 * the ArrayBuffer to its web worker (StrictMode safety).
 */

import { PDFDocument, PDFName, PDFRawStream, PDFStream, PDFRef } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import { OPS } from 'pdfjs-dist';
import type { ImageBlock } from '@/types/editor';

/** Internal image info extracted from PDF resources. */
interface RawImageInfo {
  name: string;
  width: number;
  height: number;
  bytes: Uint8Array;
  isJpeg: boolean;
}

/**
 * Extract images from a single PDF page.
 *
 * Strategy:
 * 1. Use pdf-lib to enumerate XObject images and get raw bytes
 * 2. Use pdfjs-dist OperatorList to find paintImageXObject operators for position data
 * 3. Merge: match by name, build ImageBlock array
 *
 * Falls back to centered placement when position extraction fails.
 */
export async function extractPageImages(
  pdfBytes: Uint8Array,
  pageIndex: number,
): Promise<ImageBlock[]> {
  // Step 1: Extract image bytes from pdf-lib
  const rawImages = await extractRawImages(pdfBytes, pageIndex);
  if (rawImages.length === 0) return [];

  // Step 2: Get image positions from pdfjs-dist operator list
  const positions = await extractImagePositions(pdfBytes, pageIndex);

  // Step 3: Get page dimensions for fallback centering
  const pageDims = await getPageDimensionsFromPdfLib(pdfBytes, pageIndex);

  // Step 4: Match and build ImageBlocks
  const blocks: ImageBlock[] = [];

  for (const rawImg of rawImages) {
    // Try to find matching position from operator list
    const pos = positions.get(rawImg.name);

    let x: number, y: number, width: number, height: number;

    if (pos) {
      x = pos.x;
      y = pos.y;
      width = pos.width;
      height = pos.height;
    } else {
      // Fallback: center image on page at its natural dimensions
      // Scale down if larger than page
      width = rawImg.width;
      height = rawImg.height;
      if (width > pageDims.width * 0.9) {
        const scale = (pageDims.width * 0.9) / width;
        width *= scale;
        height *= scale;
      }
      if (height > pageDims.height * 0.9) {
        const scale = (pageDims.height * 0.9) / height;
        width *= scale;
        height *= scale;
      }
      x = (pageDims.width - width) / 2;
      y = (pageDims.height - height) / 2;
    }

    // Convert raw image bytes to displayable format
    const imageBytes = rawImg.isJpeg
      ? rawImg.bytes
      : await renderImageRegionToCanvas(pdfBytes, pageIndex, x, y, width, height, pageDims);

    if (imageBytes.byteLength === 0) continue;

    blocks.push({
      id: crypto.randomUUID(),
      pageIndex,
      x,
      y,
      width,
      height,
      imageBytes,
      rotation: 0,
      flipH: false,
      flipV: false,
      isNew: false,
    });
  }

  return blocks;
}

/**
 * Extract raw image data from PDF page resources using pdf-lib.
 */
async function extractRawImages(
  pdfBytes: Uint8Array,
  pageIndex: number,
): Promise<RawImageInfo[]> {
  try {
    const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
    const pages = doc.getPages();
    if (pageIndex < 0 || pageIndex >= pages.length) return [];

    const page = pages[pageIndex];
    const resources = page.node.Resources();
    if (!resources) return [];

    const xObjectDict = resources.lookup(PDFName.of('XObject'));
    if (!xObjectDict || typeof (xObjectDict as unknown as Record<string, unknown>).entries !== 'function') return [];

    const images: RawImageInfo[] = [];
    const entries = (xObjectDict as unknown as { entries(): [PDFName, PDFRef | PDFStream][] }).entries();

    for (const [name, ref] of entries) {
      try {
        // Resolve the reference to get the actual stream
        let stream: PDFStream | PDFRawStream | null = null;
        if (ref instanceof PDFRef) {
          const resolved = doc.context.lookup(ref);
          if (resolved instanceof PDFStream || resolved instanceof PDFRawStream) {
            stream = resolved;
          }
        } else if ((ref as unknown) instanceof PDFStream || (ref as unknown) instanceof PDFRawStream) {
          stream = ref as unknown as PDFStream;
        }

        if (!stream) continue;

        // Check if it's an Image XObject
        const subtypeEntry = stream.dict.get(PDFName.of('Subtype'));
        if (!subtypeEntry || subtypeEntry.toString() !== '/Image') continue;

        // Get dimensions
        const widthEntry = stream.dict.get(PDFName.of('Width'));
        const heightEntry = stream.dict.get(PDFName.of('Height'));
        if (!widthEntry || !heightEntry) continue;

        const imgWidth = Number(widthEntry.toString());
        const imgHeight = Number(heightEntry.toString());
        if (isNaN(imgWidth) || isNaN(imgHeight)) continue;

        // Check filter for JPEG detection
        const filterEntry = stream.dict.get(PDFName.of('Filter'));
        const filterStr = filterEntry ? filterEntry.toString() : '';
        const isJpeg = filterStr.includes('DCTDecode');

        // Get raw bytes
        let bytes: Uint8Array;
        if (stream instanceof PDFRawStream) {
          bytes = new Uint8Array(stream.contents);
        } else {
          // For encoded streams, we can't easily decode — mark for canvas render
          bytes = new Uint8Array(0);
        }

        images.push({
          name: name.decodeText(),
          width: imgWidth,
          height: imgHeight,
          bytes,
          isJpeg: isJpeg && bytes.byteLength > 0,
        });
      } catch {
        // Skip problematic entries
        continue;
      }
    }

    return images;
  } catch {
    return [];
  }
}

/**
 * Extract image positions from pdfjs-dist OperatorList.
 * Returns a map from image name to its position/size on the page.
 */
async function extractImagePositions(
  pdfBytes: Uint8Array,
  pageIndex: number,
): Promise<Map<string, { x: number; y: number; width: number; height: number }>> {
  const positions = new Map<string, { x: number; y: number; width: number; height: number }>();

  try {
    const loadingTask = pdfjsLib.getDocument({ data: pdfBytes.slice() });
    const doc = await loadingTask.promise;

    try {
      const page = await doc.getPage(pageIndex + 1);
      const opList = await page.getOperatorList();

      // Track the current transform matrix (CTM)
      // We need to find the transform applied before each paintImageXObject
      const fnArray = opList.fnArray;
      const argsArray = opList.argsArray;

      // Simple approach: scan for paintImageXObject and use the most recent transform
      let lastTransform: number[] = [1, 0, 0, 1, 0, 0]; // identity

      for (let i = 0; i < fnArray.length; i++) {
        if (fnArray[i] === OPS.transform) {
          // transform operator: args are [a, b, c, d, e, f]
          lastTransform = argsArray[i] as number[];
        } else if (fnArray[i] === OPS.paintImageXObject) {
          const imgName = argsArray[i][0] as string;
          const t = lastTransform;

          // The transform matrix [a, b, c, d, e, f] maps the unit square to image position:
          // width = a (or sqrt(a^2 + b^2) for rotated)
          // height = d (or sqrt(c^2 + d^2) for rotated)
          // x = e, y = f
          const width = Math.abs(t[0]) || Math.sqrt(t[0] * t[0] + t[1] * t[1]);
          const height = Math.abs(t[3]) || Math.sqrt(t[2] * t[2] + t[3] * t[3]);

          positions.set(imgName, {
            x: t[4],
            y: t[5],
            width,
            height,
          });

          // Reset transform after use
          lastTransform = [1, 0, 0, 1, 0, 0];
        } else if (fnArray[i] === OPS.save) {
          // save/restore affect CTM but for simplicity we just track the last transform
        } else if (fnArray[i] === OPS.restore) {
          lastTransform = [1, 0, 0, 1, 0, 0];
        }
      }
    } finally {
      doc.destroy();
    }
  } catch {
    // Position extraction failed — fall back to centered placement
  }

  return positions;
}

/**
 * Render a region of a PDF page to a canvas to capture an image visually.
 * Used when raw image bytes aren't directly displayable (non-JPEG formats).
 */
async function renderImageRegionToCanvas(
  pdfBytes: Uint8Array,
  pageIndex: number,
  x: number,
  y: number,
  width: number,
  height: number,
  pageDims: { width: number; height: number },
): Promise<Uint8Array> {
  try {
    const loadingTask = pdfjsLib.getDocument({ data: pdfBytes.slice() });
    const doc = await loadingTask.promise;

    try {
      const page = await doc.getPage(pageIndex + 1);
      const scale = 2; // render at 2x for quality
      const viewport = page.getViewport({ scale });

      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;

      await page.render({ canvas, viewport }).promise;

      // Crop to the image region
      // Convert PDF coordinates (bottom-left origin) to canvas coordinates (top-left origin)
      const cropCanvas = document.createElement('canvas');
      const cropWidth = Math.max(1, Math.round(width * scale));
      const cropHeight = Math.max(1, Math.round(height * scale));
      cropCanvas.width = cropWidth;
      cropCanvas.height = cropHeight;

      const cropCtx = cropCanvas.getContext('2d');
      if (!cropCtx) return new Uint8Array(0);

      const sx = x * scale;
      const sy = (pageDims.height - y - height) * scale;

      cropCtx.drawImage(canvas, sx, sy, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);

      const blob = await new Promise<Blob | null>((resolve) => cropCanvas.toBlob(resolve, 'image/png'));
      if (!blob) return new Uint8Array(0);

      const buffer = await blob.arrayBuffer();
      return new Uint8Array(buffer);
    } finally {
      doc.destroy();
    }
  } catch {
    return new Uint8Array(0);
  }
}

/**
 * Get page dimensions using pdf-lib.
 */
async function getPageDimensionsFromPdfLib(
  pdfBytes: Uint8Array,
  pageIndex: number,
): Promise<{ width: number; height: number }> {
  const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const pages = doc.getPages();
  if (pageIndex < 0 || pageIndex >= pages.length) {
    return { width: 612, height: 792 }; // US Letter default
  }
  const page = pages[pageIndex];
  return { width: page.getWidth(), height: page.getHeight() };
}
