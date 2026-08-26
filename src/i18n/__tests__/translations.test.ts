import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { en, type Dictionary } from '@/i18n/en';
import { de } from '@/i18n/de';
import { fr } from '@/i18n/fr';
import { es } from '@/i18n/es';
import { tr } from '@/i18n/tr';
import { it as itDict } from '@/i18n/it';
import { t, plural, setLocale, resetI18n, registerDictionary, LOCALE_REVIEW } from '@/i18n';

/** Every translation, checked by the same rules. Adding one here covers it. */
const TRANSLATIONS: Array<[string, Dictionary]> = [
  ['de', de],
  ['fr', fr],
  ['es', es],
  ['tr', tr],
  ['it', itDict],
];

// ─── Translations (I18N-06) ──────────────────────────────────────────────────
//
// Rules applied to every language, not just the first. What a test can check is
// structure: that placeholders survive, that nothing safety-critical was skipped,
// that plurals resolve. Whether the prose reads well is a human's job, which is
// why LOCALE_REVIEW records who has actually checked each one.

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

  it('[I18N-06j] a language with more than two plural forms can express them', () => {
    // Polish has one / few / many: 1 strona, 2 strony, 5 stron. English needs
    // only _one and _other, so the dictionary type has to allow categories
    // English never uses — otherwise Polish silently falls back to _other and
    // renders "2 stron", which is wrong.
    registerDictionary('pl', {
      'count.page_one': '{count} strona',
      'count.page_few': '{count} strony',
      'count.page_many': '{count} stron',
      'count.page_other': '{count} strony',
    });
    setLocale('pl');
    expect(plural('count.page', 1)).toBe('1 strona');
    expect(plural('count.page', 2)).toBe('2 strony');
    expect(plural('count.page', 5)).toBe('5 stron');
    expect(plural('count.page', 22)).toBe('22 strony');
  });

  it('[I18N-06i] Turkish does not pluralise a noun after a number', () => {
    // "5 sayfalar" is wrong Turkish; "5 sayfa" is correct. Any hand-rolled
    // n === 1 ? singular : plural would produce the wrong form here, which is
    // the whole reason plural() goes through Intl.PluralRules.
    setLocale('tr');
    expect(plural('count.page', 1)).toBe('1 sayfa');
    expect(plural('count.page', 5)).toBe('5 sayfa');
    expect(plural('count.file', 12)).toBe('12 dosya');
  });

  it('[I18N-06c] plurals work in German', () => {
    setLocale('de');
    expect(plural('count.page', 1)).toBe('1 Seite');
    expect(plural('count.page', 5)).toBe('5 Seiten');
    expect(plural('count.file', 1)).toBe('1 Datei');
    expect(plural('count.file', 3)).toBe('3 Dateien');
  });

  it.each(TRANSLATIONS)('[I18N-06d] %s keeps every placeholder the English string has', (_locale, dict) => {
    // A dropped {count} renders a sentence missing its number; a renamed one
    // renders the token itself. Both look like the app is broken.
    const tokens = (s: string) => (s.match(/\{(\w+)\}/g) ?? []).sort();
    for (const [key, translated] of Object.entries(dict) as [keyof typeof en, string][]) {
      expect(tokens(translated), `placeholders differ for ${key}`).toEqual(tokens(en[key]));
    }
  });

  it.each(TRANSLATIONS)('[I18N-06e] %s translates every safety-critical string', (_locale, dict) => {
    // These are the sentences the brief warns about: a subtly wrong "this
    // permanently removes content" is worse than English. Leaving one in English
    // is safe; leaving one HALF translated is not, so they are all-or-nothing.
    const untranslated = Object.entries(en)
      .filter(([key, value]) => SAFETY.test(value) && !(key in dict))
      .map(([key]) => key);

    expect(untranslated, 'safety copy left untranslated').toEqual([]);
  });

  it.each(TRANSLATIONS)('[I18N-06f] %s covers nearly all of the interface', (_locale, dict) => {
    const coverage = Object.keys(dict).length / Object.keys(en).length;
    expect(coverage).toBeGreaterThan(0.9);
  });

  it('[I18N-06h] every registered language has a recorded review status', () => {
    // The brief calls an unchecked translation "a liability that cannot be seen".
    // This is what makes it visible: a new language cannot be added without
    // stating whether a human has read it.
    for (const [locale] of TRANSLATIONS) {
      expect(LOCALE_REVIEW[locale], `no review status for ${locale}`).toBeDefined();
    }
    expect(LOCALE_REVIEW.en).toBe('source');
  });

  it.each(TRANSLATIONS)('[I18N-06g] %s is not silently identical to English', (_locale, dict) => {
    // A handful legitimately match (Format, System, Web, Orange). A large overlap
    // would mean whole sections were skipped rather than translated.
    const identical = (Object.entries(dict) as [keyof typeof en, string][])
      .filter(([key, value]) => value === en[key]);
    expect(identical.length).toBeLessThan(30);
  });
});
