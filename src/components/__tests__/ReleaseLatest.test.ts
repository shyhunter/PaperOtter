import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Rule: whatever version someone has, they are sent to the NEWEST release.
 * GitHub's "latest" release is the single source of truth for that, so:
 *
 * [LATEST-01] publishing marks a stable release latest only when it is newer
 * than the current latest -- an old-line hotfix published after a newer
 * release must not take "latest" away from it.
 *
 * [LATEST-02] the landing page's download buttons follow that same "latest"
 * release, not tauri.conf.json. Merging a version bump to main deploys the
 * site before the release exists; buttons built from tauri.conf.json then
 * pointed at installers that did not exist yet, and every visitor got a 404
 * until release.yml finished.
 */
const release = readFileSync('.github/workflows/release.yml', 'utf-8');
const promote = release.slice(
  release.indexOf('- name: Promote draft to published release'),
  release.indexOf('- name: Announce the release in Discussions'),
);
const pages = readFileSync('.github/workflows/pages.yml', 'utf-8');

describe('[LATEST-01] publishing sets "latest" only for the newest version', () => {
  it('compares against the current latest release with a version sort', () => {
    expect(promote).toContain('releases/latest');
    expect(promote).toContain('sort -V');
  });

  it('says --latest or --latest=false explicitly, never leaves it to GitHub', () => {
    expect(promote).toContain('--latest=true');
    expect(promote).toContain('--latest=false');
  });
});

describe('[LATEST-02] the download buttons follow the latest published release', () => {
  it('reads the version from GitHub, not from tauri.conf.json', () => {
    const rewrite = pages.slice(pages.indexOf('VER='), pages.indexOf('sed -E -i'));
    expect(rewrite).toContain('releases/latest');
    expect(rewrite).not.toContain('tauri.conf.json');
  });
});
