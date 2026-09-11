import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { sourceFiles } from '@/i18n/__tests__/sourceFiles';
import { dataUrlToBytes } from '@/lib/dataUrl';

/**
 * [CSP-01] Nothing in the app may `fetch()` a data: URL.
 *
 * The app ships this content security policy:
 *
 *   connect-src ipc: http://ipc.localhost
 *
 * `data:` is not on that list, so `fetch(dataUrl)` is refused in the packaged
 * app. It is refused as a *rejected promise*, which nothing was catching, so
 * three separate features failed in complete silence:
 *
 *   - choosing a background colour for a signature did nothing,
 *   - clicking a saved signature in the editor placed nothing,
 *   - placing a newly drawn one placed nothing.
 *
 * None of it reproduced in a browser, where the policy is not applied. So this
 * reads the policy out of tauri.conf.json and checks the source against it,
 * which is the only place the two can be compared.
 */

const CSP: string = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf-8')).app.security.csp;

const SOURCES = sourceFiles(['.ts', '.tsx']).filter(
  (f) => f.startsWith('src/lib/') || f.startsWith('src/components/') || f.startsWith('src/hooks/'),
);

describe('[CSP-01] data: URLs are decoded, not fetched', () => {
  it('is actually scanning files', () => {
    // A scanner that walks nothing passes every check it makes. `globSync` gave
    // this suite exactly that failure on CI: it lands in Node 22, CI runs Node
    // 20, and the suite failed to load while the summary line still counted the
    // other tests as green.
    expect(SOURCES.length, 'the walk found no files').toBeGreaterThan(20);
  });

  it('confirms the policy that makes this necessary', () => {
    const connect = CSP.split(';').map((d) => d.trim()).find((d) => d.startsWith('connect-src'));
    expect(connect, 'no connect-src in the CSP').toBeDefined();
    expect(connect, 'data: is now allowed; this rule can be revisited').not.toContain('data:');
  });

  it('has no fetch of a data URL anywhere in the app', () => {
    const offenders: string[] = [];

    for (const file of SOURCES) {
      readFileSync(file, 'utf-8').split('\n').forEach((line, i) => {
        if (line.trimStart().startsWith('*') || line.trimStart().startsWith('//')) return;
        // fetch(x) where x is plainly a data URL: the variables these were
        // called on are named for what they hold.
        if (/\bfetch\(\s*(?:composited|dataUrl|url|src)\b/.test(line)) {
          offenders.push(`${file}:${i + 1} ${line.trim()}`);
        }
      });
    }

    expect(offenders, 'use dataUrlToBytes or an <img>, which img-src allows').toEqual([]);
  });

  it('decodes a data URL to the bytes it encodes', () => {
    // "PDF" -> UERG
    expect([...dataUrlToBytes('data:application/pdf;base64,UERG')]).toEqual([0x50, 0x44, 0x46]);
  });

  it('refuses something that is not a base64 data URL rather than returning nothing', () => {
    expect(() => dataUrlToBytes('https://example.com/x.png')).toThrow();
  });
});
