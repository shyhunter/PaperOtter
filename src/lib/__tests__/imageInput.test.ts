import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFile } from '@tauri-apps/plugin-fs';
import { invoke } from '@tauri-apps/api/core';
import { getFileSizeBytes } from '@/lib/fileValidation';
import { readImageBytes } from '@/lib/imageInput';

vi.mock('@/lib/fileValidation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/fileValidation')>()),
  getFileSizeBytes: vi.fn(),
}));

// ─── readImageBytes (IMG-HEIC-03) ────────────────────────────────────────────
//
// The webview cannot decode HEIC — createImageBitmap and <img> both fail on it.
// readImageBytes is the single seam that normalises a HEIC to PNG on the way in,
// so every downstream preview, thumbnail and dimension read keeps working
// untouched. Non-HEIC files must go on reading straight off disk: routing every
// image through Rust would be a needless round-trip.

describe('readImageBytes', () => {
  beforeEach(() => {
    vi.mocked(readFile).mockReset();
    vi.mocked(invoke).mockReset();
    vi.mocked(getFileSizeBytes).mockReset();
  });

  it('[IMG-HEIC-03a] reads an ordinary image straight from disk, no Rust round-trip', async () => {
    const jpegBytes = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0]);
    vi.mocked(readFile).mockResolvedValue(jpegBytes);

    const result = await readImageBytes('/Users/me/photo.jpg');

    expect(result.bytes).toBe(jpegBytes);
    expect(result.mime).toBe('image/jpeg');
    expect(invoke).not.toHaveBeenCalled();
  });

  it('[IMG-HEIC-03b] hands back PNG bytes for a HEIC so previews keep working', async () => {
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4E, 0x47]);
    vi.mocked(invoke).mockResolvedValue(pngBytes);

    const result = await readImageBytes('/Users/me/IMG_4032.heic');

    expect(invoke).toHaveBeenCalledWith('decode_heic_preview', { sourcePath: '/Users/me/IMG_4032.heic' });
    expect(result.bytes).toBe(pngBytes);
    expect(result.mime).toBe('image/png');
    expect(readFile).not.toHaveBeenCalled();
  });

  it('[IMG-HEIC-03c] reports how many frames a HEIC held, so the user can be told', async () => {
    vi.mocked(invoke).mockImplementation(async (cmd: string) =>
      cmd === 'heic_frame_count' ? 2 : new Uint8Array([0x89, 0x50, 0x4E, 0x47]),
    );

    const result = await readImageBytes('/Users/me/burst.heic');

    expect(result.frameCount).toBe(2);
  });

  it('[IMG-HEIC-03d] leaves frameCount undefined for files that cannot have frames', async () => {
    vi.mocked(readFile).mockResolvedValue(new Uint8Array([0xFF, 0xD8]));

    const result = await readImageBytes('/Users/me/photo.jpg');

    expect(result.frameCount).toBeUndefined();
  });

  it('[IMG-HEIC-03f] reports the size of the file on disk, not of the PNG stand-in', async () => {
    // Every caller that shows the user a "before" size reads this field. A PNG
    // decoded from a HEIC is several times larger than the HEIC it came from, so
    // measuring the stand-in would overstate the original and invent a saving.
    vi.mocked(invoke).mockResolvedValue(new Uint8Array(900_000));
    vi.mocked(getFileSizeBytes).mockResolvedValue(180_000);

    expect((await readImageBytes('/Users/me/IMG_4032.heic')).sizeBytes).toBe(180_000);
  });

  it('[IMG-HEIC-03g] measures an ordinary image from its own bytes, with no extra read', async () => {
    vi.mocked(readFile).mockResolvedValue(new Uint8Array(50_000));

    expect((await readImageBytes('/Users/me/photo.jpg')).sizeBytes).toBe(50_000);
    expect(getFileSizeBytes).not.toHaveBeenCalled();
  });

  it('[IMG-HEIC-03e] maps the source mime by extension rather than defaulting to JPEG', async () => {
    vi.mocked(readFile).mockResolvedValue(new Uint8Array([0x89, 0x50]));

    expect((await readImageBytes('/Users/me/a.png')).mime).toBe('image/png');
    expect((await readImageBytes('/Users/me/a.webp')).mime).toBe('image/webp');
    expect((await readImageBytes('/Users/me/a.tiff')).mime).toBe('image/tiff');
  });
});
