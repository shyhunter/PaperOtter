import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFile } from '@tauri-apps/plugin-fs';
import { invoke } from '@tauri-apps/api/core';
import { processImage } from '@/lib/imageProcessor';
import { createMinimalJpeg, createMinimalPng, createMinimalWebP } from '@/test/fixtures';
import type { ImageProcessingOptions } from '@/types/file';

// Convenience base options — overrideable per-test with spread
const baseOpts: ImageProcessingOptions = {
  quality: 75,
  outputFormat: 'jpeg',
  resizeEnabled: false,
  resizeExact: false,
  targetWidth: null,
  targetHeight: null,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mockReadFile(bytes: Uint8Array) {
  vi.mocked(readFile).mockResolvedValue(bytes);
}

function mockInvoke(processedBytes: Uint8Array) {
  vi.mocked(invoke).mockResolvedValue(processedBytes);
}

function mockDimensions(w: number, h: number) {
  vi.mocked(createImageBitmap).mockResolvedValue({
    width: w,
    height: h,
    close: vi.fn(),
  } as unknown as ImageBitmap);
}

// ─── Output integrity ─────────────────────────────────────────────────────────

describe('processImage — output integrity', () => {
  let sourceBytes: Uint8Array;
  let processedBytes: Uint8Array;

  beforeEach(() => {
    sourceBytes = createMinimalJpeg(200);
    processedBytes = createMinimalJpeg(120); // smaller — simulates compression
    mockReadFile(sourceBytes);
    mockInvoke(processedBytes);
    mockDimensions(100, 80); // used for both calls in the default case
  });

  it('result.bytes is exactly the Uint8Array returned by invoke', async () => {
    const result = await processImage('/photo.jpg', { ...baseOpts });
    expect(result.bytes).toBe(processedBytes);
  });

  it('result.sourceBytes is exactly the Uint8Array returned by readFile', async () => {
    const result = await processImage('/photo.jpg', { ...baseOpts });
    expect(result.sourceBytes).toBe(sourceBytes);
  });

  it('inputSizeBytes matches sourceBytes.byteLength', async () => {
    const result = await processImage('/photo.jpg', { ...baseOpts });
    expect(result.inputSizeBytes).toBe(sourceBytes.byteLength);
    expect(result.inputSizeBytes).toBe(200);
  });

  it('outputSizeBytes matches processedBytes.byteLength', async () => {
    const result = await processImage('/photo.jpg', { ...baseOpts });
    expect(result.outputSizeBytes).toBe(processedBytes.byteLength);
    expect(result.outputSizeBytes).toBe(120);
  });

  it('outputFormat matches options.outputFormat', async () => {
    const result = await processImage('/photo.jpg', { ...baseOpts, outputFormat: 'png' });
    expect(result.outputFormat).toBe('png');
  });

  it('quality matches options.quality', async () => {
    const result = await processImage('/photo.jpg', { ...baseOpts, quality: 42 });
    expect(result.quality).toBe(42);
  });

  it('sourceWidth and sourceHeight come from the first createImageBitmap call', async () => {
    // First call (source): 800×600. Second call (output): 100×80.
    vi.mocked(createImageBitmap)
      .mockResolvedValueOnce({ width: 800, height: 600, close: vi.fn() } as unknown as ImageBitmap)
      .mockResolvedValueOnce({ width: 100, height: 80, close: vi.fn() } as unknown as ImageBitmap);

    const result = await processImage('/photo.jpg', { ...baseOpts });
    expect(result.sourceWidth).toBe(800);
    expect(result.sourceHeight).toBe(600);
  });

  it('outputWidth and outputHeight come from the second createImageBitmap call', async () => {
    vi.mocked(createImageBitmap)
      .mockResolvedValueOnce({ width: 800, height: 600, close: vi.fn() } as unknown as ImageBitmap)
      .mockResolvedValueOnce({ width: 400, height: 300, close: vi.fn() } as unknown as ImageBitmap);

    const result = await processImage('/photo.jpg', { ...baseOpts });
    expect(result.outputWidth).toBe(400);
    expect(result.outputHeight).toBe(300);
  });
});

// ─── Invoke parameter mapping ─────────────────────────────────────────────────

describe('processImage — invoke parameter mapping', () => {
  beforeEach(() => {
    mockReadFile(createMinimalJpeg());
    mockInvoke(createMinimalJpeg(80));
    mockDimensions(100, 80);
  });

  it('calls invoke with the "process_image" command name', async () => {
    await processImage('/photo.jpg', { ...baseOpts });
    expect(vi.mocked(invoke)).toHaveBeenCalledWith('process_image', expect.any(Object));
    expect(vi.mocked(invoke).mock.calls[0][0]).toBe('process_image');
  });

  it('passes quality through to invoke', async () => {
    await processImage('/photo.jpg', { ...baseOpts, quality: 55 });
    expect(vi.mocked(invoke)).toHaveBeenCalledWith('process_image', expect.objectContaining({ quality: 55 }));
  });

  it('passes outputFormat "jpeg" to invoke', async () => {
    await processImage('/photo.jpg', { ...baseOpts, outputFormat: 'jpeg' });
    expect(vi.mocked(invoke)).toHaveBeenCalledWith('process_image', expect.objectContaining({ outputFormat: 'jpeg' }));
  });

  it('passes outputFormat "png" to invoke', async () => {
    await processImage('/photo.png', { ...baseOpts, outputFormat: 'png' });
    expect(vi.mocked(invoke)).toHaveBeenCalledWith('process_image', expect.objectContaining({ outputFormat: 'png' }));
  });

  it('passes outputFormat "webp" to invoke', async () => {
    await processImage('/photo.webp', { ...baseOpts, outputFormat: 'webp' });
    expect(vi.mocked(invoke)).toHaveBeenCalledWith('process_image', expect.objectContaining({ outputFormat: 'webp' }));
  });

  it('passes resizeWidth and resizeHeight as null when resizeEnabled=false', async () => {
    await processImage('/photo.jpg', {
      ...baseOpts,
      resizeEnabled: false,
      targetWidth: 800, // ignored because disabled
      targetHeight: 600,
    });
    expect(vi.mocked(invoke)).toHaveBeenCalledWith(
      'process_image',
      expect.objectContaining({ resizeWidth: null, resizeHeight: null }),
    );
  });

  it('passes resizeWidth and resizeHeight when resizeEnabled=true with valid dimensions', async () => {
    await processImage('/photo.jpg', {
      ...baseOpts,
      resizeEnabled: true,
      targetWidth: 1280,
      targetHeight: 720,
    });
    expect(vi.mocked(invoke)).toHaveBeenCalledWith(
      'process_image',
      expect.objectContaining({ resizeWidth: 1280, resizeHeight: 720 }),
    );
  });

  it('passes resizeWidth/Height as null when resizeEnabled=true but targetWidth is null', async () => {
    await processImage('/photo.jpg', {
      ...baseOpts,
      resizeEnabled: true,
      targetWidth: null, // not yet set by user
      targetHeight: null,
    });
    expect(vi.mocked(invoke)).toHaveBeenCalledWith(
      'process_image',
      expect.objectContaining({ resizeWidth: null, resizeHeight: null }),
    );
  });

  it('passes resizeExact=true when aspect ratio lock is off (exact mode)', async () => {
    await processImage('/photo.jpg', {
      ...baseOpts,
      resizeEnabled: true,
      resizeExact: true,
      targetWidth: 400,
      targetHeight: 400,
    });
    expect(vi.mocked(invoke)).toHaveBeenCalledWith(
      'process_image',
      expect.objectContaining({ resizeExact: true }),
    );
  });

  it('passes sourcePath through to invoke', async () => {
    await processImage('/Users/me/Desktop/photo.jpg', { ...baseOpts });
    expect(vi.mocked(invoke)).toHaveBeenCalledWith(
      'process_image',
      expect.objectContaining({ sourcePath: '/Users/me/Desktop/photo.jpg' }),
    );
  });
});

// ─── Dimension tracking ───────────────────────────────────────────────────────

describe('processImage — dimension tracking', () => {
  beforeEach(() => {
    vi.mocked(createImageBitmap).mockClear();
    mockReadFile(createMinimalJpeg());
    mockInvoke(createMinimalJpeg(80));
  });

  it('source and output dimensions are tracked independently when resize changes them', async () => {
    // Simulates: 1600×900 source → 800×450 after 50% resize
    vi.mocked(createImageBitmap)
      .mockResolvedValueOnce({ width: 1600, height: 900, close: vi.fn() } as unknown as ImageBitmap)
      .mockResolvedValueOnce({ width: 800, height: 450, close: vi.fn() } as unknown as ImageBitmap);

    const result = await processImage('/photo.jpg', {
      ...baseOpts,
      resizeEnabled: true,
      targetWidth: 800,
      targetHeight: 450,
    });

    expect(result.sourceWidth).toBe(1600);
    expect(result.sourceHeight).toBe(900);
    expect(result.outputWidth).toBe(800);
    expect(result.outputHeight).toBe(450);
  });

  it('source and output dimensions are equal when no resize is applied', async () => {
    mockDimensions(640, 480); // both calls return the same

    const result = await processImage('/photo.jpg', { ...baseOpts, resizeEnabled: false });

    expect(result.sourceWidth).toBe(result.outputWidth);
    expect(result.sourceHeight).toBe(result.outputHeight);
  });

  it('createImageBitmap is called exactly twice — once for source, once for output', async () => {
    mockDimensions(100, 80);
    await processImage('/photo.jpg', { ...baseOpts });
    expect(vi.mocked(createImageBitmap)).toHaveBeenCalledTimes(2);
  });
});

// ─── Source path mime detection ───────────────────────────────────────────────
//
// The source MIME type is inferred from the file extension to pass to createImageBitmap.
// These tests verify the function completes without error for each supported extension
// and that the detected MIME is plausible (checked via the first createImageBitmap call).

describe('processImage — source path mime detection', () => {
  beforeEach(() => {
    vi.mocked(createImageBitmap).mockClear();
    mockInvoke(createMinimalJpeg(80));
    mockDimensions(100, 80);
  });

  it('completes without error for a .jpg extension', async () => {
    mockReadFile(createMinimalJpeg());
    await expect(processImage('/photo.jpg', { ...baseOpts })).resolves.not.toThrow();
  });

  it('completes without error for a .jpeg extension', async () => {
    mockReadFile(createMinimalJpeg());
    await expect(processImage('/photo.jpeg', { ...baseOpts })).resolves.not.toThrow();
  });

  it('completes without error for a .png extension', async () => {
    mockReadFile(createMinimalPng());
    await expect(processImage('/photo.png', { ...baseOpts, outputFormat: 'png' })).resolves.not.toThrow();
  });

  it('completes without error for a .webp extension', async () => {
    mockReadFile(createMinimalWebP());
    await expect(processImage('/photo.webp', { ...baseOpts, outputFormat: 'webp' })).resolves.not.toThrow();
  });

  it('falls back to image/jpeg for an unrecognised extension without throwing', async () => {
    mockReadFile(createMinimalJpeg());
    await expect(processImage('/photo.bmp', { ...baseOpts })).resolves.not.toThrow();
  });

  it('uses image/jpeg MIME for .jpg source (first createImageBitmap arg is a Blob)', async () => {
    mockReadFile(createMinimalJpeg());
    await processImage('/photo.jpg', { ...baseOpts });
    // createImageBitmap first call receives a Blob — verify it was called with a Blob object
    const firstArg = vi.mocked(createImageBitmap).mock.calls[0][0] as Blob;
    expect(firstArg).toBeInstanceOf(Blob);
    expect(firstArg.type).toBe('image/jpeg');
  });

  it('uses image/png MIME for .png source', async () => {
    mockReadFile(createMinimalPng());
    await processImage('/photo.png', { ...baseOpts, outputFormat: 'png' });
    const firstArg = vi.mocked(createImageBitmap).mock.calls[0][0] as Blob;
    expect(firstArg.type).toBe('image/png');
  });

  it('uses image/webp MIME for .webp source', async () => {
    mockReadFile(createMinimalWebP());
    await processImage('/photo.webp', { ...baseOpts, outputFormat: 'webp' });
    const firstArg = vi.mocked(createImageBitmap).mock.calls[0][0] as Blob;
    expect(firstArg.type).toBe('image/webp');
  });
});

// ─── Error propagation ────────────────────────────────────────────────────────

describe('processImage — error propagation', () => {
  it('rejects when readFile rejects', async () => {
    vi.mocked(readFile).mockRejectedValue(new Error('File not found'));
    await expect(processImage('/missing.jpg', { ...baseOpts })).rejects.toThrow('File not found');
  });

  it('rejects when invoke rejects', async () => {
    mockReadFile(createMinimalJpeg());
    vi.mocked(invoke).mockRejectedValue(new Error('Unsupported format: tiff'));
    await expect(processImage('/photo.tiff', { ...baseOpts })).rejects.toThrow('Unsupported format: tiff');
  });

  it('rejects when createImageBitmap rejects (corrupt image bytes)', async () => {
    mockReadFile(createMinimalJpeg());
    vi.mocked(createImageBitmap).mockRejectedValue(new Error('The source image could not be decoded'));
    await expect(processImage('/corrupt.jpg', { ...baseOpts })).rejects.toThrow(
      'The source image could not be decoded',
    );
  });
});
