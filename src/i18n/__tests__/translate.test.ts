import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { en } from '@/i18n/en';
import {
  t, plural, setLocale, getLocale, registerDictionary, resetI18n,
} from '@/i18n';

// ─── i18n core (I18N-01) ─────────────────────────────────────────────────────
//
// Built rather than installed (no react-i18next): a typed dictionary, a lookup
// and the platform's Intl. These tests use a stub second language, because the
// whole point of F13a is that the plumbing works before any real translation
// exists — a framework that only ever sees one language proves nothing.

const XX = {
  'common.cancel': 'ZZcancel',
  'file.tooLarge': 'ZZ too large: {size}',
  'count.redaction_one': 'ZZ {count} redaction',
  'count.redaction_other': 'ZZ {count} redactions',
} as const;

beforeEach(() => {
  resetI18n();
  registerDictionary('xx', XX);
});
afterEach(resetI18n);

describe('t', () => {
  it('[I18N-01a] returns English by default', () => {
    expect(t('common.cancel')).toBe(en['common.cancel']);
  });

  it('[I18N-01b] returns the active language once one is selected', () => {
    setLocale('xx');
    expect(t('common.cancel')).toBe('ZZcancel');
  });

  it('[I18N-01c] falls back to English for a key the language is missing', () => {
    // The acceptance criterion: a missing key must render English, never the key
    // itself. A user seeing "common.cancel" on a button is worse than English.
    setLocale('xx');
    expect(t('common.save')).toBe(en['common.save']);
    expect(t('common.save')).not.toContain('common.save');
  });

  it('[I18N-01d] interpolates variables into either language', () => {
    expect(t('file.tooLarge', { size: '105 MB' })).toContain('105 MB');
    setLocale('xx');
    expect(t('file.tooLarge', { size: '105 MB' })).toBe('ZZ too large: 105 MB');
  });

  it('[I18N-01e] leaves an unknown placeholder visible rather than printing undefined', () => {
    // Silently rendering "undefined" to a user is worse than an obvious {token}.
    expect(t('file.tooLarge', {})).toContain('{size}');
  });

  it('[I18N-01f] never renders a raw key, even for one that does not exist', () => {
    // @ts-expect-error — deliberately off the typed key set
    expect(t('nope.not.a.key')).toBe('');
  });
});

describe('plural', () => {
  it('[I18N-01g] picks the English singular and plural forms', () => {
    expect(plural('count.redaction', 1)).toBe('1 redaction');
    expect(plural('count.redaction', 2)).toBe('2 redactions');
    expect(plural('count.redaction', 0)).toBe('0 redactions');
  });

  it('[I18N-01h] uses the active language forms', () => {
    setLocale('xx');
    expect(plural('count.redaction', 1)).toBe('ZZ 1 redaction');
    expect(plural('count.redaction', 3)).toBe('ZZ 3 redactions');
  });

  it('[I18N-01i] falls back to English when the language lacks the form', () => {
    registerDictionary('yy', { 'common.cancel': 'YY' });
    setLocale('yy');
    expect(plural('count.redaction', 2)).toBe('2 redactions');
  });

  it('[I18N-01m] rejects a key that has no plural forms, at compile time', () => {
    // PluralKey is derived from the dictionary's _other entries, so asking for a
    // plural of a singular key cannot compile. The runtime check below only
    // documents what the type already prevents.
    // @ts-expect-error — 'common.cancel' has no _one/_other pair
    expect(plural('common.cancel', 2)).toBe('');
  });

  it('[I18N-01j] uses Intl.PluralRules, not an n === 1 guess', () => {
    // Turkish has no separate singular category for this purpose; a hand-rolled
    // "n === 1 ? singular : plural" would be wrong the moment a real language
    // arrives. Registering a Turkish stub with only _other must still resolve.
    registerDictionary('tr', { 'count.redaction_other': '{count} karartma' });
    setLocale('tr');
    expect(plural('count.redaction', 1)).toBe('1 karartma');
    expect(plural('count.redaction', 5)).toBe('5 karartma');
  });
});

describe('locale state', () => {
  it('[I18N-01k] starts at English and reports the active locale', () => {
    expect(getLocale()).toBe('en');
    setLocale('xx');
    expect(getLocale()).toBe('xx');
  });

  it('[I18N-01l] ignores a locale nobody registered, staying on English', () => {
    setLocale('zz');
    expect(getLocale()).toBe('en');
    expect(t('common.cancel')).toBe(en['common.cancel']);
  });
});

describe('document language', () => {
  it('[I18N-09a] setLocale works with no DOM at all', () => {
    // This suite runs in the node environment on purpose: the module is imported
    // by pdfUtils and fileValidation, which have no document. setLocale writes
    // <html lang> and must not assume it can. The DOM half is I18N-09b, in
    // context.test.tsx.
    expect(typeof document).toBe('undefined');
    expect(() => setLocale('en')).not.toThrow();
  });
});
