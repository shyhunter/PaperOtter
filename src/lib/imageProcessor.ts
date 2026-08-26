import { invoke } from '@tauri-apps/api/core';
import { readImageBytes } from '@/lib/imageInput';
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

export async function processImage(
  sourcePath: string,
  options: ImageProcessingOptions,
): Promise<ImageProcessingResult> {
  // Read source bytes for the Before panel. A HEIC comes back as PNG — the
  // webview cannot decode HEIC — so these bytes are a stand-in for the preview,
  // not the file on disk.
  const { bytes: sourceBytes, mime: sourceMime, sizeBytes: inputSizeBytes } = await readImageBytes(sourcePath);

  // Get source dimensions via createImageBitmap (browser-native, no extra Rust command)
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
    inputSizeBytes,
    outputSizeBytes: processedBytes.byteLength,
    outputFormat: options.outputFormat,
    quality: options.quality,
    sourceWidth: sourceDims.width,
    sourceHeight: sourceDims.height,
    outputWidth: outputDims.width,
    outputHeight: outputDims.height,
  };
}
