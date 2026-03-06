import { invoke } from '@tauri-apps/api/core';

export type ImageRotation = 90 | 180 | 270;

export async function rotateImage(
  sourcePath: string,
  rotation: ImageRotation,
  outputFormat: 'jpeg' | 'png' | 'webp',
  quality: number,
): Promise<Uint8Array> {
  return await invoke('rotate_image', {
    sourcePath,
    rotation,
    outputFormat,
    quality,
  });
}
