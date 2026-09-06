/**
 * [WIN] A file name on Windows is not "everything after the last forward slash".
 *
 * Reported from a real Windows build: PDF to JPG produced a 12.8 MB ZIP that
 * Explorer showed as empty and refused to extract, calling it invalid. The bytes
 * were all there. The entry names were not:
 *
 *   C:\Users\you\Desktop\BMW Geschaeftsbericht 2025-page-001.jpg
 *
 * A ZIP entry name must be relative and use forward slashes, so an absolute
 * Windows path with a drive letter makes the whole archive unreadable.
 *
 * The cause was a pattern repeated in 22 files:
 *
 *   path.split('/').pop() ?? path.split('\\').pop() ?? path
 *
 * `??` only falls through on null or undefined, and `split().pop()` on a
 * non-empty string never returns either. On Windows the first branch returns the
 * entire path, so the backslash branch it was written for was unreachable.
 */
import { describe, it, expect } from 'vitest';
import { getFileName } from '@/lib/fileValidation';

describe('getFileName', () => {
  it('[WIN-01] takes the basename of a Windows path', () => {
    expect(getFileName('C:\\Users\\you\\Desktop\\report 2025.pdf')).toBe('report 2025.pdf');
  });

  it('[WIN-02] takes the basename of a POSIX path', () => {
    expect(getFileName('/Users/you/Desktop/report 2025.pdf')).toBe('report 2025.pdf');
  });

  it('[WIN-03] handles a UNC share', () => {
    expect(getFileName('\\\\server\\share\\report.pdf')).toBe('report.pdf');
  });

  it('[WIN-04] leaves a bare file name alone', () => {
    expect(getFileName('report.pdf')).toBe('report.pdf');
  });

  it('[WIN-05] keeps non-ASCII names intact', () => {
    expect(getFileName('C:\\Users\\you\\BMW Geschäftsbericht 2025.pdf'))
      .toBe('BMW Geschäftsbericht 2025.pdf');
  });

  /* The exact expression that shipped, kept as an executable record of why it
     was wrong: on a Windows path it returns the whole thing. */
  it('[WIN-06] the old inline pattern returned the entire Windows path', () => {
    const p = 'C:\\Users\\you\\Desktop\\report.pdf';
    const old = p.split('/').pop() ?? p.split('\\').pop() ?? p;
    expect(old).toBe(p);
    expect(getFileName(p)).not.toBe(p);
  });
});
