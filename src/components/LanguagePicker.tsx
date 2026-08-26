import { Languages } from 'lucide-react';
import { availableLocales } from '@/i18n';
import { useT } from '@/i18n/context';
import { rememberLocale } from '@/i18n/preference';
import { nameForLanguageTag } from '@/lib/ocrLanguages';
import { t } from '@/i18n';

/**
 * Switches the interface language, and remembers the choice.
 *
 * Rendered as a native <select> rather than a custom menu: it is one control in
 * a strip of icon buttons, and the OS one is keyboard-accessible and localised
 * for free.
 *
 * Hidden entirely when there is only one language, so an English-only build does
 * not show a picker with a single option.
 */
export function LanguagePicker() {
  const { locale, setLocale } = useT();
  const locales = availableLocales();

  if (locales.length < 2) return null;

  return (
    <label className="flex items-center gap-1" title={t('chrome.language')}>
      <Languages className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
      <span className="sr-only">{t('chrome.language')}</span>
      <select
        value={locale}
        onChange={(e) => {
          setLocale(e.target.value);
          // Not awaited: the UI should switch immediately, and a failed write is
          // a lost preference rather than a reason to block.
          void rememberLocale(e.target.value);
        }}
        className="rounded-md border border-border bg-background px-1.5 py-0.5 text-xs text-foreground"
      >
        {locales.map((l) => (
          // Each language is named in itself — a German speaker looks for
          // "Deutsch", not "German".
          <option key={l} value={l}>{nameForLanguageTag(l, l)}</option>
        ))}
      </select>
    </label>
  );
}
