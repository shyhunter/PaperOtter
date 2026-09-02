/**
 * No user-facing dialog text is hardcoded English.
 *
 * The translation CSV a reviewer reads is built from the dictionaries. A string
 * written straight into the source is therefore invisible to that review — it
 * never appears as a row, so it cannot be spotted as missing, and it stays
 * English in every language forever without anything ever reporting it.
 *
 * On 2026-09-02 three did exactly that, and they were the worst three in the
 * app to lose: "your edits will be lost", "close without saving?" and "discard
 * all changes". A German user met them in English at the moment they were about
 * to lose work — and the safety rule in translations.test.ts, which exists
 * precisely for those sentences, could not see them either.
 *
 * Native dialogs are the risk because they take plain strings rather than JSX,
 * so nothing about writing a literal there looks wrong.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(process.cwd(), 'src');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === '__tests__' || e.name === 'e2e') return [];
      return sourceFiles(full);
    }
    return /\.(ts|tsx)$/.test(e.name) && statSync(full).isFile() ? [full] : [];
  });
}

const FILES = sourceFiles(SRC);

/** `window.confirm('…')`, `alert("…")`, `ask('…')` — the message as a literal. */
const LITERAL_MESSAGE = /(?:window\.(?:confirm|alert|prompt)|\bask)\(\s*['"`]/g;

/** The buttons on a native dialog, which are just as visible as the message. */
const LITERAL_BUTTON = /(?:okLabel|cancelLabel|title)\s*:\s*['"][A-Za-z]/g;

describe('native dialogs', () => {
  it('never take a hardcoded message', () => {
    const offenders: string[] = [];
    for (const file of FILES) {
      const text = readFileSync(file, 'utf8');
      for (const m of text.matchAll(LITERAL_MESSAGE)) {
        const line = text.slice(0, m.index).split('\n').length;
        offenders.push(`${file.replace(SRC, 'src')}:${line}`);
      }
    }
    expect(offenders, `use t('…') for dialog text:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('never take a hardcoded button label', () => {
    const offenders: string[] = [];
    for (const file of FILES) {
      const text = readFileSync(file, 'utf8');
      for (const m of text.matchAll(LITERAL_BUTTON)) {
        const line = text.slice(0, m.index).split('\n').length;
        offenders.push(`${file.replace(SRC, 'src')}:${line} — ${m[0]}`);
      }
    }
    expect(offenders, `use t('…') for dialog buttons:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('is actually looking at the source it claims to', () => {
    // Without this the file passes vacuously the day the walk breaks.
    expect(FILES.length).toBeGreaterThan(100);
    expect(FILES.some((f) => f.endsWith('App.tsx'))).toBe(true);
    // And the patterns must still match the shape they were written for.
    expect("window.confirm('x')".match(LITERAL_MESSAGE)).not.toBeNull();
    expect("okLabel: 'Close'".match(LITERAL_BUTTON)).not.toBeNull();
    expect("window.confirm(t('k'))".match(LITERAL_MESSAGE)).toBeNull();
  });
});
