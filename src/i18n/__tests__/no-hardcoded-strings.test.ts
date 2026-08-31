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
//
// It did miss a shape, and a large one. A sentence wrapping a JSX expression --
// `This will create {n} files.` -- is three text nodes, none of which look like
// a sentence to a line-oriented scan. Around a hundred strings lived in that
// blind spot. I18N-08 in hardcoded-jsx.test.ts parses the AST and covers it.
// Neither test supersedes the other: this one still catches toast() calls,
// `description:`/`label:` properties and error setters that I18N-08 does not
// look at.

const SRC = join(process.cwd(), 'src');

/** Never translated: the product name and third-party proper nouns. */
const PROPER_NOUNS = new Set([
  'Papercut', 'GitHub', 'Tauri + React', 'Ghostscript', 'LibreOffice',
  'Calibre', 'Rust', 'React', 'MIT', 'PDF', 'JPG', 'PNG', 'WebP',
  // Font families and product names — CSS values and trademarks, never translated.
  'Times New Roman', 'Times Roman', 'Courier New', 'Helvetica Neue',
  'Brush Script MT', 'Dancing Script', 'Great Vibes', 'Microsoft Word',
  'Helvetica', 'Courier', 'Caveat', 'Georgia', 'Arial',
  // Document converters offered as examples of what to install. Product
  // names, never translated — alongside LibreOffice and Calibre above.
  'Pandoc',
]);

/**
 * Known false positives — text the scanner reads as English copy but which never
 * reaches a user. Keep this list short and justified; an entry here is a claim
 * that the string is not user-facing, and it should be re-checked when the file
 * it names changes.
 */
const ALLOWLIST = new Set<string>([
  // Sample text rendered inside a watermark/signature preview. It is content
  // being previewed, not interface copy, and is Latin filler in every language.
  'Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
  // Internal invariants that abort before any UI renders.
  'Cannot get canvas context',
  'Canvas to blob failed',
  'Custom quality must be resolved to a preset before processing',
]);

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
// Copy that never appears as JSX text. The first version of this guard scanned
// only the two patterns above and reported the extraction complete while 122
// strings were still hardcoded — 176 of them the entire tool registry, whose
// names and descriptions are object values, not markup.
const TOAST = /toast(?:\.\w+)?\(\s*'((?:[^'\\]|\\.){6,160})'/g;
const DESCRIPTION = /description:\s*'((?:[^'\\]|\\.){6,160})'/g;
const NAME_FIELD = /name: '((?:[^'\\]|\\.){3,160})'/g;
const ERROR_SETTER = /set[A-Z]\w*Error\(\s*'((?:[^'\\]|\\.){6,160})'/g;
const TERNARY = /\?\s*'([A-Z](?:[^'\\]|\\.){4,160})'\s*:\s*'([A-Z](?:[^'\\]|\\.){4,160})'/g;
// Option-list entries: `{ value: 'top-left', label: 'Top Left' }`. The value is
// an identifier and must not be touched; the label is what the user reads.
const LABEL_FIELD = /(?:label|hint):\s*'((?:[^'\\]|\\.){3,160})'/g;
// The fallback half of an error ternary: `err instanceof Error ? err.message :
// 'Could not open the file picker.'` — one literal, so TERNARY never sees it,
// and it is precisely where bad news to the user lives. Anchored on the `?` so
// it does not match every capitalised object value: `fontName: 'Helvetica'` is
// an identifier the renderer depends on, not copy.
const FALLBACK = /\?[^'\n]{0,80}?:\s*'([A-Z][^']{4,140})'/g;

/** A dotted lower-camel token is a translation key, not prose. */
const KEY_SHAPED = /^[a-z][A-Za-z0-9]*\.[A-Za-z0-9_.]+$/;

/**
 * Developer-facing messages. These are never shown to a user — they fire when a
 * hook is used outside its provider, which is a programming error — so
 * translating them would only make debugging harder.
 */
const DEVELOPER_MESSAGES = /must be used within|is not a function|invariant/i;

function findings(text: string): string[] {
  const found: string[] = [];
  const patterns = [JSX_TEXT, TEXT_PROP, TOAST, DESCRIPTION, NAME_FIELD, ERROR_SETTER,
                    TERNARY, LABEL_FIELD, FALLBACK];
  for (const rx of patterns) {
    rx.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = rx.exec(text)) !== null) {
      // TERNARY captures both branches; the rest capture one.
      for (const raw of m.slice(1)) {
        if (!raw) continue;
        const value = raw.trim();
        if (!/[a-z]{2}/.test(value)) continue;      // needs real words
        if (KEY_SHAPED.test(value)) continue;       // already a translation key
        if (DEVELOPER_MESSAGES.test(value)) continue;
        if (PROPER_NOUNS.has(value)) continue;
        if (ALLOWLIST.has(value)) continue;
        found.push(value);
      }
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
    expect(findings("toast.error('Could not save the file')")).toContain('Could not save the file');
    expect(findings("{ description: 'Reduce PDF file size' }")).toContain('Reduce PDF file size');
    expect(findings("  name: 'Compress PDF',")).toContain('Compress PDF');
    expect(findings("setSaveError('The disk is full')")).toContain('The disk is full');
    expect(findings("open ? 'Hide the details' : 'Show the details'"))
      .toEqual(['Hide the details', 'Show the details']);
    expect(findings("{ value: 'top-left', label: 'Top Left' }")).toContain('Top Left');
    expect(findings("err instanceof Error ? err.message : 'Could not open the picker'"))
      .toContain('Could not open the picker');
  });

  it('[I18N-04c] the guard does not flag type annotations or translated calls', () => {
    expect(findings('(s: State) => Partial<State>')).toEqual([]);
    expect(findings("<span>{t('common.save')}</span>")).toEqual([]);
    expect(findings('<span>Papercut</span>')).toEqual([]);
    expect(findings("  name: 'tool.compressPdf.name',")).toEqual([]);
    expect(findings("{ description: 'tool.compressPdf.desc' }")).toEqual([]);
    expect(findings("throw new Error('useToolContext must be used within a provider')")).toEqual([]);
  });
});
