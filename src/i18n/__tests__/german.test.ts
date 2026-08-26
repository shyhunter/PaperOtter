import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { en } from '@/i18n/en';
import { de } from '@/i18n/de';
import { t, plural, setLocale, resetI18n } from '@/i18n';

// ─── German (I18N-06) ────────────────────────────────────────────────────────
//
// The first real translation, and the thing that proves F13a's plumbing was
// built for more than one language.

beforeEach(resetI18n);
afterEach(resetI18n);

/** Strings that tell the user something is destroyed, lost or has failed. */
const SAFETY = /permanent|cannot be undone|destroy|remove|delete|overwrit|lost|irrevers|password|redact|corrupt|fail|not a valid|too large|empty/i;

describe('German dictionary', () => {
  it('[I18N-06a] renders German once selected', () => {
    setLocale('de');
    expect(t('common.cancel')).toBe('Abbrechen');
    expect(t('common.save')).toBe('Speichern');
  });

  it('[I18N-06b] falls back to English for anything untranslated', () => {
    // Product names are deliberately absent so they stay identical.
    setLocale('de');
    expect(t('pdfToJpgFlow.calibre')).toBe(en['pdfToJpgFlow.calibre']);
  });

  it('[I18N-06c] plurals work in German', () => {
    setLocale('de');
    expect(plural('count.page', 1)).toBe('1 Seite');
    expect(plural('count.page', 5)).toBe('5 Seiten');
    expect(plural('count.file', 1)).toBe('1 Datei');
    expect(plural('count.file', 3)).toBe('3 Dateien');
  });

  it('[I18N-06d] keeps every placeholder the English string has', () => {
    // A dropped {count} renders a sentence missing its number; a renamed one
    // renders the token itself. Both look like the app is broken.
    const tokens = (s: string) => (s.match(/\{(\w+)\}/g) ?? []).sort();
    for (const [key, german] of Object.entries(de) as [keyof typeof en, string][]) {
      expect(tokens(german), `placeholders differ for ${key}`).toEqual(tokens(en[key]));
    }
  });

  it('[I18N-06e] translates every safety-critical string', () => {
    // These are the sentences the brief warns about: a subtly wrong "this
    // permanently removes content" is worse than English. Leaving one in English
    // is safe; leaving one HALF translated is not, so they are all-or-nothing.
    const untranslated = Object.entries(en)
      .filter(([key, value]) => SAFETY.test(value) && !(key in de))
      .map(([key]) => key);

    expect(untranslated, 'safety copy left untranslated').toEqual([]);
  });

  it('[I18N-06f] covers nearly all of the interface', () => {
    const coverage = Object.keys(de).length / Object.keys(en).length;
    expect(coverage).toBeGreaterThan(0.95);
  });

  it('[I18N-06g] never leaves a German string identical to English by accident', () => {
    // A handful legitimately match (Format, System, Web). A large overlap would
    // mean whole sections were skipped rather than translated.
    const identical = (Object.entries(de) as [keyof typeof en, string][])
      .filter(([key, value]) => value === en[key]);
    expect(identical.length).toBeLessThan(20);
  });
});
