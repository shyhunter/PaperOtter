import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';

/**
 * [CI-APT-01] Linux build packages come from one cached step.
 *
 * GitHub's Ubuntu mirror is sometimes very slow: on 2026-10-22 two
 * rust-integration runs spent 33 and 19+ minutes downloading 55 MB at
 * ~28 kB/s, against 27 seconds on a good mirror. Ten copies of the same
 * apt-get lines meant ten chances a day to hit it. The packages are now
 * installed by .github/actions/linux-build-deps, which caches the .deb files
 * with actions/cache, and every apt call gives up on a stalled mirror quickly.
 */
const ACTION = '.github/actions/linux-build-deps/action.yml';
const action = existsSync(ACTION) ? readFileSync(ACTION, 'utf-8') : '';
const workflows = readdirSync('.github/workflows')
  .filter((f) => f.endsWith('.yml'))
  .map((f) => ({ f, text: readFileSync(`.github/workflows/${f}`, 'utf-8') }));

describe('[CI-APT-01] Linux packages are cached and fail over fast', () => {
  it('has one shared step that caches the downloaded packages', () => {
    expect(action).toMatch(/uses: actions\/cache@[0-9a-f]{40} # v\d/);
    expect(action).toContain('libwebkit2gtk-4.1-dev');
    expect(action).toContain('Dir::Cache::Archives=');
    // env.ImageOS is empty inside an expression; the key must take the image
    // from the shell, or 22.04 and 24.04 runners share one cache.
    expect(action).not.toContain('env.ImageOS');
    expect(action).toMatch(/key: apt-\$\{\{ steps\.key\.outputs\.image \}\}/);
  });

  it('no workflow installs the build packages itself', () => {
    for (const { f, text } of workflows) {
      expect(text, f).not.toMatch(/apt-get install[^\n]*libwebkit2gtk-4\.1-dev/);
    }
  });

  it('every remaining apt-get call gives up on a stalled mirror quickly', () => {
    const calls = [action, ...workflows.map((w) => w.text)]
      .flatMap((t) => t.match(/sudo apt-get (?:update|install)[^\n]*/g) ?? []);
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect(call).toContain('-o Acquire::Retries=3');
      expect(call).toContain('-o Acquire::http::Timeout=10');
    }
  });
});
