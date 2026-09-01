import { describe, it, expect } from 'vitest';
import { suggestedSavePath } from '@/lib/outputPath';

/**
 * [SAVE-DIR] Save as… opens where the document came from.
 *
 * `defaultPath` was a bare filename with no directory at all, so the dialog had
 * nothing to say about *where*. macOS hid that — its panel remembers the last
 * folder you used — but a bare name leaves the location entirely to the
 * platform, which on Linux can mean the process working directory. In
 * `tauri dev` that is `src-tauri/`, i.e. inside the project.
 *
 * The folder the user opened the document from is the one place a copy almost
 * always belongs, and it is the one the app already knows.
 */
describe('suggestedSavePath', () => {
  it('[SAVE-DIR-01] puts the suggested name in the folder the document came from', () => {
    expect(suggestedSavePath('/home/me/qa/scan.pdf', 'scan-rotated.pdf'))
      .toBe('/home/me/qa/scan-rotated.pdf');
  });

  it('[SAVE-DIR-02] keeps Windows separators rather than mixing them', () => {
    // A path that reads C:\Users\me/out.pdf is the kind of thing that works
    // until something splits on the separator it did not expect.
    expect(suggestedSavePath('C:\\Users\\me\\Documents\\scan.pdf', 'scan-rotated.pdf'))
      .toBe('C:\\Users\\me\\Documents\\scan-rotated.pdf');
  });

  it('[SAVE-DIR-03] falls back to the bare name when there is no source path', () => {
    // Some flows genuinely have nowhere to start from. A bare name is what the
    // dialog got before, so this is the old behaviour, kept for that case only.
    expect(suggestedSavePath(null, 'merged.pdf')).toBe('merged.pdf');
    expect(suggestedSavePath(undefined, 'merged.pdf')).toBe('merged.pdf');
  });

  it('[SAVE-DIR-04] a source with no directory yields the bare name', () => {
    expect(suggestedSavePath('scan.pdf', 'scan-rotated.pdf')).toBe('scan-rotated.pdf');
  });

  it('[SAVE-DIR-05] a file at the filesystem root keeps its single separator', () => {
    expect(suggestedSavePath('/scan.pdf', 'scan-rotated.pdf')).toBe('/scan-rotated.pdf');
  });

  it('[SAVE-DIR-06] the suggested name is never joined onto another name', () => {
    // The name comes from the caller and is always a filename. Guarding it here
    // so a caller that ever passes a path cannot produce a nested one.
    expect(suggestedSavePath('/home/me/qa/scan.pdf', 'sub/other.pdf'))
      .toBe('/home/me/qa/other.pdf');
  });
});
