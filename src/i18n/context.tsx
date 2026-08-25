import { useCallback, useSyncExternalStore, type ReactNode } from 'react';
import {
  getLocale, plural, setLocale as setLocaleStore, subscribe, t,
  type PluralKey, type TranslationKey,
} from '@/i18n';

/**
 * React binding for the translation store.
 *
 * The store itself is module-level (see i18n/index.ts) because a handful of
 * user-facing strings live outside components. This provider exists only to make
 * React re-render when the language changes — useSyncExternalStore subscribes to
 * the same store, so a change made anywhere, by a component or not, updates the
 * whole tree.
 */
export function I18nProvider({ children }: { children: ReactNode }) {
  // No context value: every consumer subscribes to the store directly, so there
  // is nothing to pass down and nothing to go stale between them.
  return <>{children}</>;
}

export interface Translator {
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
  plural: (key: PluralKey, count: number, vars?: Record<string, string | number>) => string;
  locale: string;
  setLocale: (locale: string) => void;
}

/**
 * Deliberately usable without a provider. During a migration that touches 82
 * files, a hook that throws when someone forgets the wrapper turns a missing
 * provider into a blank screen; this degrades to "correct text, no re-render on
 * language change" instead.
 */
export function useT(): Translator {
  const locale = useSyncExternalStore(subscribe, getLocale, getLocale);

  const setLocale = useCallback((next: string) => setLocaleStore(next), []);

  return { t, plural, locale, setLocale };
}
