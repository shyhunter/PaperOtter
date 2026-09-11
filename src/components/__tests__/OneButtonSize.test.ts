import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { sourceFiles } from '@/i18n/__tests__/sourceFiles';

/**
 * [UI-BTN-01] One size for the primary action, in every tool.
 *
 * The footer of every step is the same shape -- Back on the left, the button
 * that does the thing on the right -- and it was drawn three different ways:
 * eight tools filled the bar with `flex-1`, eight sat at content width behind a
 * `flex-1` spacer, and Generate Preview had a min-width clamp of its own. Same
 * job, same place on screen, a different width depending on which tool you had
 * opened.
 *
 * [UI-BTN-02] And one loading animation, in every tool. `Loader2` and four
 * hand-rolled CSS rings were still in use after the otter loader shipped.
 */

const COMPONENTS = sourceFiles(['.tsx']).filter((f) => f.startsWith('src/components/'));

/**
 * The opening `<Button …>` tag of every primary action in one file.
 *
 * Scanned rather than matched. A regex that runs to the first `>` after the
 * test id stops inside `onClick={() => …}` — so for every button whose handler
 * is an inline arrow, `className` fell outside the captured text and the check
 * passed on a button it had never actually read. That is exactly the shape of
 * the buttons this is meant to guard.
 */
function primaryActionTags(src: string): string[] {
  const ID = /data-testid="(?:apply-btn|generate-preview-btn|save-btn)"/g;
  const tags: string[] = [];

  for (const hit of src.matchAll(ID)) {
    const open = src.lastIndexOf('<Button', hit.index);
    if (open === -1) continue;

    // Forward to the `>` that closes the tag, ignoring any inside braces or
    // quotes — which is where the arrow functions live.
    let depth = 0;
    let quote: string | null = null;
    let end = -1;
    for (let i = open; i < src.length; i++) {
      const ch = src[i];
      if (quote) { if (ch === quote && src[i - 1] !== '\\') quote = null; continue; }
      if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
      else if (ch === '>' && depth === 0) { end = i; break; }
    }
    if (end !== -1) tags.push(src.slice(open, end + 1));
  }
  return tags;
}

describe('[UI-BTN-01] the primary action is one size everywhere', () => {
  it('is actually scanning files', () => {
    // A scanner that walks nothing passes every check it makes. `globSync` gave
    // this suite exactly that failure on CI: it lands in Node 22, CI runs Node
    // 20, and the suite failed to load while the summary line still counted the
    // other tests as green.
    expect(COMPONENTS.length, 'the walk found no files').toBeGreaterThan(20);
  });

  it('never hardcodes a width on a primary action button', () => {
    const offenders: string[] = [];

    for (const file of COMPONENTS) {
      for (const tag of primaryActionTags(readFileSync(file, 'utf-8'))) {
        const cls = tag.match(/className="([^"]*)"/)?.[1];
        // `w-full` is the same intent in a vertical stack, where there is no
        // row to divide.
        if (cls && cls !== 'w-full') offenders.push(`${file}: className="${cls}"`);
      }
    }

    expect(offenders, 'these should use PRIMARY_ACTION instead').toEqual([]);
  });

  it('has no spacer sharing the bar with a full-width button', () => {
    // A `<div className="flex-1" />` next to a `flex-1` button splits the row
    // between them, so the button ends up half the width it asked for. Footers
    // holding two actions keep their spacer -- the rule is for the common
    // Back-plus-one-action bar.
    for (const file of COMPONENTS) {
      const lines = readFileSync(file, 'utf-8').split('\n');
      lines.forEach((line, i) => {
        if (!/<div className="flex-1" \/>/.test(line)) return;
        const next = lines.slice(i + 1, i + 4).join('\n');
        expect(next, `${file}:${i + 1} a spacer sits directly before a PRIMARY_ACTION button`)
          .not.toMatch(/PRIMARY_ACTION/);
      });
    }
  });
});

describe('[UI-BTN-02] one loading animation', () => {
  it('has no Loader2 or hand-rolled ring left outside the brand components', () => {
    const offenders: string[] = [];

    for (const file of COMPONENTS) {
      if (file.includes('brand/')) continue;
      const src = readFileSync(file, 'utf-8');
      src.split('\n').forEach((line, i) => {
        if (/<Loader2|animate-spin/.test(line)) offenders.push(`${file}:${i + 1}`);
      });
    }

    expect(offenders, 'these should use OtterSpinner or OtterLoader').toEqual([]);
  });

  it('sizes the spinner with size-*, which the Button base style respects', () => {
    // Button forces `size-4` onto any descendant svg without a size- class, so
    // `h-5 w-5` on a spinner inside a button is silently overridden.
    for (const file of COMPONENTS) {
      const src = readFileSync(file, 'utf-8');
      for (const tag of src.match(/<OtterSpinner className="[^"]*"/g) ?? []) {
        expect(tag, `${file}: use size-N, not h-N w-N`).toMatch(/className="size-/);
      }
    }
  });
});
