import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

// ─── Extraction guard (I18N-04) ──────────────────────────────────────────────
//
// The brief's acceptance for F13a is "no hardcoded user-facing English outside
// the translation files". Extracting 610 strings once satisfies that for an
// afternoon; this test is what keeps it true. F11 (batch) and F12 (OCR) are the
// two largest copy surfaces still to be written, and without a guard they would
// quietly reintroduce hardcoded English one component at a time.
//
// It reads source as text rather than parsing it. That is crude, but the failure
// mode is the safe one: a shape it cannot see is a miss, never a false alarm on
// working code.

const SRC = join(process.cwd(), 'src');

/** Never translated: the product name and third-party proper nouns. */
const PROPER_NOUNS = new Set([
  'Papercut', 'GitHub', 'Tauri + React', 'Ghostscript', 'LibreOffice',
  'Calibre', 'Rust', 'React', 'MIT', 'PDF', 'JPG', 'PNG', 'WebP',
]);

/**
 * Known false positives — text the scanner reads as English copy but which never
 * reaches a user. Keep this list short and justified; an entry here is a claim
 * that the string is not user-facing, and it should be re-checked when the file
 * it names changes.
 */
const ALLOWLIST = new Set<string>([]);

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === '__tests__' || entry === 'e2e' || entry === 'i18n') continue;
      sourceFiles(full, out);
    } else if (/\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

// A JSX text node, excluding arrow and comparison contexts — `=> Partial<T>`
// reads as ">Partial<" and is a type annotation, not copy.
const JSX_TEXT = /(?<![=-])>\s*([A-Z][^<>{}\n]{2,160}?)\s*</g;
// User-facing string props. Others (className, data-testid, type) are not copy.
const TEXT_PROP = /(?:placeholder|title|aria-label|alt|label)="([^"]{3,160})"/g;

function findings(text: string): string[] {
  const found: string[] = [];
  for (const rx of [JSX_TEXT, TEXT_PROP]) {
    rx.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = rx.exec(text)) !== null) {
      const value = m[1].trim();
      if (!/[a-z]{2}/.test(value)) continue;        // needs real words
      if (PROPER_NOUNS.has(value)) continue;
      if (ALLOWLIST.has(value)) continue;
      found.push(value);
    }
  }
  return found;
}

describe('no hardcoded user-facing English', () => {
  it('[I18N-04a] every user-facing string goes through the dictionary', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(SRC)) {
      const hits = findings(readFileSync(file, 'utf8'));
      for (const hit of hits) {
        offenders.push(`${relative(process.cwd(), file)}: ${JSON.stringify(hit)}`);
      }
    }

    expect(
      offenders,
      `Hardcoded user-facing English found. Move each string into src/i18n/en.ts and\n` +
      `render it with t('key'). If it is genuinely not user-facing (a proper noun, a\n` +
      `technical token), add it to PROPER_NOUNS or ALLOWLIST in this file with a reason.\n\n` +
      offenders.join('\n'),
    ).toEqual([]);
  });

  it('[I18N-04b] the guard can actually see a hardcoded string', () => {
    // A guard that cannot fail is worse than none: it reads as protection while
    // proving nothing. This pins that the scanner detects both shapes.
    expect(findings('<span>Save your document</span>')).toContain('Save your document');
    expect(findings('<button title="Close the dialog" />')).toContain('Close the dialog');
  });

  it('[I18N-04c] the guard does not flag type annotations or translated calls', () => {
    expect(findings('(s: State) => Partial<State>')).toEqual([]);
    expect(findings("<span>{t('common.save')}</span>")).toEqual([]);
    expect(findings('<span>Papercut</span>')).toEqual([]);
  });
});
