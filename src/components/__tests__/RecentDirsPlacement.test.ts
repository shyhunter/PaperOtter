import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * [RECENTUI] Recent appears once per screen, in the same place every time.
 *
 * Reported as "recent is double in first step by compress pdf [...] the
 * positions and amounts should be consistent for good UX". ToolHeader renders
 * Recent on every tool screen, and LandingCard rendered it again underneath the
 * drop area -- so the two compress tools, the only ones that use that card,
 * showed it twice on their first step while the other twenty showed it once.
 *
 * The invariant is about placement rather than count: Recent belongs to the
 * chrome, so exactly two components may render it. ToolHeader, which is on
 * every tool screen, and Dashboard, which has no ToolHeader above it (the
 * header renders nothing without an active tool) and would otherwise have none.
 * Any third is a screen growing its own copy in its own position, which is the
 * report.
 */

const ALLOWED = new Set([
  'src/components/ToolHeader.tsx',
  'src/components/Dashboard.tsx',
]);

function tsxFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry !== '__tests__') tsxFiles(full, acc);
    } else if (entry.endsWith('.tsx')) acc.push(full);
  }
  return acc;
}

/** Files that render the control, ignoring the component's own definition. */
function rendersRecent(): string[] {
  return tsxFiles('src/components')
    .filter((f) => f !== 'src/components/RecentDirsButton.tsx')
    .filter((f) => /<RecentDirsButton\b/.test(readFileSync(f, 'utf8')));
}

describe('Recent folders placement', () => {
  it('[RECENTUI-01] the scan finds the control where it is meant to be', () => {
    // Guard the guard: a traversal that matched nothing would pass the real
    // check below while proving nothing at all.
    expect(rendersRecent().length, 'sanity: Recent is rendered somewhere').toBeGreaterThan(0);
  });

  it('[RECENTUI-02] only the chrome renders Recent, so no screen shows two', () => {
    const extra = rendersRecent().filter((f) => !ALLOWED.has(f));
    expect(extra, 'components rendering their own Recent under ToolHeader').toEqual([]);
  });

  it('[RECENTUI-03] both places that are supposed to have one still do', () => {
    // The other direction: removing the duplicate must not have taken the
    // remaining one with it, which would read as Recent being broken again --
    // and that has its own report already, see useRecentDirs [RECENT].
    const found = rendersRecent();
    for (const file of ALLOWED) expect(found, file).toContain(file);
  });
});
