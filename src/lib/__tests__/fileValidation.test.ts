import { describe, it, expect, vi, afterEach } from 'vitest';
import { getExtension, isSupportedFile, detectFormat, getFileName, FILE_SIZE_LIMIT_BYTES, getFileSizeBytes } from '@/lib/fileValidation';

// ─── getExtension ────────────────────────────────────────────────────────────

describe('getExtension', () => {
  it('returns lowercase extension for a simple file', () => {
    expect(getExtension('document.pdf')).toBe('pdf');
  });

  it('lowercases the extension', () => {
    expect(getExtension('IMAGE.PNG')).toBe('png');
    expect(getExtension('Photo.JPG')).toBe('jpg');
  });

  it('handles paths with directories', () => {
    expect(getExtension('/Users/me/Desktop/report.pdf')).toBe('pdf');
    expect(getExtension('C:\\Users\\me\\photo.jpeg')).toBe('jpeg');
  });

  it('returns the last extension for multiple dots', () => {
    expect(getExtension('archive.tar.gz')).toBe('gz');
    expect(getExtension('my.file.name.pdf')).toBe('pdf');
  });

  it('returns the whole filename (lowercased) for a file with no dot', () => {
    // split('.').pop() on 'Makefile' returns 'Makefile' — the function has no
    // special handling for extension-less files, which is fine because
    // isSupportedFile() rejects the result as an unsupported format anyway.
    expect(getExtension('Makefile')).toBe('makefile');
  });

  it('returns empty string for an empty path', () => {
    expect(getExtension('')).toBe('');
  });
});

// ─── isSupportedFile ─────────────────────────────────────────────────────────

describe('isSupportedFile', () => {
  it.each(['document.pdf', 'photo.jpg', 'image.jpeg', 'pic.png', 'graphic.webp', 'scan.tiff', 'scan.tif', 'diagram.bmp', 'animation.gif'])(
    'accepts supported file: %s',
    (path) => {
      expect(isSupportedFile(path)).toBe(true);
    },
  );

  it.each(['report.docx', 'spreadsheet.xlsx', 'archive.zip', 'video.mp4', 'Makefile'])(
    'rejects unsupported file: %s',
    (path) => {
      expect(isSupportedFile(path)).toBe(false);
    },
  );

  it('accepts mixed-case extensions', () => {
    expect(isSupportedFile('PHOTO.PDF')).toBe(true);
    expect(isSupportedFile('Image.PNG')).toBe(true);
  });

  it('rejects an empty path', () => {
    expect(isSupportedFile('')).toBe(false);
  });

  it('rejects a path that is too long (> 4096 chars)', () => {
    expect(isSupportedFile('a'.repeat(4097) + '.pdf')).toBe(false);
  });

  it('rejects a path containing a null byte', () => {
    expect(isSupportedFile('evil\0.pdf')).toBe(false);
  });
});

// ─── detectFormat ────────────────────────────────────────────────────────────

describe('detectFormat', () => {
  it('detects pdf format', () => {
    expect(detectFormat('report.pdf')).toBe('pdf');
  });

  it('detects image format for jpg', () => {
    expect(detectFormat('photo.jpg')).toBe('image');
  });

  it('detects image format for jpeg', () => {
    expect(detectFormat('photo.jpeg')).toBe('image');
  });

  it('detects image format for png', () => {
    expect(detectFormat('graphic.png')).toBe('image');
  });

  it('detects image format for webp', () => {
    expect(detectFormat('icon.webp')).toBe('image');
  });

  it('detects image format for tiff', () => {
    expect(detectFormat('scan.tiff')).toBe('image');
    expect(detectFormat('scan.tif')).toBe('image');
  });

  it('detects image format for bmp', () => {
    expect(detectFormat('diagram.bmp')).toBe('image');
  });

  it('detects image format for gif', () => {
    expect(detectFormat('animation.gif')).toBe('image');
  });

  it('returns null for unsupported extensions', () => {
    expect(detectFormat('document.docx')).toBeNull();
    expect(detectFormat('archive.zip')).toBeNull();
    expect(detectFormat('Makefile')).toBeNull();
  });

  it('is case-insensitive', () => {
    expect(detectFormat('PHOTO.PDF')).toBe('pdf');
    expect(detectFormat('img.JPEG')).toBe('image');
    expect(detectFormat('SCAN.TIFF')).toBe('image');
    expect(detectFormat('IMAGE.BMP')).toBe('image');
    expect(detectFormat('ANIM.GIF')).toBe('image');
  });
});

// ─── getFileName ─────────────────────────────────────────────────────────────

describe('getFileName', () => {
  it('extracts filename from a Unix path', () => {
    expect(getFileName('/Users/me/Documents/report.pdf')).toBe('report.pdf');
  });

  it('extracts filename from a Windows path', () => {
    expect(getFileName('C:\\Users\\me\\Documents\\report.pdf')).toBe('report.pdf');
  });

  it('returns the input as-is when there is no directory separator', () => {
    expect(getFileName('report.pdf')).toBe('report.pdf');
  });

  it('handles trailing slash gracefully (returns empty string, not a crash)', () => {
    // /path/to/dir/ → last segment is '' after split
    expect(getFileName('/some/dir/')).toBe('');
  });
});

// ─── FILE_SIZE_LIMIT_BYTES ────────────────────────────────────────────────────

describe('FILE_SIZE_LIMIT_BYTES', () => {
  it('equals exactly 100 MB (104857600 bytes)', () => {
    expect(FILE_SIZE_LIMIT_BYTES).toBe(100 * 1024 * 1024);
    expect(FILE_SIZE_LIMIT_BYTES).toBe(104857600);
  });
});

// ─── getFileSizeBytes ─────────────────────────────────────────────────────────

// Mock @tauri-apps/plugin-fs for getFileSizeBytes tests
vi.mock('@tauri-apps/plugin-fs', () => ({
  readFile: vi.fn(),
}));

afterEach(() => {
  vi.resetAllMocks();
});

describe('getFileSizeBytes', () => {
  it('returns the byteLength of the file read via readFile', async () => {
    const { readFile } = await import('@tauri-apps/plugin-fs');
    const fakeBytes = new Uint8Array(12345);
    vi.mocked(readFile).mockResolvedValue(fakeBytes);

    const size = await getFileSizeBytes('/some/file.pdf');
    expect(size).toBe(12345);
    expect(readFile).toHaveBeenCalledWith('/some/file.pdf');
  });

  it('returns 0 for an empty file', async () => {
    const { readFile } = await import('@tauri-apps/plugin-fs');
    vi.mocked(readFile).mockResolvedValue(new Uint8Array(0));

    const size = await getFileSizeBytes('/empty.pdf');
    expect(size).toBe(0);
  });

  it('returns FILE_SIZE_LIMIT_BYTES + 1 for a file that is just over the limit', async () => {
    const { readFile } = await import('@tauri-apps/plugin-fs');
    const overLimitBytes = new Uint8Array(FILE_SIZE_LIMIT_BYTES + 1);
    vi.mocked(readFile).mockResolvedValue(overLimitBytes);

    const size = await getFileSizeBytes('/huge.pdf');
    expect(size).toBe(FILE_SIZE_LIMIT_BYTES + 1);
    expect(size).toBeGreaterThan(FILE_SIZE_LIMIT_BYTES);
  });

  it('propagates readFile errors', async () => {
    const { readFile } = await import('@tauri-apps/plugin-fs');
    vi.mocked(readFile).mockRejectedValue(new Error('Permission denied'));

    await expect(getFileSizeBytes('/restricted.pdf')).rejects.toThrow('Permission denied');
  });
});
