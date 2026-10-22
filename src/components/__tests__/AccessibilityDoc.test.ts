import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';

/**
 * [A11Y-DOC-01] The accessibility statement stays reachable and true.
 *
 * Someone reading ACCESSIBILITY.md has often just hit a barrier, so a dead
 * report link or a claim that has drifted from the app is worse here than in
 * most docs. These are the facts in it that can go stale on their own.
 */
const doc = readFileSync('ACCESSIBILITY.md', 'utf-8');
const NAMES: Record<string, string> = {
  de: 'German', en: 'English', es: 'Spanish', fr: 'French', it: 'Italian',
  nl: 'Dutch', pl: 'Polish', pt: 'Portuguese', tr: 'Turkish',
};

describe('[A11Y-DOC-01] ACCESSIBILITY.md', () => {
  it('links an issue form that exists', () => {
    expect(doc).toContain('/issues/new?template=accessibility.yml');
    expect(existsSync('.github/ISSUE_TEMPLATE/accessibility.yml')).toBe(true);
  });

  it('is linked from the README and CONTRIBUTING.md', () => {
    expect(readFileSync('README.md', 'utf-8')).toContain('](ACCESSIBILITY.md)');
    expect(readFileSync('CONTRIBUTING.md', 'utf-8')).toContain('ACCESSIBILITY.md#contributor-expectations');
    expect(doc).toContain('## Contributor expectations');
  });

  it('names exactly the interface languages the app ships', () => {
    const shipped = readdirSync('src/i18n').filter((f) => /^[a-z]{2}\.ts$/.test(f)).map((f) => f.slice(0, 2));
    for (const code of shipped) {
      expect(NAMES[code], `no name mapped for ${code}`).toBeDefined();
      expect(doc).toContain(NAMES[code]);
    }
    expect(shipped.length).toBe(Object.keys(NAMES).length);
  });

  it('does not claim conformance it has not earned', () => {
    expect(doc).toContain('has not been evaluated');
    // A positive claim, not the page's own "we don't claim that it conforms".
    expect(doc).not.toMatch(/PaperOtter (conforms|is (fully )?(compliant|accessible))/i);
  });
});
