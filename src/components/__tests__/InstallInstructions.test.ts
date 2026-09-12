import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

// `@types/jsdom` is not installed and this is one of two places jsdom is used
// directly, so the surface needed here is spelled out rather than adding a
// package during a release.
type JsdomCtor = new (html: string) => { window: { document: Document } };
const { JSDOM } = createRequire(import.meta.url)('jsdom') as { JSDOM: JsdomCtor };

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

  it('gives every platform a card, and every card a default build', () => {
    // Each platform is a card under the demo; `[data-pick]` marks the build the
    // script recommends inside it. A card without one leaves a visitor with no
    // steer on the choice the user agent could not make for them.
    for (const os of ['mac', 'windows', 'linux']) {
      const card = new RegExp(`data-os="${os}"[\\s\\S]*?</div>`).exec(site)?.[0];
      expect(card, `${os} has no download card`).toBeTruthy();
      expect(card, `${os}'s card marks no default build`).toContain('data-pick');
    }
  });
});

/**
 * [INSTALL-03] Installing over a Papercut beta does not fail.
 *
 * Found by the first person to try it on Ubuntu:
 *
 *     dpkg: error processing archive PaperOtter_1.0.0_amd64.deb (--unpack):
 *      trying to overwrite '/usr/bin/tauri-app'
 *      which is also in package papercut 1.0.0
 *
 * The rebrand changed the package name (papercut -> paper-otter) but not the
 * binary, which is still Cargo's `[package] name`. So both packages ship the
 * identical path and dpkg refuses to let two of them own one file. Declaring
 * the old name as conflicted and replaced is the Debian idiom for a rename: apt
 * removes the old package instead of stopping.
 *
 * The real fix is renaming the binary, which also stops `ps`, Activity Monitor
 * and crash reports all saying "tauri-app" -- but that is a Rust-side change
 * wanting a real build, and this is the part that unblocks an upgrade today.
 */
describe('[INSTALL-03] the deb supersedes the old Papercut package', () => {
  const conf = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf-8')) as {
    bundle: { linux: { deb: { conflicts?: string[]; replaces?: string[] } } };
  };
  const deb = conf.bundle.linux.deb;

  it('names the old package in both conflicts and replaces', () => {
    // Replaces alone lets the files be overwritten while both stay installed;
    // Conflicts alone refuses. Together they mean "this supersedes that".
    expect(deb.conflicts, 'without Conflicts apt leaves the old package in place').toContain('papercut');
    expect(deb.replaces, 'without Replaces dpkg still refuses the shared file').toContain('papercut');
  });
});

/**
 * [INSTALL-04] The Linux steps say where to stand before they say what to type.
 *
 * The first person to follow them on Ubuntu got:
 *
 *     E: Unsupported file ./PaperOtter_1.0.0_amd64.deb given on command line
 *
 * not because anything was wrong with the package, but because apt uses that
 * same wording for a path it cannot resolve and they were in the wrong folder.
 * The instruction had a bare `./PaperOtter_...deb` with no `cd` before it and no
 * explanation of what the `./` was for, so both of the things that can go wrong
 * here were invisible.
 */
describe('[INSTALL-04] the Linux steps cannot strand someone in the wrong folder', () => {
  // Parsed, not grepped. The first version of this test searched the raw HTML
  // and passed happily with the `cd` step deleted, because the copy button's
  // `data-copy` attribute still carried the same string. Reading the rendered
  // <code> elements is the only way it can see what a visitor actually sees.
  const doc = new JSDOM(readFileSync('site/index.html', 'utf-8')).window.document;
  const panel = doc.querySelector('.steps[data-panel="linux"]') as HTMLElement | null;
  const commands = [...(panel?.querySelectorAll('code') ?? [])].map((c) => c.textContent ?? '');
  const prose = panel?.textContent ?? '';

  it('has a Linux panel at all', () => {
    expect(panel).toBeTruthy();
    expect(commands.length).toBeGreaterThan(0);
  });

  it('tells them to change directory before naming a bare filename', () => {
    const cd = commands.findIndex((c) => c.startsWith('cd '));
    const bare = commands.findIndex((c) => c.includes('./PaperOtter'));
    expect(cd, 'no cd command in the panel').toBeGreaterThan(-1);
    expect(bare, 'no bare-filename command in the panel').toBeGreaterThan(-1);
    expect(cd, 'the bare filename comes before the cd that makes it work').toBeLessThan(bare);
  });

  it('names the error apt actually produces, so it can be searched for', () => {
    expect(prose).toContain('Unsupported file');
  });

  it('offers a whole path as the way out of the question', () => {
    expect(commands.some((c) => /^sudo apt install ~\/Downloads\/PaperOtter/.test(c)),
      'no absolute-path alternative is offered').toBe(true);
  });

  it('tells AppImage users to run it, not just to chmod it', () => {
    expect(commands.some((c) => c.startsWith('chmod +x')), 'no chmod step').toBe(true);
    expect(commands.some((c) => /^\.\/PaperOtter_[\d.]+_amd64\.AppImage$/.test(c)),
      'chmod is given but never the command that starts the app').toBe(true);
  });

  it('says which architecture the Linux builds are', () => {
    // amd64 reads as "AMD only" to a lot of people on Intel machines, and there
    // is no ARM build at all, so both facts have to be on the page.
    expect(prose).toMatch(/amd64/);
    expect(prose).toMatch(/ARM/);
  });
});
