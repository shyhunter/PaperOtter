import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * [INSTALL] Every place that tells a Mac user how to get past Gatekeeper says
 * the same thing, and says the right thing.
 *
 * There is no Apple developer certificate and there is not going to be one for
 * v1.0.0, so this instruction is not a footnote — it is the difference between
 * an app that opens and an app that offers the Trash. It is written in five
 * places (the landing page, the release notes, the README, the FAQ and
 * Troubleshooting) and they had already drifted apart: the landing page walked
 * through Privacy & Security while the release notes gave a Terminal command,
 * for what are two different macOS refusals.
 */

const PLACES = [
  'site/index.html',
  '.github/workflows/release.yml',
  'README.md',
  'docs/wiki/FAQ.md',
  'docs/wiki/Troubleshooting.md',
];

const COMMAND = 'xattr -dr com.apple.quarantine /Applications/PaperOtter.app';

describe('[INSTALL-01] one Gatekeeper instruction, everywhere', () => {
  it('gives the same command in every place it is given', () => {
    for (const file of PLACES) {
      const src = readFileSync(file, 'utf-8');
      if (!src.includes('xattr')) continue;
      expect(src, `${file} gives a different command`).toContain(COMMAND);
    }
  });

  it('never tells anyone to clear every extended attribute', () => {
    // `xattr -cr` strips all of them recursively. Only the quarantine flag is
    // in the way, and naming it is both narrower and easier to justify to
    // someone being asked to paste a command into a terminal.
    for (const file of PLACES) {
      expect(readFileSync(file, 'utf-8'), `${file} still uses the blunt form`)
        .not.toMatch(/xattr\s+-cr\b/);
    }
  });

  it('covers both refusals on the landing page and in the release notes', () => {
    // macOS stops an unsigned app in two different ways, and the fix differs.
    // "Open Anyway" does not appear for the "damaged" one, so a page offering
    // only that route leaves those users stuck.
    for (const file of ['site/index.html', '.github/workflows/release.yml']) {
      const src = readFileSync(file, 'utf-8');
      // The exact phrase macOS uses. Matching the bare word "damaged" was too
      // loose: the Repair PDF card says "Rebuilds a damaged file's structure",
      // so the check passed with the whole install step deleted.
      expect(src, `${file} does not mention the "damaged" refusal`)
        .toMatch(/damaged and can/i);
      expect(src, `${file} does not mention Open Anyway`).toMatch(/Open Anyway/i);
    }
  });

  it('tells them to put the app in Applications before naming that path', () => {
    // The command points at /Applications. Run from Downloads or the mounted
    // dmg, it silently does nothing to the copy they then try to open.
    const site = readFileSync('site/index.html', 'utf-8');
    expect(site).toMatch(/Applications/);
    const notes = readFileSync('.github/workflows/release.yml', 'utf-8');
    expect(notes, 'the release notes name the path without saying to move it there')
      .toMatch(/[Dd]rag the app into Applications/);
  });
});

/**
 * [INSTALL-02] The landing page's download links name the version that ships.
 *
 * The page carries real, version-stamped URLs rather than a placeholder, so it
 * is correct opened straight from the repo or published as a design artifact.
 * The Pages workflow rewrites them from `tauri.conf.json` at deploy time, which
 * protects the published site but not this file — and the file is what every
 * artifact and local preview renders. This is the check that keeps the two in
 * step, and it fails at the version bump rather than after the release.
 */
describe('[INSTALL-02] download links match the shipped version', () => {
  const version = JSON.parse(
    readFileSync('src-tauri/tauri.conf.json', 'utf-8'),
  ).version as string;
  const site = readFileSync('site/index.html', 'utf-8');

  it('names one version, and it is the one in tauri.conf.json', () => {
    const seen = new Set(
      [...site.matchAll(/PaperOtter_(\d+\.\d+\.\d+)_/g)].map((m) => m[1]),
    );
    for (const tag of site.matchAll(/releases\/download\/v(\d+\.\d+\.\d+)\//g)) {
      seen.add(tag[1]);
    }
    expect(seen.size, `site/index.html names several versions: ${[...seen]}`).toBe(1);
    expect([...seen][0]).toBe(version);
  });

  it('offers every installer the release actually publishes', () => {
    // One per asset on the release. A platform missing here is a visitor sent
    // to the releases page to work it out for themselves.
    for (const suffix of ['aarch64.dmg', 'x64.dmg', 'x64-setup.exe', 'amd64.deb', 'amd64.AppImage']) {
      expect(site, `no direct link to the ${suffix} build`).toContain(
        `/releases/download/v${version}/PaperOtter_${version}_${suffix}`,
      );
    }
  });

  it('keeps a default for each platform we detect', () => {
    // The script promotes `[data-pick]` for the detected OS into the button. A
    // platform without one silently leaves the button on the releases page.
    for (const os of ['mac', 'windows', 'linux']) {
      expect(site, `${os} has no default build to promote`).toMatch(
        new RegExp(`data-os="${os}" data-pick`),
      );
    }
  });
});
