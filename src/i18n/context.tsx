import { useCallback, useSyncExternalStore } from 'react';
import {
  getLocale, plural, setLocale as setLocaleStore, subscribe, t,
  type PluralKey, type TranslationKey,
} from '@/i18n';

/**
 * React binding for the translation store.
 *
 * Components call the module-level `t()` directly and do not subscribe — adding
 * a hook to every one of 82 components, including nested render helpers and
 * early returns, is the invasive cost F13a exists to avoid. What makes that
 * correct is `useLocale()` being called once at the root: on a language change
 * the root re-renders, recreates its element tree, and every descendant renders
 * again with the new strings.
 *
 * It has to be the root component that *builds* the tree, not a wrapper around
 * it. A `<I18nProvider>{children}</I18nProvider>` does not work: `children` is
 * the same element reference on every render, so React bails out of the subtree
 * and the whole UI silently goes stale. That was the first shape of this file
 * and I18N-03e is what caught it.
 *
 * The exception is a React.memo boundary, which blocks the re-render regardless.
 * The four in this codebase (EditorCanvas, CompareCanvas, PagePanelThumbnail,
 * LazyPageThumbnail) all render images rather than text. A memoised component
 * showing translated text would need its own useLocale() to subscribe.
 */
export function useLocale(): string {
  return useSyncExternalStore(subscribe, getLocale, getLocale);
}

export interface Translator {
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
  plural: (key: PluralKey, count: number, vars?: Record<string, string | number>) => string;
  locale: string;
  setLocale: (locale: string) => void;
}

/**
 * For the places that need the locale itself or need to change it — the language
 * picker in F13b, and any memoised component displaying text. Ordinary
 * components should import `t` from '@/i18n' instead.
 */
export function useT(): Translator {
  const locale = useLocale();
  const setLocale = useCallback((next: string) => setLocaleStore(next), []);
  return { t, plural, locale, setLocale };
}
