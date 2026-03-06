import { useState, useCallback } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { readFile } from '@tauri-apps/plugin-fs';

interface SignatureUploadProps {
  onComplete: (dataUrl: string) => void;
}

const MAX_WIDTH = 600;
const MAX_HEIGHT = 200;

/**
 * Convert raw image bytes to a resized PNG data URL.
 * Resizes if the image exceeds MAX_WIDTH x MAX_HEIGHT.
 */
async function imageBytesToPngDataUrl(bytes: Uint8Array, mimeType: string): Promise<string> {
  const blob = new Blob([bytes], { type: mimeType });
  const bitmap = await createImageBitmap(blob);

  let { width, height } = bitmap;

  // Scale down if necessary, preserving aspect ratio
  if (width > MAX_WIDTH || height > MAX_HEIGHT) {
    const scaleX = MAX_WIDTH / width;
    const scaleY = MAX_HEIGHT / height;
    const scale = Math.min(scaleX, scaleY);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Cannot get canvas context');

  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  return canvas.toDataURL('image/png');
}

function getMimeType(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  switch (ext) {
    case 'png': return 'image/png';
    case 'webp': return 'image/webp';
    case 'jpg':
    case 'jpeg': return 'image/jpeg';
    default: return 'image/png';
  }
}

export function SignatureUpload({ onComplete }: SignatureUploadProps) {
  const [preview, setPreview] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handlePick = useCallback(async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [
          {
            name: 'Images',
            extensions: ['png', 'jpg', 'jpeg', 'webp'],
          },
        ],
      });

      if (!selected) return;

      setIsLoading(true);
      // open() with multiple:false returns string | null in Tauri v2
      const filePath = selected as string;
      const bytes = await readFile(filePath);
      const mime = getMimeType(filePath);
      const dataUrl = await imageBytesToPngDataUrl(bytes, mime);

      setPreview(dataUrl);
      setFileName(filePath.split('/').pop() ?? filePath.split('\\').pop() ?? 'image');
      setIsLoading(false);
    } catch {
      setIsLoading(false);
    }
  }, []);

  const handleUse = useCallback(() => {
    if (preview) {
      onComplete(preview);
    }
  }, [preview, onComplete]);

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={handlePick}
        disabled={isLoading}
        className="self-start rounded-md border border-border px-4 py-2 text-sm text-foreground hover:bg-muted disabled:opacity-40"
      >
        {isLoading ? 'Loading...' : 'Choose Image...'}
      </button>

      {/* Preview */}
      {preview && (
        <div className="flex flex-col gap-2">
          <div
            className="flex items-center justify-center rounded-lg border-2 border-dashed border-border bg-white p-4"
            style={{ maxWidth: MAX_WIDTH, minHeight: 80 }}
          >
            <img
              src={preview}
              alt="Signature preview"
              className="max-w-full max-h-[160px] object-contain"
            />
          </div>
          {fileName && (
            <p className="text-xs text-muted-foreground">{fileName}</p>
          )}
          <button
            type="button"
            onClick={handleUse}
            className="self-start rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90"
          >
            Use This Signature
          </button>
        </div>
      )}

      {!preview && !isLoading && (
        <div
          className="flex items-center justify-center rounded-lg border-2 border-dashed border-border bg-muted/30"
          style={{ maxWidth: MAX_WIDTH, height: MAX_HEIGHT }}
        >
          <span className="text-muted-foreground text-sm">
            Select an image file (PNG, JPG, or WebP)
          </span>
        </div>
      )}
    </div>
  );
}
