import { describe, it, expect, vi, beforeEach } from 'vitest';
import { exists } from '@tauri-apps/plugin-fs';
import { uniqueOutputPath, joinPath } from '@/lib/outputPath';

// ─── Non-destructive output naming (BATCH-01a) ───────────────────────────────
//
// Writing a batch into a folder currently calls writeFile() straight onto the
// chosen path. Splitting the same PDF into the same folder twice destroys the
// first set with no warning — a live bug, not only an F11 requirement.
//
// The rule: never overwrite, never stall waiting for an answer, and always be
// able to say what was renamed.

const existing = (...paths: string[]) => {
  const set = new Set(paths);
  vi.mocked(exists).mockImplementation(async (p) => set.has(p as string));
};

beforeEach(() => vi.mocked(exists).mockReset());

describe('uniqueOutputPath', () => {
  it('[BATCH-01a] uses the plain name when nothing is in the way', async () => {
    existing();
    expect(await uniqueOutputPath('/out', 'scan.pdf')).toBe('/out/scan.pdf');
  });

  it('[BATCH-01b] suffixes rather than overwriting an existing file', async () => {
    existing('/out/scan.pdf');
    expect(await uniqueOutputPath('/out', 'scan.pdf')).toBe('/out/scan (2).pdf');
  });

  it('[BATCH-01c] keeps counting past several collisions', async () => {
    existing('/out/scan.pdf', '/out/scan (2).pdf', '/out/scan (3).pdf');
    expect(await uniqueOutputPath('/out', 'scan.pdf')).toBe('/out/scan (4).pdf');
  });

  it('[BATCH-01d] puts the suffix before the extension, not after it', async () => {
    // "scan.pdf (2)" would not open by double-click — the OS needs the extension last.
    existing('/out/scan.pdf');
    expect(await uniqueOutputPath('/out', 'scan.pdf')).toMatch(/\.pdf$/);
  });

  it('[BATCH-01e] handles a name with several dots', async () => {
    existing('/out/holiday.photo.v2.jpg');
    expect(await uniqueOutputPath('/out', 'holiday.photo.v2.jpg'))
      .toBe('/out/holiday.photo.v2 (2).jpg');
  });

  it('[BATCH-01f] handles a name with no extension at all', async () => {
    existing('/out/README');
    expect(await uniqueOutputPath('/out', 'README')).toBe('/out/README (2)');
  });

  it('[BATCH-01g] does not double-suffix a name that already ends in a counter', async () => {
    existing('/out/scan (2).pdf');
    expect(await uniqueOutputPath('/out', 'scan (2).pdf')).toBe('/out/scan (2) (2).pdf');
  });

  it('[BATCH-01h] reserves names within one batch, before anything is written', async () => {
    // Two inputs in the same batch can produce the same output name. Nothing has
    // been written to disk yet, so exists() cannot see the clash — the batch has
    // to remember what it already promised.
    existing();
    const taken = new Set<string>();
    const first = await uniqueOutputPath('/out', 'scan.pdf', taken);
    const second = await uniqueOutputPath('/out', 'scan.pdf', taken);
    expect(first).toBe('/out/scan.pdf');
    expect(second).toBe('/out/scan (2).pdf');
  });

  it('[BATCH-01i] gives up rather than looping forever', async () => {
    vi.mocked(exists).mockResolvedValue(true); // everything collides
    await expect(uniqueOutputPath('/out', 'scan.pdf')).rejects.toThrow(/could not find/i);
  });
});

/**
 * [SAVE] A batch save must build paths for the platform it is running on.
 *
 * Reported from a real Windows build: saving 238 pages from PDF to JPG into a
 * folder failed with "could not write files", while saving a single file to the
 * same folder worked. A single save takes its path from the dialog, which
 * returns a well-formed one; only the batch built its own, with a hardcoded "/",
 * so every path it produced looked like
 * `C:\Users\you\Desktop/page-001.jpg`.
 */
describe('joinPath', () => {
  it('[SAVE-01] uses a backslash for a Windows directory', () => {
    expect(joinPath('C:\\Users\\you\\Desktop', 'page-001.jpg'))
      .toBe('C:\\Users\\you\\Desktop\\page-001.jpg');
  });

  it('[SAVE-02] uses a forward slash for a POSIX directory', () => {
    expect(joinPath('/Users/you/Desktop', 'page-001.jpg'))
      .toBe('/Users/you/Desktop/page-001.jpg');
  });

  it('[SAVE-03] handles a UNC share', () => {
    expect(joinPath('\\\\server\\share\\out', 'a.jpg'))
      .toBe('\\\\server\\share\\out\\a.jpg');
  });

  it('[SAVE-04] does not double the separator when the directory ends in one', () => {
    expect(joinPath('C:\\out\\', 'a.jpg')).toBe('C:\\out\\a.jpg');
    expect(joinPath('/out/', 'a.jpg')).toBe('/out/a.jpg');
  });

  it('[SAVE-05] leaves a Windows drive path that already uses forward slashes alone', () => {
    expect(joinPath('C:/Users/you', 'a.jpg')).toBe('C:/Users/you/a.jpg');
  });
});
