import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { formatBytes } from '@/lib/pdfUtils';
import { setLocale, registerDictionary, resetI18n } from '@/i18n';

// ─── Locale-aware sizes (I18N-02) ────────────────────────────────────────────
//
// formatBytes hardcoded "." as the decimal separator, which is wrong in both
// German and Turkish — "2.50 MB" reads as two-and-a-half thousand megabytes to a
// German speaker. Intl.NumberFormat fixes it, but only if the locale is passed
// explicitly: left to default it follows the *system* locale, so an English UI
// on a German machine would silently start printing "2,50 MB".

beforeEach(() => {
  resetI18n();
  registerDictionary('de', {});
  registerDictionary('tr', {});
});
afterEach(resetI18n);

describe('formatBytes', () => {
  it('[I18N-02a] is unchanged in English', () => {
    expect(formatBytes(0)).toBe('');
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(512 * 1024)).toBe('512.0 KB');
    expect(formatBytes(1024 ** 2)).toBe('1.00 MB');
    expect(formatBytes(2.5 * 1024 ** 2)).toBe('2.50 MB');
    expect(formatBytes(1024 ** 3)).toBe('1.00 GB');
  });

  it('[I18N-02b] uses the comma separator German and Turkish actually write', () => {
    setLocale('de');
    expect(formatBytes(2.5 * 1024 ** 2)).toBe('2,50 MB');
    setLocale('tr');
    expect(formatBytes(2.5 * 1024 ** 2)).toBe('2,50 MB');
  });

  it('[I18N-02c] follows the app language, not the machine locale', () => {
    // The regression this guards: Intl.NumberFormat() with no locale argument
    // reads the host's locale, so an English UI on a German laptop would print
    // "2,50 MB" — and CI would never see it.
    setLocale('en');
    expect(formatBytes(2.5 * 1024 ** 2)).toBe('2.50 MB');
  });

  it('[I18N-02d] keeps the KB/MB/GB thresholds and precision it always had', () => {
    expect(formatBytes(1024 ** 2 - 1)).toMatch(/KB$/);
    expect(formatBytes(1024 ** 3 - 1)).toMatch(/MB$/);
    expect(formatBytes(1.5 * 1024 ** 3)).toBe('1.50 GB');
  });
});
