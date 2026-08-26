import { LazyStore } from '@tauri-apps/plugin-store';
import { availableLocales } from '@/i18n';

/**
 * Created on first use rather than at import.
 *
 * A module-scope `new LazyStore(...)` runs the moment anything imports this
 * file, which makes every test that mocks the store loosely — a plain object
 * factory rather than a class — fail to even load the module. It also means an
 * import can throw, which nothing importing a preference helper expects.
 */
let store: LazyStore | undefined;
function getStore(): LazyStore {
  store ??= new LazyStore('papercut-settings.json');
  return store;
}

/** Key in papercut-settings.json, shared with recent dirs and favourites. */
export const LOCALE_KEY = 'locale';

/** Matches an OS language tag against what the app actually has. */
function matchAvailable(tag: string): string | undefined {
  const available = availableLocales();
  // Region-insensitive: de-AT and de-CH are German speakers and the app has one
  // German. Comparing whole tags would send them to English.
  const language = tag.toLowerCase().split('-')[0];
  return available.find((l) => l.toLowerCase().split('-')[0] === language);
}

/**
 * Which language to start in.
 *
 * An explicit choice wins over the OS: someone who picked English on a German
 * Mac should not be overruled at every launch. Absent a choice, the OS decides,
 * walking the user's full preference order rather than only the first entry —
 * macOS lets people rank languages, and someone with Japanese first and German
 * second should get German rather than English.
 */
export async function resolveInitialLocale(): Promise<string> {
  try {
    const remembered = await getStore().get<string>(LOCALE_KEY);
    // Ignore a language a later build no longer has, rather than showing a UI
    // where every string falls back.
    if (remembered && availableLocales().includes(remembered)) return remembered;
  } catch {
    // An unreadable store is not a reason to fail to start.
  }

  const osLanguages = navigator.languages ?? [navigator.language];
  for (const tag of osLanguages) {
    const match = matchAvailable(tag);
    if (match) return match;
  }
  return 'en';
}

/** Remembers an explicit choice. Flushed immediately so a crash cannot lose it. */
export async function rememberLocale(locale: string): Promise<void> {
  try {
    const s = getStore();
    await s.set(LOCALE_KEY, locale);
    await s.save();
  } catch {
    // Failing to persist a preference must not break switching language now.
  }
}
