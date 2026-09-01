import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * [UI-07] Secondary text has to be readable, and the page it sits on must not
 * be pure white.
 *
 * Reported from a real Linux build: the light theme is too bright and the
 * dashboard hint "Click ⠿ to reorder · Click ★ on any tool to add" is hard to
 * read. It was not a matter of taste. That line shipped as
 * `text-[10px] text-muted-foreground/50` — a mid-grey token at half opacity, at
 * ten pixels, on pure white. Measured: 1.96:1, where WCAG AA asks 4.5:1 for
 * body text. Nothing about it was readable.
 *
 * An opacity modifier is what made it that bad: it composites the token towards
 * the background, so the darker the token is made, the more of the fix the
 * modifier gives back. That is why the guard below forbids the modifier on this
 * line rather than only checking the token.
 *
 * jsdom computes no CSS, so the ratios are computed here from the stylesheet's
 * own oklch values instead of measured from a render.
 */

const GLOBALS = 'src/styles/globals.css';

/** Comments in this stylesheet quote the values they explain, so a scan that
 *  reads them matches prose rather than declarations. */
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/**
 * Relative luminance of an achromatic `oklch(L 0 0)`.
 *
 * With chroma 0 the OKLab→linear-sRGB matrix collapses to identity, so the
 * linear channel value is L³ and, the channels being equal, that is also the
 * relative luminance WCAG asks for.
 */
function luminance(lightness: number): number {
  return lightness ** 3;
}

function contrast(a: number, b: number): number {
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (luminance(hi) + 0.05) / (luminance(lo) + 0.05);
}

/** Reads one token's lightness out of a `:root` or `.dark` block. */
function token(css: string, block: ':root' | '.dark', name: string): number {
  const start = css.indexOf(block === ':root' ? ':root {' : '.dark {');
  expect(start, `no ${block} block`).toBeGreaterThan(-1);
  const body = css.slice(start, css.indexOf('}', start));

  const match = body.match(new RegExp(`--${name}:\\s*oklch\\(([\\d.]+)`));
  expect(match, `${block} does not define --${name} as oklch`).not.toBeNull();
  return parseFloat(match![1]);
}

describe('Theme contrast', () => {
  it('[UI-07a] secondary text clears WCAG AA on the page background', () => {
    const css = stripComments(readFileSync(GLOBALS, 'utf8'));

    for (const theme of [':root', '.dark'] as const) {
      const ratio = contrast(
        token(css, theme, 'muted-foreground'),
        token(css, theme, 'background'),
      );
      expect(ratio, `${theme}: muted text is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('[UI-07b] the dashboard hint does not fade its own text away', () => {
    // `text-muted-foreground/50` composites the token halfway to the background.
    // Any fix to the token is halved by it, so the modifier has to go.
    const dashboard = readFileSync('src/components/Dashboard.tsx', 'utf8');
    const hint = dashboard.slice(
      Math.max(0, dashboard.indexOf('clickToReorderMiddotClick') - 400),
      dashboard.indexOf('clickToReorderMiddotClick'),
    );

    expect(hint, 'the reorder hint still fades its text').not.toMatch(
      /text-muted-foreground\/\d+/,
    );
  });

  it('[UI-07c] a greyed page still leaves muted surfaces visible', () => {
    // The page background was pure white and the muted/secondary/accent
    // surfaces sat just under it. Darkening the page without moving them would
    // have made them the same colour and erased every hover and filled row.
    const css = stripComments(readFileSync(GLOBALS, 'utf8'));

    for (const theme of [':root', '.dark'] as const) {
      const background = token(css, theme, 'background');
      for (const surface of ['muted', 'secondary', 'accent'] as const) {
        expect(
          Math.abs(token(css, theme, surface) - background),
          `${theme}: --${surface} is indistinguishable from --background`,
        ).toBeGreaterThan(0.015);
      }
    }
  });

  it('[UI-07d] the light page is off-white, not pure white', () => {
    const css = stripComments(readFileSync(GLOBALS, 'utf8'));
    expect(token(css, ':root', 'background')).toBeLessThan(1);
  });

  it('[UI-07e] borders stay visible against the surfaces they enclose', () => {
    // Moving the page and its muted surfaces down without moving the border
    // left --border sitting on top of --muted: a bordered muted element would
    // have lost its outline. This is a regression the greying itself created.
    const css = stripComments(readFileSync(GLOBALS, 'utf8'));

    for (const theme of [':root', '.dark'] as const) {
      const border = token(css, theme, 'border');
      for (const behind of ['background', 'muted', 'card'] as const) {
        expect(
          Math.abs(border - token(css, theme, behind)),
          `${theme}: --border vanishes against --${behind}`,
        ).toBeGreaterThan(0.02);
      }
    }
  });
});
