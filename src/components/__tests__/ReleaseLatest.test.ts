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

// [LATEST-03] A release published with GITHUB_TOKEN never fires `release:
// published` in other workflows (GitHub suppresses token-created events except
// workflow_dispatch), so v1.0.2 went out with the site still offering 1.0.1.
// The publish job has to start the Pages deploy itself.
describe('[LATEST-03] publishing a release redeploys the landing page', () => {
  const publishJob = release.slice(release.indexOf('  publish-release:'));

  it('dispatches pages.yml once the release is live', () => {
    const dispatch = publishJob.indexOf('gh workflow run pages.yml');
    expect(dispatch).toBeGreaterThan(publishJob.indexOf('- name: Promote draft to published release'));
  });

  it('grants the publish job actions: write for that, and nothing broader', () => {
    expect(publishJob).toMatch(/permissions:\n(\s+\S+: \S+\n)*\s+actions: write/);
    const header = release.slice(0, release.indexOf('jobs:'));
    expect(header).not.toContain('actions:');
  });
});

describe('[LATEST-02] the download buttons follow the latest published release', () => {
  it('reads the version from GitHub, not from tauri.conf.json', () => {
    const rewrite = pages.slice(pages.indexOf('VER='), pages.indexOf('sed -E -i'));
    expect(rewrite).toContain('releases/latest');
    expect(rewrite).not.toContain('tauri.conf.json');
  });
});
