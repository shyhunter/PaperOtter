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

/**
 * Full oklch -> relative luminance, for the tokens that carry chroma.
 *
 * `luminance()` above collapses to L**3, which is only true at chroma 0. A
 * green measured that way looks far lighter than it prints: the success tick
 * shipped as #22c55e on the strength of exactly that kind of guess, and
 * measures 2.24:1 on this page.
 */
function oklchLuminance(L: number, C: number, hDeg: number): number {
  const h = (hDeg * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);

  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;

  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  const r = clamp(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s);
  const g = clamp(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s);
  const bl = clamp(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s);

  return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
}

/** Reads a token's full oklch triple out of a theme block. */
function oklch(css: string, block: ':root' | '.dark', name: string): [number, number, number] {
  const start = css.indexOf(block === ':root' ? ':root {' : '.dark {');
  const body = css.slice(start, css.indexOf('}', start));
  const match = body.match(new RegExp(`--${name}:\\s*oklch\\(([\\d.]+)\\s+([\\d.]+)\\s+([\\d.]+)`));
  expect(match, `${block} does not define --${name} as a full oklch triple`).not.toBeNull();
  return [parseFloat(match![1]), parseFloat(match![2]), parseFloat(match![3])];
}

function ratioOf(a: [number, number, number], b: [number, number, number]): number {
  const [hi, lo] = [oklchLuminance(...a), oklchLuminance(...b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe('[UI-08] the success green is one you can read', () => {
  const css = stripComments(readFileSync(GLOBALS, 'utf8'));

  it('clears WCAG AA for the saved-file link, in both themes', () => {
    // The link is 12px, so AA asks 4.5:1. It is the one piece of green text on
    // the screen and it names a path the user may want to read back.
    for (const theme of [':root', '.dark'] as const) {
      const ratio = ratioOf(oklch(css, theme, 'success'), oklch(css, theme, 'card'));
      expect(ratio, `${theme}: --success is ${ratio.toFixed(2)}:1 on --card`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps the hover state at least as readable as the resting one', () => {
    // "Strong" means more contrast, which is darker in light and lighter in
    // dark. Getting that backwards would dim the link on hover.
    for (const theme of [':root', '.dark'] as const) {
      const card = oklch(css, theme, 'card');
      expect(
        ratioOf(oklch(css, theme, 'success-strong'), card),
        `${theme}: --success-strong is the weaker of the two`,
      ).toBeGreaterThan(ratioOf(oklch(css, theme, 'success'), card));
    }
  });

  it('exists because --lime cannot be written in on a light page', () => {
    // Measured on the light card: --lime is 1.32:1 and --success 4.96:1. This
    // is only a light-theme problem -- on the dark card --lime is 10.97:1,
    // perfectly readable -- which is exactly why the bright green stays the
    // fill behind a completed step and a separate token carries the text.
    const lime = ratioOf(oklch(css, ':root', 'lime'), oklch(css, ':root', 'card'));
    expect(lime, '--lime became readable; the second token may be redundant').toBeLessThan(3);
    expect(ratioOf(oklch(css, ':root', 'success'), oklch(css, ':root', 'card'))).toBeGreaterThan(lime);
  });

  it('is the colour the success tick is drawn in, so the two cannot drift', () => {
    const save = readFileSync('src/components/SaveStep.tsx', 'utf8');
    expect(save, 'the tick is back on a hardcoded hex').not.toMatch(/stroke="#[0-9a-fA-F]{6}"/);
    expect(save).toContain('stroke="var(--success)"');
  });
});
