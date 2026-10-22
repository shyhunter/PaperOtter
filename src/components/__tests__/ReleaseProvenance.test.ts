import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * [PROVENANCE-01] Every release installer carries a signed build attestation.
 *
 * SHA256SUMS.txt proves a download arrived intact, not who built it: anyone
 * who could replace an installer could replace the checksum beside it. The
 * attestation is signed by Sigstore against this workflow's identity, so
 * `gh attestation verify` can tell a real build from a swapped one (S4).
 */
const workflow = readFileSync('.github/workflows/release.yml', 'utf-8');
const publishJob = workflow.slice(workflow.indexOf('  publish-release:'));

describe('[PROVENANCE-01] release installers are attested', () => {
  it('attests with a SHA-pinned action, like every other action here', () => {
    expect(publishJob).toMatch(/uses: actions\/attest-build-provenance@[0-9a-f]{40} # v\d/);
  });

  it('attests exactly the files that were checksummed', () => {
    expect(publishJob).toContain('work="$RUNNER_TEMP/release-assets"');
    expect(publishJob).toContain('subject-checksums: ${{ runner.temp }}/release-assets/SHA256SUMS.txt');
  });

  it('grants the signing permissions to the publishing job only', () => {
    expect(publishJob).toMatch(/permissions:\n(\s+\S+: \S+\n)*\s+id-token: write/);
    expect(publishJob).toMatch(/permissions:\n(\s+\S+: \S+\n)*\s+attestations: write/);
    const header = workflow.slice(0, workflow.indexOf('jobs:'));
    expect(header).not.toContain('id-token');
    expect(header).not.toContain('attestations');
  });
});
