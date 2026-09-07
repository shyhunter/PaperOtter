import { describe, it, expect } from 'vitest';
import { de } from '@/i18n/de';

/**
 * [DEVOCAB] Two German words the user chose, kept chosen.
 *
 * Both were reported twice. "Komprimieren" became "verkleinern" across the
 * compress tools, and "beschneiden" became "zuschneiden" for Crop -- and then
 * the crop step label and its apply button came back a second time, because the
 * first pass had renamed the tool card and left the screens behind it alone.
 *
 * A translation has no compiler and no reviewer who reads German, so a word can
 * be reintroduced by anyone adding a nearby string, and nothing notices until
 * the same person reports it a third time. That is what this is for.
 *
 * Not a style rule invented here: these are the terms the person using the
 * German build asked for. Adding a German string near one of these areas means
 * matching the word already in use, not picking the dictionary's first entry.
 */

/** The word, why it is banned, and what to use instead. */
const BANNED: Array<{ pattern: RegExp; instead: string; note: string }> = [
  {
    pattern: /komprimier/i,
    instead: 'verkleinern / Verkleinerung',
    note: 'Compress: "PDF verkleinern", not "PDF komprimieren".',
  },
  {
    pattern: /beschneid|beschnitt/i,
    instead: 'zuschneiden / Zuschnitt',
    note: 'Crop: "PDF zuschneiden", "Zuschnitt anwenden", step label "Zuschneiden".',
  },
];

describe('German vocabulary', () => {
  it.each(BANNED)('[DEVOCAB-01] no German string says $instead the wrong way', ({ pattern, instead, note }) => {
    const offenders = Object.entries(de)
      .filter(([, value]) => typeof value === 'string' && pattern.test(value))
      .map(([key, value]) => `${key}: ${value}`);

    expect(offenders, `${note} Use ${instead}.`).toEqual([]);
  });

  it('[DEVOCAB-02] the words that replaced them are actually there', () => {
    // Guard the guard: a dictionary that lost both terms entirely would pass
    // the check above while saying nothing at all.
    const all = Object.values(de).join('\n');
    expect(all, 'the compress vocabulary').toMatch(/verkleinern/);
    expect(all, 'the crop vocabulary').toMatch(/zuschneiden/i);
  });

  it('[DEVOCAB-03] the two screens the crop rename was reported for', () => {
    // Named individually because these are the exact strings that survived the
    // first pass: the tool card was renamed and these were not.
    expect(de['step.crop']).toBe('Zuschneiden');
    expect(de['cropPdfFlow.applyCrop']).toBe('Zuschnitt anwenden');
  });
});
