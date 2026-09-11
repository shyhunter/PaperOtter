import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { globSync } from 'node:fs';

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

const COMPONENTS = globSync('src/components/**/*.tsx').filter((f) => !f.includes('__tests__'));

describe('[UI-BTN-01] the primary action is one size everywhere', () => {
  it('never hardcodes a width on a primary action button', () => {
    const offenders: string[] = [];

    for (const file of COMPONENTS) {
      const src = readFileSync(file, 'utf-8');
      // The opening tag of any button carrying a primary-action test id.
      // Anchored so the match cannot run back through an earlier <Button and
      // pick up the Back button's own class.
      for (const tag of src.match(/<Button(?:(?!<Button)[\s\S]){0,400}?data-testid="(?:apply-btn|generate-preview-btn|save-btn)"(?:(?!<Button)[\s\S]){0,400}?>/g) ?? []) {
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
