#!/usr/bin/env node
/**
 * Fails when a Tauri package and its Rust crate are on different major.minor
 * releases -- the same rule `tauri build` enforces, checked here on every PR.
 *
 * Why this exists. `tauri build` refuses to start with "Found version
 * mismatched Tauri packages" when, say, @tauri-apps/plugin-http is 2.6 and the
 * tauri-plugin-http crate is 2.7. PR CI never runs `tauri build` (it is only
 * run by release.yml), so a dependency bump that moves one side and not the
 * other passes every check and then breaks the next release, when a fix is
 * most expensive. Dependabot does exactly that: npm and cargo are separate
 * ecosystems to it and it bumps them in separate PRs.
 *
 * Reads both lockfiles only, so it needs no node_modules and no Rust toolchain.
 * A JS package with no crate counterpart (a JS-only plugin) is skipped.
 *
 * Usage: node scripts/check-tauri-versions.mjs
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const npmLock = JSON.parse(readFileSync(resolve(root, 'package-lock.json'), 'utf8')).packages;
const cargoLock = readFileSync(resolve(root, 'src-tauri', 'Cargo.lock'), 'utf8');

function crateVersion(name) {
  const m = cargoLock.match(new RegExp(`^name = "${name}"\\nversion = "([^"]+)"`, 'm'));
  return m ? m[1] : null;
}

const majorMinor = (v) => v.split('.').slice(0, 2).join('.');

const rows = [];
for (const [path, entry] of Object.entries(npmLock)) {
  const m = path.match(/^node_modules\/@tauri-apps\/(api|plugin-[a-z0-9-]+)$/);
  if (!m) continue;
  const crate = m[1] === 'api' ? 'tauri' : `tauri-${m[1]}`;
  const rust = crateVersion(crate);
  if (!rust) continue;
  rows.push({ npm: `@tauri-apps/${m[1]}`, npmVersion: entry.version, crate, rust });
}

const mismatched = rows.filter((r) => majorMinor(r.npmVersion) !== majorMinor(r.rust));

for (const r of rows) {
  const ok = !mismatched.includes(r);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${r.npm} ${r.npmVersion}  <->  ${r.crate} ${r.rust}`);
}

if (mismatched.length) {
  console.error(
    '\nTauri npm packages and Rust crates must share major.minor, or `tauri build`\n' +
      'refuses to run and the next release fails. Move both sides together.',
  );
  process.exit(1);
}
console.log(`\nAll ${rows.length} Tauri package pairs match.`);
