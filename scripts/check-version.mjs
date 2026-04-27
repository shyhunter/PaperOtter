#!/usr/bin/env node
/**
 * CLI entry point for version consistency checking.
 * Reads all version sources from real files and delegates to the
 * shared checkVersions() logic (also used in unit tests via src/lib/checkVersion.ts).
 *
 * Usage:
 *   node scripts/check-version.mjs
 *   GITHUB_REF_NAME=v1.0.0-beta.4 node scripts/check-version.mjs
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

// ── Read version sources ───────────────────────────────────────────────────

function readText(relPath) {
  return readFileSync(resolve(root, relPath), 'utf8');
}

// package.json
const pkg = JSON.parse(readText('package.json'));
const packageJson = pkg.version;

// src-tauri/tauri.conf.json
const tauri = JSON.parse(readText('src-tauri/tauri.conf.json'));
const tauriConf = tauri.version;

// src-tauri/Cargo.toml — extract from [package] section
const cargoText = readText('src-tauri/Cargo.toml');
const cargoMatch = cargoText.match(/^\[package\][\s\S]*?^version\s*=\s*"([^"]+)"/m);
if (!cargoMatch) {
  console.error('Could not parse version from src-tauri/Cargo.toml');
  process.exit(1);
}
const cargoToml = cargoMatch[1];

// src/components/SplashScreen.tsx — APP_VERSION = '...'
const splashText = readText('src/components/SplashScreen.tsx');
const splashMatch = splashText.match(/APP_VERSION\s*=\s*['"]([^'"]+)['"]/);
if (!splashMatch) {
  console.error('Could not parse APP_VERSION from src/components/SplashScreen.tsx');
  process.exit(1);
}
const splashScreen = splashMatch[1];

// src/components/Dashboard.tsx — useState('...')  fallback
const dashText = readText('src/components/Dashboard.tsx');
const dashMatch = dashText.match(/useState\s*\(\s*['"]([0-9][^'"]+)['"]\s*\)/);
if (!dashMatch) {
  console.error('Could not parse version useState fallback from src/components/Dashboard.tsx');
  process.exit(1);
}
const dashboardFallback = dashMatch[1];

// src/components/AboutDialog.tsx — APP_VERSION_FALLBACK = '...'
const aboutText = readText('src/components/AboutDialog.tsx');
const aboutMatch = aboutText.match(/APP_VERSION_FALLBACK\s*=\s*['"]([^'"]+)['"]/);
if (!aboutMatch) {
  console.error('Could not parse APP_VERSION_FALLBACK from src/components/AboutDialog.tsx');
  process.exit(1);
}
const aboutDialogFallback = aboutMatch[1];

// Git tag: only if GITHUB_REF_NAME looks like a version tag (e.g. v1.0.0-beta.4)
const refName = process.env.GITHUB_REF_NAME ?? '';
const gitTag = /^v\d/.test(refName) ? refName.replace(/^v/, '') : undefined;

// ── Inline check logic (mirrors src/lib/checkVersion.ts) ──────────────────
// We duplicate the logic here rather than importing the TS module to keep the
// script runnable with plain Node (no build step needed in CI).

const base = packageJson;
const mismatches = [];

const checks = [
  ['src-tauri/tauri.conf.json', tauriConf],
  ['src-tauri/Cargo.toml', cargoToml],
  ['src/components/SplashScreen.tsx (APP_VERSION)', splashScreen],
  ['src/components/Dashboard.tsx (useState fallback)', dashboardFallback],
  ['src/components/AboutDialog.tsx (APP_VERSION_FALLBACK)', aboutDialogFallback],
];

for (const [label, version] of checks) {
  if (version !== base) {
    mismatches.push(`  ${label}: "${version}" (expected "${base}")`);
  }
}

if (gitTag !== undefined && gitTag !== base) {
  mismatches.push(`  git tag: "${gitTag}" (expected "${base}")`);
}

if (mismatches.length > 0) {
  console.error(`\nVersion mismatch detected (baseline: package.json = "${base}"):`);
  for (const m of mismatches) console.error(m);
  console.error('');
  process.exit(1);
} else {
  const tagLine = gitTag !== undefined ? ` | git tag: ${gitTag}` : '';
  console.log(`All versions consistent: ${base}${tagLine} ✓`);
}
