import { invoke } from '@tauri-apps/api/core';

export interface OcrLanguage {
  /** BCP-47 tag as Vision reports it, e.g. "de-DE" or "zh-Hans". */
  tag: string;
  /** Human name, in the reader's own language. */
  name: string;
}

/**
 * Names a language tag for a human.
 *
 * Uses Intl.DisplayNames rather than a table of 30 hand-written strings. That
 * keeps the dictionary from carrying a name for every language in every language,
 * and means the picker reads as German once the UI is German — which is the whole
 * point of F13b.
 */
export function nameForLanguageTag(tag: string, uiLocale: string): string {
  // Drop the region but keep the script: "de-DE" should read as "German", not
  // "German (Germany)", while "zh-Hans" and "zh-Hant" must stay distinguishable
  // and would both collapse to "Chinese" without their script.
  const withoutRegion = tag.split('-').filter((part) => !/^[A-Z]{2}$/.test(part)).join('-');
  try {
    const display = new Intl.DisplayNames([uiLocale], { type: 'language' });
    // Falls back to the tag itself when the runtime has no name for it, which
    // is better than an empty row in the picker.
    return display.of(withoutRegion) ?? display.of(tag) ?? tag;
  } catch {
    return tag;
  }
}

/**
 * Every language this machine can recognise, named and sorted.
 *
 * Asked of the OS rather than hardcoded: Vision's set grows between macOS
 * releases, so a fixed list would either offer something this machine cannot do
 * or hide something it can.
 */
export async function listOcrLanguages(uiLocale: string): Promise<OcrLanguage[]> {
  let tags: string[];
  try {
    tags = await invoke<string[]>('ocr_languages');
  } catch {
    // A build with no engine still has to render a working picker.
    return [{ tag: 'en-US', name: nameForLanguageTag('en-US', uiLocale) }];
  }

  return tags
    .map((tag) => ({ tag, name: nameForLanguageTag(tag, uiLocale) }))
    .sort((a, b) => a.name.localeCompare(b.name, uiLocale));
}
