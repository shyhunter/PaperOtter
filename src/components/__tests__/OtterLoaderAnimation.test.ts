import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * The loader animation is a class name in one file and a rule in another, and
 * nothing connects them. That is exactly how it was lost: commit 241e471, a
 * pass over the card styles, deleted `.otter-loader-mark` and `@keyframes
 * otter-flip` from the stylesheet while `OtterLoader.tsx` went on asking for
 * them. Nothing failed. No type error, no lint error, no test — the component
 * rendered a perfectly good otter that simply never moved, and it shipped that
 * way through every screen that used it.
 *
 * An undefined class is invisible to every tool we run, so this checks the join
 * by hand: each class the component names must exist in the stylesheet, and the
 * one that carries the motion must actually declare an animation.
 */

const COMPONENT = 'src/components/brand/OtterLoader.tsx';
const GLOBALS = 'src/styles/globals.css';

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

describe('[UI-LOAD-01] the otter loader animates', () => {
  const component = readFileSync(COMPONENT, 'utf-8');
  const css = stripComments(readFileSync(GLOBALS, 'utf-8'));

  it('defines every otter-loader class the component asks for', () => {
    const used = [...component.matchAll(/\b(otter-loader-[a-z-]+)\b/g)].map((m) => m[1]);

    // If this is empty the component stopped using the classes and this test is
    // guarding nothing — which is itself worth failing over.
    expect(used.length).toBeGreaterThan(0);

    for (const cls of new Set(used)) {
      expect(css, `.${cls} is used in OtterLoader but not defined in ${GLOBALS}`).toContain(`.${cls}`);
    }
  });

  it('drives the mark from a keyframe, not a script', () => {
    // steps() is the whole character: a smooth turn is any app's spinner, the
    // judder is what makes it hand-cranked film.
    expect(css).toMatch(/@keyframes\s+otter-flip\s*\{[^}]*rotateY\(360deg\)/);
    expect(css).toMatch(/\.otter-loader-mark\s*\{[^}]*animation:\s*otter-flip[^}]*steps\(/);
  });

  it('gives it perspective, or the flip reads as a horizontal squash', () => {
    expect(css).toMatch(/\.otter-loader-stage\s*\{[^}]*perspective:/);
  });

  it('rests upright under reduced motion rather than stopping mid-flip', () => {
    const reduced = css.match(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*?\n\}/g) ?? [];
    const block = reduced.find((b) => b.includes('otter-loader-mark'));
    expect(block, 'no reduced-motion rule for the loader').toBeDefined();
    expect(block).toMatch(/animation:\s*none/);
    expect(block).toMatch(/transform:\s*none/);
  });
});
