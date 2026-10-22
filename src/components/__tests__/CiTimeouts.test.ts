import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * [CI-TIMEOUT-01] Every CI job has a time limit.
 *
 * Without one GitHub waits six hours. On 2026-10-22 rust-integration hung in
 * `apt-get install` for 33 minutes on PR #66 (a rerun took 27 seconds) and,
 * being a required check, would have blocked the release PR for the full six.
 * Limits sit about three times above the longest of 22 successful runs.
 */
const ci = readFileSync('.github/workflows/ci.yml', 'utf-8');
const jobsBlock = ci.slice(ci.indexOf('\njobs:'));
const jobNames = [...jobsBlock.matchAll(/^ {2}([a-z0-9-]+):$/gm)].map((m) => m[1]);

describe('[CI-TIMEOUT-01] no CI job can hang for six hours', () => {
  it('finds the jobs', () => {
    expect(jobNames).toContain('rust-integration');
  });

  it.each(jobNames)('%s sets timeout-minutes', (name) => {
    const start = jobsBlock.indexOf(`\n  ${name}:\n`);
    const rest = jobsBlock.slice(start + 1);
    const next = rest.slice(1).search(/^ {2}[a-z0-9-]+:$/m);
    const body = next === -1 ? rest : rest.slice(0, next + 1);
    expect(body).toMatch(/^ {4}timeout-minutes: \d+$/m);
  });
});
