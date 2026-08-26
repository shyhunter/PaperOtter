import { readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Every source file under `src`, excluding tests.
 *
 * A hand-rolled walk rather than `fs.globSync`, which the guards used first.
 * That landed in Node 22; CI runs Node 20, where it is `undefined`. The suites
 * then failed to *load* -- so their tests never ran, while the summary line
 * still read "1007 passed". The job did fail, but the count above it said
 * everything was fine, which is the misleading half of that failure mode.
 *
 * Not a test file: vitest collects `*.test.ts` only, so this is never run as one.
 */
export function sourceFiles(extensions: readonly string[]): string[] {
  const found: string[] = [];

  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
        walk(path);
      } else if (extensions.some((ext) => entry.name.endsWith(ext))) {
        found.push(path);
      }
    }
  };

  walk('src');
  return found.sort();
}
