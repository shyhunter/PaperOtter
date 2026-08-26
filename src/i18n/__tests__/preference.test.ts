// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolveInitialLocale, rememberLocale, LOCALE_KEY } from '@/i18n/preference';
import { registerDictionary, resetI18n } from '@/i18n';

// The store instance is created at module scope, so the mock has to read mutable
// state rather than be swapped per test.
const storeState = {
  value: null as string | null,
  throws: false,
  set: vi.fn(async (_key: string, _value: string) => {}),
  save: vi.fn(async () => {}),
};
vi.mock('@tauri-apps/plugin-store', () => ({
  LazyStore: class {
    async get() {
      if (storeState.throws) throw new Error('unreadable');
      return storeState.value ?? undefined;
    }
    async set(k: string, v: string) { return storeState.set(k, v); }
    async save() { return storeState.save(); }
  },
}));

// ─── Language preference (I18N-05) ───────────────────────────────────────────
//
// The brief: follow the OS language on first run, with an explicit override that
// is remembered across sessions. Both halves matter — someone whose Mac is in
// German should not have to find a setting, and someone who deliberately chose
// English should not be overruled by their OS every launch.

const setStored = (value: string | null) => {
  storeState.value = value;
  storeState.throws = false;
};
const setOsLanguages = (langs: string[]) =>
  vi.stubGlobal('navigator', { languages: langs, language: langs[0] });

beforeEach(() => {
  storeState.value = null;
  storeState.throws = false;
  storeState.set.mockClear();
  storeState.save.mockClear();
  resetI18n();
  registerDictionary('de', { 'common.cancel': 'Abbrechen' });
  registerDictionary('fr', { 'common.cancel': 'Annuler' });
});
afterEach(() => { vi.unstubAllGlobals(); resetI18n(); });

describe('resolveInitialLocale', () => {
  it('[I18N-05a] follows the OS language on first run', async () => {
    setStored(null);
    setOsLanguages(['de-DE', 'en-US']);
    expect(await resolveInitialLocale()).toBe('de');
  });

  it('[I18N-05b] matches on the language, not the region', async () => {
    // de-AT and de-CH are German speakers; the app has one German.
    setStored(null);
    setOsLanguages(['de-AT']);
    expect(await resolveInitialLocale()).toBe('de');
  });

  it('[I18N-05c] falls back to English for a language we do not have', async () => {
    setStored(null);
    setOsLanguages(['ja-JP']);
    expect(await resolveInitialLocale()).toBe('en');
  });

  it('[I18N-05d] walks the OS preference order rather than taking only the first', async () => {
    // macOS lets people rank languages; someone with Japanese first and German
    // second should get German rather than English.
    setStored(null);
    setOsLanguages(['ja-JP', 'de-DE', 'fr-FR']);
    expect(await resolveInitialLocale()).toBe('de');
  });

  it('[I18N-05e] a remembered choice wins over the OS', async () => {
    // Choosing English on a German Mac must survive a restart.
    setStored('en');
    setOsLanguages(['de-DE']);
    expect(await resolveInitialLocale()).toBe('en');
  });

  it('[I18N-05f] ignores a remembered language that no longer exists', async () => {
    // A locale removed from a later build must not leave the UI blank.
    setStored('xx');
    setOsLanguages(['fr-FR']);
    expect(await resolveInitialLocale()).toBe('fr');
  });

  it('[I18N-05g] survives a store that cannot be read', async () => {
    storeState.throws = true;
    setOsLanguages(['de-DE']);
    expect(await resolveInitialLocale()).toBe('de');
  });
});

describe('rememberLocale', () => {
  it('[I18N-05h] writes the choice and flushes it, so a crash does not lose it', async () => {
    await rememberLocale('de');

    expect(storeState.set).toHaveBeenCalledWith(LOCALE_KEY, 'de');
    expect(storeState.save).toHaveBeenCalled();
  });
});
