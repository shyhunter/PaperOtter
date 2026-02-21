import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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

// ─── Integration: committed fixture files (test-fixtures/) ───────────────────
//
// These tests read the real binary fixtures committed to the repository.
// Invoke (Rust side) is still mocked — we cannot run Tauri from Node tests.
// The value here: confirms processImage correctly reads, wraps, and reports
// metadata for actual JPEG and PNG bytes rather than synthetic magic-byte stubs.

describe('processImage — committed JPEG fixture (test-fixtures/sample.jpg)', () => {
  let fixtureJpeg: Uint8Array;
  let processedBytes: Uint8Array;

  beforeAll(() => {
    const buf = readFileSync(resolve(process.cwd(), 'test-fixtures/sample.jpg'));
    fixtureJpeg = new Uint8Array(buf);
  });

  beforeEach(() => {
    // Simulate Rust returning a compressed version (half the size)
    processedBytes = fixtureJpeg.slice(0, Math.floor(fixtureJpeg.byteLength / 2));
    mockReadFile(fixtureJpeg);
    mockInvoke(processedBytes);
    mockDimensions(300, 200); // matches fixture dimensions
  });

  it('reads the fixture and passes its bytes as sourceBytes', async () => {
    const result = await processImage('/fixture.jpg', { ...baseOpts });
    expect(result.sourceBytes).toEqual(fixtureJpeg);
  });

  it('inputSizeBytes matches the committed JPEG file size', async () => {
    const result = await processImage('/fixture.jpg', { ...baseOpts });
    expect(result.inputSizeBytes).toBe(fixtureJpeg.byteLength);
  });

  it('reports correct source dimensions from createImageBitmap', async () => {
    const result = await processImage('/fixture.jpg', { ...baseOpts });
    expect(result.sourceWidth).toBe(300);
    expect(result.sourceHeight).toBe(200);
  });

  it('fixture has valid JPEG magic bytes (FF D8 FF)', () => {
    expect(fixtureJpeg[0]).toBe(0xff);
    expect(fixtureJpeg[1]).toBe(0xd8);
    expect(fixtureJpeg[2]).toBe(0xff);
  });
});

describe('processImage — committed PNG fixture (test-fixtures/sample.png)', () => {
  let fixturePng: Uint8Array;

  beforeAll(() => {
    const buf = readFileSync(resolve(process.cwd(), 'test-fixtures/sample.png'));
    fixturePng = new Uint8Array(buf);
  });

  beforeEach(() => {
    mockReadFile(fixturePng);
    mockInvoke(fixturePng.slice(0, Math.floor(fixturePng.byteLength * 0.8)));
    mockDimensions(200, 200);
  });

  it('reads the fixture and passes its bytes as sourceBytes', async () => {
    const result = await processImage('/fixture.png', { ...baseOpts, outputFormat: 'png' });
    expect(result.sourceBytes).toEqual(fixturePng);
  });

  it('inputSizeBytes matches the committed PNG file size', async () => {
    const result = await processImage('/fixture.png', { ...baseOpts });
    expect(result.inputSizeBytes).toBe(fixturePng.byteLength);
  });

  it('fixture has valid PNG magic bytes (89 50 4E 47)', () => {
    expect(fixturePng[0]).toBe(0x89);
    expect(fixturePng[1]).toBe(0x50); // P
    expect(fixturePng[2]).toBe(0x4e); // N
    expect(fixturePng[3]).toBe(0x47); // G
  });
});

// ─── User fixture: pexels-pixabay-459225.jpg — TEST_PLAN.md IC-01, IC-02, IF-03, IR-01, IR-02, IR-08 ──
//
// Uses the exact "large JPEG photo" referenced in TEST_PLAN.md Section 6 (Image Quality)
// and Sections 7–8 (Format Conversion, Image Resize).
// Invoke (Rust compression) is still mocked — these tests verify the TypeScript layer
// correctly reads the real file and passes the right parameters to Rust.

describe('processImage — pexels-pixabay-459225.jpg (TEST_PLAN.md IC-01, IC-02, IF-03, IR-01, IR-02, IR-08)', () => {
  let fixtureJpeg: Uint8Array;
  const processedStub = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x01]); // minimal JPEG stub

  beforeAll(() => {
    const buf = readFileSync(resolve(process.cwd(), 'test-fixtures/pexels-pixabay-459225.jpg'));
    fixtureJpeg = new Uint8Array(buf);
  });

  beforeEach(() => {
    mockReadFile(fixtureJpeg);
    mockInvoke(processedStub);
    mockDimensions(1920, 1280); // representative dimensions for a 2.3 MB photo
    vi.mocked(invoke).mockClear(); // prevent call-history bleeding across tests
  });

  // [IC-01] Default process — inputSizeBytes matches the 2.3 MB file; JPEG magic bytes verified
  it('[IC-01] inputSizeBytes matches 2.3 MB file size', async () => {
    const result = await processImage('/pexels-pixabay-459225.jpg', { ...baseOpts });
    expect(result.inputSizeBytes).toBe(fixtureJpeg.byteLength);
    expect(result.inputSizeBytes).toBeGreaterThan(2_000_000); // at least 2 MB
  });

  it('[IC-01] JPEG magic bytes (FF D8 FF) confirmed in user fixture', () => {
    expect(fixtureJpeg[0]).toBe(0xff);
    expect(fixtureJpeg[1]).toBe(0xd8);
    expect(fixtureJpeg[2]).toBe(0xff);
  });

  it('[IC-01] sourceBytes matches the committed fixture bytes', async () => {
    const result = await processImage('/pexels-pixabay-459225.jpg', { ...baseOpts });
    expect(result.sourceBytes).toEqual(fixtureJpeg);
  });

  // [IC-02] quality=100 passed to Rust invoke
  it('[IC-02] quality=100 is passed to Rust invoke', async () => {
    await processImage('/pexels-pixabay-459225.jpg', { ...baseOpts, quality: 100 });
    expect(vi.mocked(invoke)).toHaveBeenCalledWith(
      'process_image',
      expect.objectContaining({ quality: 100 }),
    );
  });

  // [IC-02] quality=1 passed to Rust invoke (lowest quality = smallest file in real Rust)
  it('[IC-02] quality=1 is passed to Rust invoke', async () => {
    await processImage('/pexels-pixabay-459225.jpg', { ...baseOpts, quality: 1 });
    expect(vi.mocked(invoke)).toHaveBeenCalledWith(
      'process_image',
      expect.objectContaining({ quality: 1 }),
    );
  });

  // [IF-03] JPEG → WebP conversion — outputFormat='webp' passed to invoke
  it('[IF-03] WebP output format is passed to Rust invoke', async () => {
    await processImage('/pexels-pixabay-459225.jpg', { ...baseOpts, outputFormat: 'webp' });
    expect(vi.mocked(invoke)).toHaveBeenCalledWith(
      'process_image',
      expect.objectContaining({ outputFormat: 'webp' }),
    );
  });

  // [IR-01] HD 1920×1080 preset — resize params passed to invoke
  it('[IR-01] HD 1920×1080 resize params are passed to Rust invoke', async () => {
    await processImage('/pexels-pixabay-459225.jpg', {
      ...baseOpts,
      resizeEnabled: true,
      targetWidth: 1920,
      targetHeight: 1080,
    });
    expect(vi.mocked(invoke)).toHaveBeenCalledWith(
      'process_image',
      expect.objectContaining({ resizeWidth: 1920, resizeHeight: 1080 }),
    );
  });

  // [IR-02] Thumbnail 400×400 preset — resize params passed to invoke
  it('[IR-02] Thumbnail 400×400 resize params are passed to Rust invoke', async () => {
    await processImage('/pexels-pixabay-459225.jpg', {
      ...baseOpts,
      resizeEnabled: true,
      targetWidth: 400,
      targetHeight: 400,
    });
    expect(vi.mocked(invoke)).toHaveBeenCalledWith(
      'process_image',
      expect.objectContaining({ resizeWidth: 400, resizeHeight: 400 }),
    );
  });

  // [IR-08] Resize + quality 50% — both params passed correctly in one call
  it('[IR-08] resize (400×400) and quality (50%) are both passed to Rust invoke', async () => {
    await processImage('/pexels-pixabay-459225.jpg', {
      ...baseOpts,
      quality: 50,
      resizeEnabled: true,
      targetWidth: 400,
      targetHeight: 400,
    });
    expect(vi.mocked(invoke)).toHaveBeenCalledWith(
      'process_image',
      expect.objectContaining({ quality: 50, resizeWidth: 400, resizeHeight: 400 }),
    );
  });
});
