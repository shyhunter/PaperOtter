#!/usr/bin/env node
// Generates the three winget manifest files for a release.
//
//   node scripts/winget-manifests.mjs <version> <SHA256SUMS.txt> <outdir>
//
// winget packages live in Microsoft's winget-pkgs repository, not in this one,
// so these files are not committed: the release workflow builds them and keeps
// them as a workflow artifact. Submitting a release then means copying three
// files into a fork of winget-pkgs rather than hand-writing YAML and pasting a
// hash, which is the step where a wrong digest usually gets in.
//
// The digest is read out of SHA256SUMS.txt rather than recomputed, so the
// manifest describes exactly the bytes the release published. If the checksum
// step ever stops running, this fails rather than guessing.

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const [version, sumsPath, outDir] = process.argv.slice(2);
if (!version || !sumsPath || !outDir) {
  console.error('usage: winget-manifests.mjs <version> <SHA256SUMS.txt> <outdir>');
  process.exit(2);
}

const PACKAGE_ID = 'shyhunter.PaperOtter';
const MANIFEST_VERSION = '1.6.0';
const REPO = 'https://github.com/shyhunter/PaperOtter';
const installerName = `PaperOtter_${version}_x64-setup.exe`;

const sums = readFileSync(sumsPath, 'utf8');
const line = sums.split('\n').find((l) => l.trim().endsWith(installerName));
if (!line) {
  console.error(`no checksum for ${installerName} in ${sumsPath}`);
  console.error('the file lists:\n' + sums.trim());
  process.exit(1);
}
const sha256 = line.trim().split(/\s+/)[0].toUpperCase();
if (!/^[0-9A-F]{64}$/.test(sha256)) {
  console.error(`checksum for ${installerName} is not a sha256: ${sha256}`);
  process.exit(1);
}

// winget rejects a version manifest whose PackageVersion carries a leading v.
const packageVersion = version.replace(/^v/, '');

const files = {
  [`${PACKAGE_ID}.yaml`]: `# Created for ${REPO}/releases/tag/v${packageVersion}
PackageIdentifier: ${PACKAGE_ID}
PackageVersion: ${packageVersion}
DefaultLocale: en-US
ManifestType: version
ManifestVersion: ${MANIFEST_VERSION}
`,

  [`${PACKAGE_ID}.installer.yaml`]: `PackageIdentifier: ${PACKAGE_ID}
PackageVersion: ${packageVersion}
InstallerType: nullsoft
Installers:
  - Architecture: x64
    InstallerUrl: ${REPO}/releases/download/v${packageVersion}/${installerName}
    InstallerSha256: ${sha256}
ManifestType: installer
ManifestVersion: ${MANIFEST_VERSION}
`,

  [`${PACKAGE_ID}.locale.en-US.yaml`]: `PackageIdentifier: ${PACKAGE_ID}
PackageVersion: ${packageVersion}
PackageLocale: en-US
Publisher: shyhunter
PublisherUrl: https://github.com/shyhunter
PackageName: PaperOtter
PackageUrl: ${REPO}
License: MIT
LicenseUrl: ${REPO}/blob/main/LICENSE
ShortDescription: Compress, convert and edit PDFs, images and documents on your own machine.
Description: >-
  PaperOtter is a local document toolkit. Twenty-two tools for PDFs, images and
  documents run on your own machine, with no account, no uploads and no
  telemetry. Ghostscript is bundled, so twenty-one of the twenty-two need
  nothing else installed.
Tags:
  - pdf
  - image
  - compress
  - convert
  - offline
  - privacy
ManifestType: defaultLocale
ManifestVersion: ${MANIFEST_VERSION}
`,
};

mkdirSync(outDir, { recursive: true });
for (const [name, body] of Object.entries(files)) {
  writeFileSync(join(outDir, name), body, 'utf8');
  console.log(`wrote ${join(outDir, name)}`);
}
console.log(`\ninstaller: ${installerName}`);
console.log(`sha256:    ${sha256}`);
