import { en, type Dictionary, type PluralKey, type TranslationKey } from '@/i18n/en';
import { de } from '@/i18n/de';
import { fr } from '@/i18n/fr';
import { es } from '@/i18n/es';
import { tr } from '@/i18n/tr';
import { it } from '@/i18n/it';
import { nl } from '@/i18n/nl';
import { pl } from '@/i18n/pl';
import { pt } from '@/i18n/pt';

export { en };
export type { Dictionary, PluralKey, TranslationKey };

/**
 * A tiny translation layer, built rather than installed.
 *
 * react-i18next would add a dependency and a bundle for what is, at this size,
 * a lookup with a fallback. What is genuinely hard about translation comes from
 * the platform and is used directly: Intl.PluralRules for plural categories,
 * Intl.NumberFormat for decimal separators.
 *
 * The active locale lives in module state rather than only in React context, so
 * that the handful of user-facing strings outside components (pdfUtils,
 * pdfProcessor, fileValidation) can reach it too. The React provider keeps the
 * two in step and re-renders on change.
 */

const dictionaries = new Map<string, Dictionary>([
  ['en', en],
  ['de', de],
  ['fr', fr],
  ['es', es],
  ['tr', tr],
  ['it', it],
  ['nl', nl],
  ['pl', pl],
  ['pt', pt],
]);

/**
 * Whether a translation has been checked by someone who speaks the language.
 *
 * The brief is blunt about why this is tracked rather than assumed: Papercut's
 * copy resists machine translation, and a subtly wrong redaction warning in a
 * privacy tool is worse than English. An unchecked translation is "a liability
 * that cannot be seen" — so it is written down.
 *
 * 'source'     — the language the copy was written in.
 * 'reviewed'   — a speaker has read it against the interface.
 * 'unreviewed' — produced but not yet checked by a human.
 */
export type ReviewStatus = 'source' | 'reviewed' | 'unreviewed';

export const LOCALE_REVIEW: Record<string, ReviewStatus> = {
  en: 'source',
  de: 'unreviewed', // maintainer review pending — TEST_PLAN REL-04a
  fr: 'unreviewed', // no French reviewer yet — TEST_PLAN REL-04b
  es: 'unreviewed',
  tr: 'unreviewed', // maintainer can verify Turkish — TEST_PLAN REL-04a
  it: 'unreviewed',
  nl: 'unreviewed',
  pl: 'unreviewed',
  pt: 'unreviewed',
};

let currentLocale = 'en';
const listeners = new Set<() => void>();

/** Locales that have a dictionary registered, English always among them. */
export function availableLocales(): string[] {
  return [...dictionaries.keys()];
}

export function registerDictionary(locale: string, dictionary: Dictionary): void {
  dictionaries.set(locale, dictionary);
}

export function getLocale(): string {
  return currentLocale;
}

/**
 * Switches language. A locale with no dictionary is ignored rather than
 * accepted, so the app can never end up in a state where every string is a
 * fallback and the picker claims otherwise.
 */
export function setLocale(locale: string): void {
  if (!dictionaries.has(locale)) return;
  currentLocale = locale;
  listeners.forEach((fn) => fn());
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Test seam: back to a clean English-only state. */
export function resetI18n(): void {
  dictionaries.clear();
  dictionaries.set('en', en);
  dictionaries.set('de', de);
  dictionaries.set('fr', fr);
  dictionaries.set('es', es);
  dictionaries.set('tr', tr);
  dictionaries.set('it', it);
  dictionaries.set('nl', nl);
  dictionaries.set('pl', pl);
  dictionaries.set('pt', pt);
  currentLocale = 'en';
  listeners.clear();
}

function lookup(key: string): string | undefined {
  return (
    (dictionaries.get(currentLocale) as Record<string, string> | undefined)?.[key] ??
    (en as Record<string, string>)[key]
  );
}

/**
 * Replaces {name} placeholders. An unmatched placeholder is left as-is rather
 * than rendered as "undefined" — an obvious {size} in the UI is a bug report,
 * "undefined" is a mystery.
 */
function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in vars ? String(vars[name]) : whole,
  );
}

export function t(key: TranslationKey, vars?: Record<string, string | number>): string {
  const template = lookup(key);
  // An unknown key means a bad cast, since the type system covers the rest.
  // Render nothing rather than leaking "some.key" into the interface.
  if (template === undefined) return '';
  return interpolate(template, vars);
}

/**
 * Plural-aware lookup. `key` is the stem: `plural('redaction.count', 2)` reads
 * `redaction.count_other`.
 *
 * Categories come from Intl.PluralRules, not from `n === 1`. English happens to
 * need only one/other, but Turkish, German and Slavic languages disagree with
 * each other about which counts share a form, and hardcoding English's answer is
 * exactly the assumption that makes a framework need rewriting at the first real
 * translation.
 */
export function plural(
  key: PluralKey,
  count: number,
  vars?: Record<string, string | number>,
): string {
  const category = new Intl.PluralRules(currentLocale).select(count);
  const active = dictionaries.get(currentLocale) as Record<string, string> | undefined;
  const enAll = en as Record<string, string>;

  const template =
    active?.[`${key}_${category}`] ??
    active?.[`${key}_other`] ??
    enAll[`${key}_${category}`] ??
    enAll[`${key}_other`];

  if (template === undefined) return '';
  return interpolate(template, { count, ...vars });
}

/**
 * Number formatting bound to the app language rather than the host's.
 * Intl.NumberFormat() with no locale follows the operating system, which would
 * put a German decimal comma into an English interface on a German machine.
 */
export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(currentLocale, options).format(value);
}
