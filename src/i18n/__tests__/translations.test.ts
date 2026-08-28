import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { en, type Dictionary } from '@/i18n/en';
import { de } from '@/i18n/de';
import { fr } from '@/i18n/fr';
import { es } from '@/i18n/es';
import { tr } from '@/i18n/tr';
import { it as itDict } from '@/i18n/it';
import { nl } from '@/i18n/nl';
import { pl } from '@/i18n/pl';
import { pt } from '@/i18n/pt';
import { t, plural, setLocale, resetI18n, registerDictionary, LOCALE_REVIEW } from '@/i18n';

/** Every translation, checked by the same rules. Adding one here covers it. */
const TRANSLATIONS: Array<[string, Dictionary]> = [
  ['de', de],
  ['fr', fr],
  ['es', es],
  ['tr', tr],
  ['it', itDict],
  ['nl', nl],
  ['pl', pl],
  ['pt', pt],
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

/**
 * The English source a translated key should be compared against.
 *
 * Languages with more plural categories than English carry keys English does not
 * have -- Polish needs `_few` and `_many` where English stops at `_one`/`_other`.
 * At runtime `plural()` falls back to `_other`, so that is the string those
 * variants have to match.
 */
function englishFor(key: string): string {
  const direct = (en as Record<string, string>)[key];
  if (direct !== undefined) return direct;

  const stem = key.replace(/_(zero|one|two|few|many|other)$/, '');
  return (en as Record<string, string>)[`${stem}_other`] ?? '';
}

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
      expect(tokens(translated), `placeholders differ for ${key}`).toEqual(tokens(englishFor(key)));
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
    const translated = Object.keys(dict).filter((key) => key in en);
    const coverage = translated.length / Object.keys(en).length;
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
    // A handful legitimately match: proper nouns (PDF, A4, Letter), and true
    // cognates -- French alone has Portrait, Image, Document, Format, Options,
    // Version, Orange. A large overlap would mean whole sections were skipped
    // rather than translated.
    //
    // A ratio, not a count. A fixed ceiling breaks every time a legitimately
    // identical word is added, and -- worse -- it silently weakens as the
    // dictionary grows: 30 of 200 keys is a problem, 30 of 800 is not. A copied
    // dictionary sits near 100%; the highest real one here is French at ~4.5%.
    const identical = (Object.entries(dict) as [keyof typeof en, string][])
      .filter(([key, value]) => value === en[key]);
    expect(identical.length / Object.keys(dict).length).toBeLessThan(0.1);
  });
});

describe('one name for one thing', () => {
  // The reported complaint was that the interface called the same thing by two
  // names. It did: Color and Colour, Favorites and Favourites, "Select pages"
  // and "Select Pages", "Loading..." and "Loading…", plus two outright duplicate
  // keys (confirmPassword2, startAt2). These pin the vocabulary down.

  const values = Object.entries(en) as [string, string][];

  it('[I18N-10] no English string is spelled two ways', () => {
    const byNormalised = new Map<string, Map<string, string[]>>();
    for (const [key, value] of values) {
      const normalised = value.toLowerCase().replace(/[.…:]+$/, '').trim();
      if (!normalised) continue;
      const forms = byNormalised.get(normalised) ?? new Map<string, string[]>();
      forms.set(value, [...(forms.get(value) ?? []), key]);
      byNormalised.set(normalised, forms);
    }

    // "Save" and "Save…" are a real distinction, not a slip: the ellipsis is the
    // long-standing convention for a control that opens a dialog rather than
    // acting immediately.
    const DELIBERATE = new Set(['save']);

    const inconsistent = [...byNormalised.entries()]
      .filter(([normalised, forms]) => forms.size > 1 && !DELIBERATE.has(normalised))
      .map(([, forms]) => [...forms.entries()].map(([v, keys]) => `${v} (${keys.join(', ')})`).join(' vs '));

    expect(inconsistent, 'same text, two spellings').toEqual([]);
  });

  it('[I18N-11] English copy uses one spelling convention', () => {
    // British throughout, because the copy already was in the places that
    // mattered -- "optimise", "recognise", "colour" -- and half a dictionary of
    // each is what produced the complaint.
    const AMERICAN = /\b(colors?|favorites?|organiz\w*|minimiz\w*|customiz\w*|recogniz\w*|optimiz\w*)\b/i;

    const offenders = values
      .filter(([, value]) => AMERICAN.test(value))
      .map(([key, value]) => `${key}: ${value}`);

    expect(offenders, 'American spelling in a British-English dictionary').toEqual([]);
  });

  it('[I18N-12] ellipses are the single character, never three dots', () => {
    // "Loading..." and "Loading…" are different strings to every lookup, and
    // three dots render narrower than the real glyph next to it in the same list.
    const offenders = values
      .filter(([, value]) => value.includes('...'))
      .map(([key, value]) => `${key}: ${value}`);

    expect(offenders, 'three dots instead of …').toEqual([]);
  });

  // ─── I18N-07 — entities are not characters ─────────────────────────────────
  //
  // `t()` returns a plain string, and React renders a string into a text node
  // verbatim. An HTML entity in a dictionary therefore reaches the user as its
  // literal source: the favourites hint read
  //
  //   Click ⠿ to reorder &middot; Click &#9733; on any tool to add
  //
  // on screen, in all nine languages. JSX would have decoded those, which is
  // presumably where they came from — the key is still called
  // `dashboard.clickToReorderMiddotClick`. Once the copy moved into the
  // dictionary, nothing decoded anything.
  //
  // Checked across English and every translation, because the entities were
  // carried into all of them by the same extraction.

  const HTML_ENTITY = /&(?:[a-zA-Z][a-zA-Z0-9]{1,9}|#[0-9]{1,6}|#x[0-9a-fA-F]{1,6});/;

  it('[I18N-07] no dictionary ships an HTML entity', () => {
    const offenders: string[] = [];
    for (const [name, dict] of [['en', en] as [string, Dictionary], ...TRANSLATIONS]) {
      for (const [key, value] of Object.entries(dict)) {
        if (typeof value === 'string' && HTML_ENTITY.test(value)) {
          offenders.push(`${name}.${key}: ${value}`);
        }
      }
    }
    expect(offenders, `these render as literal source text:\n${offenders.join('\n')}`).toEqual([]);
  });
});
