/**
 * Every tool name an E2E spec types must be a name the dashboard actually shows.
 *
 * The E2E helper finds a tool card by looking for a button whose text contains
 * the name it was given, and a name that matches nothing fails fifteen seconds
 * later as a timeout — indistinguishable from a broken feature, and only
 * visible to someone running the full suite on a machine that can. On
 * 2026-09-02 the locked-PDF spec asked for 'Organize PDF' for exactly as long
 * as it took someone to run it; the dashboard says 'Organise PDF'.
 *
 * This runs in the fast unit suite, needs no app, and fails in milliseconds.
 *
 * It also rejects an ambiguous name — one contained in two different tool
 * labels — because the helper clicks the first match, and which one that is
 * depends on dashboard ordering rather than on anything the spec said.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { en } from '@/i18n/en';

const SPEC_DIR = join(process.cwd(), 'src/e2e/tests');

function specFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? specFiles(join(dir, e.name)) : e.name.endsWith('.test.ts') ? [join(dir, e.name)] : [],
  );
}

/**
 * Names a spec passes to the navigation helpers, plus the contents of any
 * `TOOLS` array — the loop in locked-pdf.test.ts passes a variable, so the
 * call site alone reveals nothing and the array is where the names live.
 */
function namesUsedIn(source: string): string[] {
  const names: string[] = [];

  const calls = /(?:resetAppState|goToTool|selectToolOnDashboard)\(\s*browser\s*,\s*'([^']+)'/g;
  for (const m of source.matchAll(calls)) names.push(m[1]);

  const arrays = /const TOOLS[^=]*=\s*\[([\s\S]*?)\];/g;
  for (const block of source.matchAll(arrays)) {
    for (const m of block[1].matchAll(/'([^']+)'/g)) names.push(m[1]);
  }

  return names;
}

const DASHBOARD_LABELS = Object.entries(en)
  .filter(([key]) => /^tool\.[a-zA-Z]+\.name$/.test(key))
  .map(([, value]) => value as string);

describe('E2E specs only name tools the dashboard shows', () => {
  const used = [...new Set(specFiles(SPEC_DIR).flatMap((f) => namesUsedIn(readFileSync(f, 'utf8'))))];

  it('finds the names the specs use', () => {
    // Without this the whole file passes vacuously the day the extraction
    // stops matching — which is how the previous version of this guard came to
    // approve a name that was already wrong.
    expect(DASHBOARD_LABELS.length).toBeGreaterThan(15);
    expect(used.length).toBeGreaterThan(10);
  });

  it.each(used.map((name) => [name]))('%s matches exactly one dashboard tool', (name) => {
    const matches = DASHBOARD_LABELS.filter((label) => label.includes(name));
    expect(matches, `no dashboard tool is named "${name}"`).not.toHaveLength(0);
    expect(matches, `"${name}" is ambiguous: ${matches.join(', ')}`).toHaveLength(1);
  });
});
