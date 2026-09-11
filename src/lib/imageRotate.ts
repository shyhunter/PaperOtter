import { invoke } from '@tauri-apps/api/core';

/**
 * The same four positions Rotate PDF offers, including none.
 *
 * This was `90 | 180 | 270`, so the tool opened on an image already turned a
 * quarter and there was no way back to how it arrived: left and right cycled
 * three states and skipped the one the user started from. Rotate PDF has always
 * had 0 in its cycle; the two tools do the same job and now say so the same way.
 *
 * 0 never reaches the backend -- there is nothing to do and re-encoding an
 * image to leave it alone would only cost it quality.
 */
export type ImageRotation = 0 | 90 | 180 | 270;

/** A quarter turn from where the image sits. Shared with Rotate PDF's turnBy. */
export function turnImage(current: ImageRotation, direction: 'left' | 'right'): ImageRotation {
  const delta = direction === 'right' ? 90 : 270;
  return ((((current + delta) % 360) + 360) % 360) as ImageRotation;
}

export async function rotateImage(
  sourcePath: string,
  rotation: Exclude<ImageRotation, 0>,
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
