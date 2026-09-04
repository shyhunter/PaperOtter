import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * [UI-05] A scrolling flex child must be allowed to shrink.
 *
 * Reported from a real Linux build: the Split PDF page grid could not be
 * scrolled at all. The container had `flex-1 overflow-y-auto` inside a
 * `flex flex-col` parent, which looks right and is not.
 *
 * A flex item defaults to `min-height: auto`, meaning it will not shrink below
 * its content's intrinsic height. With 134 tiles the container simply grew to
 * fit them, so the overflow never engaged and there was nothing to scroll. The
 * fix is `min-h-0`, which is what every scroll area in this app that DOES work
 * already carries -- CompareStep, ImageCompareStep and CompareFloatingWindow all
 * have it.
 *
 * jsdom computes no CSS, so no test can scroll anything. This scans source
 * instead, in the shape of ToolIcons.test.tsx: nothing connects these files, and
 * the next page grid anyone adds would inherit the bug in silence.
 */

function tsxFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry !== '__tests__') tsxFiles(full, acc);
    } else if (entry.endsWith('.tsx')) acc.push(full);
  }
  return acc;
}

/** The opening tag of the element carrying the lazy-grid scroll ref. */
function scrollContainerTags(src: string): string[] {
  return [...src.matchAll(/<div\s+ref=\{scrollContainerRef\}[^>]*>/g)].map((m) => m[0]);
}

describe('scrollable page grids', () => {
  const files = tsxFiles('src/components');

  it('[UI-05a] the scan finds the grids it is meant to check', () => {
    // Guard the guard: a traversal that matched nothing would pass vacuously.
    expect(files.length, 'sanity: found components').toBeGreaterThan(20);
    const hosts = files.filter((f) => scrollContainerTags(readFileSync(f, 'utf8')).length > 0);
    expect(hosts.length, 'sanity: found lazy-thumbnail grids').toBeGreaterThanOrEqual(4);
  });

  /**
   * Column roots paired with the block they actually contain.
   *
   * Containment matters: a file can hold a centred empty state AND a scrolling
   * step in different branches, and only the one wrapping the pane is at risk.
   * Scope is taken from indentation, which this codebase formats consistently.
   */
  function columnRootsWithBody(src: string): { tag: string; body: string }[] {
    const lines = src.split('\n');
    const out: { tag: string; body: string }[] = [];
    for (let i = 0; i < lines.length; i++) {
      if (!/className="[^"]*\bflex flex-1 flex-col\b[^"]*"/.test(lines[i])) continue;
      // className may sit on its own line; the owning <div> is at or above it.
      let open = i;
      while (open > 0 && !/<div\b/.test(lines[open])) open--;
      const indent = (lines[open].match(/^\s*/) as RegExpMatchArray)[0].length;
      let j = open + 1;
      for (; j < lines.length; j++) {
        if (lines[j].trim() === '') continue;
        const ind = (lines[j].match(/^\s*/) as RegExpMatchArray)[0].length;
        if (ind <= indent && /^\s*<\/div>/.test(lines[j])) break;
      }
      out.push({ tag: lines[i], body: lines.slice(open, j).join('\n') });
    }
    return out;
  }

  it('[UI-05c] a column root holding a scroll pane can shrink too', () => {
    // The same defect as UI-05b, one level up, and the reason it reached a
    // user: these panes carry no scrollContainerRef, so the scan above never
    // looked at them. Convert Document showed Output format, EPUB Layout and
    // Typography with no way to scroll and no reachable Convert button, because
    // the root grew to fit its content and pushed the action bar off-screen.
    //
    // The fix belongs on the root, not the pane: ConfigureStep, the one that
    // always worked, carries min-h-0 on the root and nothing on the pane.
    //
    // `overflow-hidden` counts as a fix too, and is not a loophole: the
    // automatic minimum size only applies while overflow is `visible`, so a
    // hidden root already shrinks. BatchSummaryStep relies on exactly that.
    const broken: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, 'utf8');
      for (const { tag, body } of columnRootsWithBody(src)) {
        const holdsPane = /\bflex-1 overflow-y-auto\b/.test(body);
        const canShrink = /\bmin-h-0\b|\boverflow-(hidden|clip)\b/.test(tag);
        if (holdsPane && !canShrink) {
          broken.push(`${file}: column root above a scroll pane cannot shrink`);
        }
      }
    }
    expect(broken, 'column roots that trap their own action bar').toEqual([]);
  });

  it('[UI-05b] every flex scroll container can shrink below its content', () => {
    const broken: string[] = [];
    for (const file of files) {
      for (const tag of scrollContainerTags(readFileSync(file, 'utf8'))) {
        const isFlexChild = /\bflex-1\b/.test(tag);
        const scrolls = /\boverflow-(y-)?auto\b|\boverflow-(y-)?scroll\b/.test(tag);
        if (isFlexChild && scrolls && !/\bmin-h-0\b/.test(tag)) {
          broken.push(`${file}: flex-1 + overflow without min-h-0`);
        }
      }
    }
    expect(broken, 'flex scroll containers that cannot actually scroll').toEqual([]);
  });
});
