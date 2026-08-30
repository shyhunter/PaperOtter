import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * [UI-03] Dropdown options must be readable in dark theme.
 *
 * Reported from a real Linux build, 2026-08-30: the language dropdown rendered
 * white text on a white background in dark theme, unreadable. The <select>
 * carries `bg-background text-foreground`, so its options inherited light text,
 * while the popup's background came from the platform default.
 *
 * It was never one dropdown. Nine files ship <select> elements and not one
 * <option> anywhere carried styling. It is invisible on macOS, which renders
 * select popups natively and ignores CSS — so the machine this is developed on
 * cannot show the bug.
 *
 * jsdom computes no CSS, so no test can assert on rendered colour. This checks
 * the thing that actually fixes all of them: one global rule in the base layer,
 * which covers every <option> shipping today and every one added later. Same
 * shape as ToolIcons.test.tsx — enumerate from source, because nothing in the
 * type system connects a <select> to a stylesheet.
 */

const GLOBALS = 'src/styles/globals.css';

function tsxFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry !== '__tests__' && entry !== 'node_modules') tsxFiles(full, acc);
    } else if (entry.endsWith('.tsx')) {
      acc.push(full);
    }
  }
  return acc;
}

describe('dropdown contrast', () => {
  it('[UI-03a] a global rule styles every option, in both themes', () => {
    const css = readFileSync(GLOBALS, 'utf8');
    const rule = css.match(/(^|\n)\s*option\s*\{([\s\S]*?)\}/);

    expect(rule, `${GLOBALS} must define a global \`option\` rule`).not.toBeNull();
    const body = rule![2];
    // Both halves are required. Setting only the colour is what produced the
    // bug: light text on a platform-default white popup.
    expect(body, 'the option rule must set a background').toMatch(/bg-|background/);
    expect(body, 'the option rule must set a text colour').toMatch(/text-|(^|[^-])color/);
  });

  it('[UI-03b] the rule uses theme tokens, so it follows light and dark', () => {
    const css = readFileSync(GLOBALS, 'utf8');
    const rule = css.match(/(^|\n)\s*option\s*\{([\s\S]*?)\}/);
    const body = rule?.[2] ?? '';

    // A hardcoded hex would fix dark and break light, or vice versa. The token
    // has to be one that globals.css defines under BOTH :root and .dark.
    const token = body.match(/(popover|background|foreground|card)/)?.[1];
    expect(token, 'the rule must use a theme token, not a literal colour').toBeTruthy();

    const inRoot = /^:root \{[\s\S]*?\}/m.exec(css)?.[0] ?? '';
    const inDark = /^\.dark \{[\s\S]*?\}/m.exec(css)?.[0] ?? '';
    expect(inRoot, `--${token} must be defined for light theme`).toContain(`--${token}`);
    expect(inDark, `--${token} must be defined for dark theme`).toContain(`--${token}`);
  });

  it('[UI-03c] every shipping <option> is covered by that one rule', () => {
    const files = tsxFiles('src/components');
    // Guard the guard: a traversal that finds nothing would pass vacuously.
    expect(files.length, 'sanity: found a plausible number of components').toBeGreaterThan(20);

    const withOptions = files.filter((f) => readFileSync(f, 'utf8').includes('<option'));
    expect(withOptions.length, 'sanity: the app really does ship <select> elements')
      .toBeGreaterThan(5);

    // The fix is deliberately global rather than 29 per-element classNames, so
    // this records the count the rule is standing in for.
    const total = withOptions.reduce(
      (n, f) => n + (readFileSync(f, 'utf8').match(/<option/g) ?? []).length,
      0,
    );
    expect(total).toBeGreaterThan(20);
  });
});
