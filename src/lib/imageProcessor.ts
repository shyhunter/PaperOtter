import { invoke } from '@tauri-apps/api/core';
import { readFile } from '@tauri-apps/plugin-fs';
import type { ImageProcessingOptions, ImageProcessingResult, ImageOutputFormat } from '@/types/file';

/** Get image dimensions from bytes using the browser's createImageBitmap (no Rust round-trip needed) */
async function getImageDimensions(bytes: Uint8Array, mimeType: string): Promise<{ width: number; height: number }> {
  const blob = new Blob([bytes], { type: mimeType });
  const bitmap = await createImageBitmap(blob);
  const dims = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return dims;
}

function getMimeType(format: ImageOutputFormat): string {
  return format === 'jpeg' ? 'image/jpeg' : format === 'png' ? 'image/png' : 'image/webp';
}

// Detect source format from file extension for dimension query
function detectMimeFromPath(sourcePath: string): string {
  const ext = sourcePath.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'tiff' || ext === 'tif') return 'image/tiff';
  if (ext === 'bmp') return 'image/bmp';
  if (ext === 'gif') return 'image/gif';
  return 'image/jpeg'; // fallback
}

export async function processImage(
  sourcePath: string,
  options: ImageProcessingOptions,
): Promise<ImageProcessingResult> {
  // Read source bytes for the Before panel
  const sourceBytes = await readFile(sourcePath);

  // Get source dimensions via createImageBitmap (browser-native, no extra Rust command)
  const sourceMime = detectMimeFromPath(sourcePath);
  const sourceDims = await getImageDimensions(sourceBytes, sourceMime);

  // Call Rust command — returns Uint8Array via tauri::ipc::Response
  const processedBytes: Uint8Array = await invoke('process_image', {
    sourcePath,
    quality: options.quality,
    outputFormat: options.outputFormat,
    resizeWidth: options.resizeEnabled && options.targetWidth != null ? options.targetWidth : null,
    resizeHeight: options.resizeEnabled && options.targetHeight != null ? options.targetHeight : null,
    resizeExact: options.resizeExact,
  });

  // Get output dimensions from processed bytes
  const outputMime = getMimeType(options.outputFormat);
  const outputDims = await getImageDimensions(processedBytes, outputMime);

  return {
    bytes: processedBytes,
    sourceBytes,
    inputSizeBytes: sourceBytes.byteLength,
    outputSizeBytes: processedBytes.byteLength,
    outputFormat: options.outputFormat,
    quality: options.quality,
    sourceWidth: sourceDims.width,
    sourceHeight: sourceDims.height,
    outputWidth: outputDims.width,
    outputHeight: outputDims.height,
  };
}
