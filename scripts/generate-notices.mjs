#!/usr/bin/env node
/**
 * Generates LICENSES/NOTICES.txt: the copyright notices PaperOtter owes for the
 * code compiled and bundled into it.
 *
 * Why this exists. Ghostscript is handled by hand in THIRD-PARTY-LICENSES.md
 * because it is one component, it is AGPL, and the reasoning around it needs
 * prose. Everything else is 600-odd permissive dependencies, and those licences
 * still carry obligations: MIT requires its copyright notice to travel with
 * "all copies or substantial portions", Apache-2.0 section 4 requires a copy of
 * the licence and propagation of any NOTICE file, and BSD-3-Clause explicitly
 * names binary redistribution. A binary that statically links 650 crates and
 * bundles 130 npm packages owes all of that, and no human is going to maintain
 * the list by hand without it going stale on the next `cargo update`.
 *
 * Why no new tooling. cargo-about and license-checker both do this well, but
 * everything needed is already on disk: `cargo metadata` knows every crate's
 * name, version and SPDX id, `npm ls` knows the production tree, and the
 * licence texts sit in the registry sources and in node_modules. One script
 * with no dependency is easier to trust than a tool that has to be installed
 * before a release can be cut.
 *
 * Usage:
 *   node scripts/generate-notices.mjs           write LICENSES/NOTICES.txt
 *   node scripts/generate-notices.mjs --check   exit 1 if it is out of date
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'LICENSES', 'NOTICES.txt');
const CHECK = process.argv.includes('--check');

/**
 * The two lockfiles are the only things that can change what this file must
 * contain. Recording their fingerprints in the output lets --check answer
 * "is this stale?" from a bare checkout: no Rust toolchain, no node_modules,
 * no cargo metadata. That matters because the check is worth running on every
 * dependency bump, and a Rust install per Dependabot PR is not worth paying for.
 */
const LOCKFILES = [
  ['cargo', join(ROOT, 'src-tauri', 'Cargo.lock')],
  ['npm', join(ROOT, 'package-lock.json')],
];

function fingerprints() {
  return LOCKFILES.map(([name, path]) => {
    const hash = existsSync(path)
      ? createHash('sha256').update(readFileSync(path)).digest('hex').slice(0, 16)
      : 'missing';
    return `${name}=${hash}`;
  }).join(' ');
}

const FINGERPRINT_LINE = 'Generated-From: ';

/** LICENSE, LICENCE, COPYING, NOTICE, in any case, with or without extension. */
const LICENCE_FILE = /^(licen[cs]e|copying|notice)([-_.].*)?$/i;

/**
 * Licence texts that live next to a package. Apache-2.0 NOTICE files are picked
 * up here too: section 4(d) requires their contents to be carried forward, and
 * they are the one part of an Apache distribution that is not boilerplate.
 */
function licenceTexts(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    if (!LICENCE_FILE.test(name)) continue;
    try {
      const body = readFileSync(join(dir, name), 'utf8').trim();
      // A stub that only points elsewhere is worse than nothing: it reads as a
      // licence while carrying no grant and no copyright line.
      if (body.length > 120) out.push({ name, body });
    } catch {
      // Unreadable file: the SPDX id below still records the terms.
    }
  }
  return out;
}

function rustCrates() {
  // No --filter-platform. The graph is resolved per target, and PaperOtter ships
  // four of them; the union is the only set that cannot under-report. Over-
  // reporting a crate that macOS never compiles is harmless in a notices file.
  const meta = JSON.parse(
    execFileSync('cargo', ['metadata', '--format-version', '1'], {
      cwd: join(ROOT, 'src-tauri'),
      encoding: 'utf8',
      maxBuffer: 128 * 1024 * 1024,
    }),
  );
  return meta.packages
    .filter((p) => p.name !== 'papercut')
    .map((p) => ({
      name: p.name,
      version: p.version,
      spdx: p.license || null,
      repository: p.repository || null,
      texts: licenceTexts(dirname(p.manifest_path)),
    }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
}

function npmPackages() {
  // --omit=dev, because vitest and eslint are not in the shipped bundle. --all
  // because a transitive MIT package owes its notice exactly as a direct one does.
  let paths = [];
  try {
    paths = execFileSync('npm', ['ls', '--omit=dev', '--all', '--parseable'], {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    })
      .split('\n')
      .filter((p) => p.includes('/node_modules/'));
  } catch (err) {
    // npm ls exits non-zero on peer-dependency complaints while still printing
    // a complete tree. Losing the notices over a warning would be the wrong call.
    paths = String(err.stdout || '')
      .split('\n')
      .filter((p) => p.includes('/node_modules/'));
  }

  const seen = new Map();
  for (const dir of [...new Set(paths)].sort()) {
    const manifest = join(dir, 'package.json');
    if (!existsSync(manifest)) continue;
    let pkg;
    try {
      pkg = JSON.parse(readFileSync(manifest, 'utf8'));
    } catch {
      continue;
    }
    const spdx =
      typeof pkg.license === 'string'
        ? pkg.license
        : pkg.license?.type || (Array.isArray(pkg.licenses) ? pkg.licenses.map((l) => l.type).join(' OR ') : null);
    const key = `${pkg.name}@${pkg.version}`;
    if (seen.has(key)) continue;
    seen.set(key, {
      name: pkg.name,
      version: pkg.version,
      spdx: spdx || null,
      repository: typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url || null,
      texts: licenceTexts(dir),
    });
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
}

const RULE = '='.repeat(78);

/**
 * Grouped by licence text, not by package.
 *
 * Written per-package first, which produced a 5.3 MB file: the Apache-2.0 text
 * alone is 11 KB and several hundred crates each ship their own byte-identical
 * copy. PaperOtter's entire macOS .dmg is 9 MB, so that version would have more
 * than doubled every download to say the same thing three hundred times.
 *
 * Grouping satisfies the same obligation. Every package is still named, with
 * its version and SPDX id, and the full text of the licence covering it is
 * still reproduced. It is printed once per distinct text rather than once per
 * package, which is how large notices files have always been laid out.
 */
function section(title, entries) {
  const groups = new Map();
  const undocumented = [];

  for (const e of entries) {
    if (!e.texts.length) {
      undocumented.push(e);
      continue;
    }
    // The key is every licence file the package ships, joined. A crate offering
    // MIT and Apache side by side is a different grant from one offering only
    // MIT, and must not be folded in with it.
    const key = e.texts.map((t) => t.body).join('\n');
    if (!groups.has(key)) groups.set(key, { texts: e.texts, members: [] });
    groups.get(key).members.push(e);
  }

  // Largest groups first: the reader meets Apache-2.0 and the common MIT
  // wordings before the long tail of one-package variants.
  const ordered = [...groups.values()].sort((a, b) => b.members.length - a.members.length);

  const lines = [RULE, title, RULE, ''];
  for (const g of ordered) {
    const n = g.members.length;
    lines.push(RULE);
    lines.push(n === 1 ? 'The following package is distributed under this licence:' : `The following ${n} packages are distributed under this licence:`);
    lines.push('');
    for (const m of g.members) lines.push(`  ${m.name} ${m.version}${m.spdx ? `  (${m.spdx})` : ''}`);
    lines.push('', '-'.repeat(78), '');
    for (const t of g.texts) {
      if (g.texts.length > 1) lines.push(`[${t.name}]`, '');
      lines.push(t.body, '');
    }
  }

  if (undocumented.length) {
    // Listed, never silently dropped. The SPDX id states the terms; this says
    // where the canonical text and the copyright line actually live.
    lines.push(RULE);
    lines.push(`The following ${undocumented.length} packages ship no licence file. Their terms are as`);
    lines.push('stated below; canonical texts are at https://spdx.org/licenses/ and the');
    lines.push('copyright notice is held at each source.');
    lines.push('');
    for (const e of undocumented) {
      lines.push(`  ${e.name} ${e.version}  ${e.spdx || 'NO LICENCE DECLARED'}`);
      if (e.repository) lines.push(`    ${e.repository}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

// Before anything expensive. --check exists to be cheap: reading two lockfiles
// is the whole job, so it can gate every dependency PR without a toolchain.
if (CHECK) {
  if (!existsSync(OUT)) {
    console.error(`${OUT} does not exist. Run: node scripts/generate-notices.mjs`);
    process.exit(1);
  }
  const want = fingerprints();
  const line = readFileSync(OUT, 'utf8')
    .split('\n')
    .find((l) => l.startsWith(FINGERPRINT_LINE));
  const have = line ? line.slice(FINGERPRINT_LINE.length).trim() : '(none recorded)';
  if (have !== want) {
    console.error(
      'NOTICES.txt is out of date.\n' +
        `  recorded: ${have}\n` +
        `  actual:   ${want}\n` +
        'A lockfile changed without the notices being regenerated, so the file no\n' +
        'longer describes what is shipped. Run: node scripts/generate-notices.mjs',
    );
    process.exit(1);
  }
  console.log(`NOTICES.txt is current (${want}).`);
  process.exit(0);
}

const crates = rustCrates();
const packages = npmPackages();

const missing = [...crates, ...packages].filter((e) => !e.spdx);

const header = `PaperOtter third-party notices
${RULE}

Generated by scripts/generate-notices.mjs. Do not edit by hand: run the script.
${FINGERPRINT_LINE}${fingerprints()}

PaperOtter's own source is MIT, in LICENSE. This file covers the third-party code
compiled and bundled into the application, and reproduces the copyright notices
those licences require to travel with a binary distribution.

Ghostscript is NOT in this file. It ships as a separate executable rather than
compiled in, it is AGPL-3.0 rather than permissive, and it is documented in
THIRD-PARTY-LICENSES.md with its full licence in AGPL-3.0.txt. Both are in this
same folder.

  Rust crates compiled into the application    ${String(crates.length).padStart(4)}
  JavaScript packages bundled into the UI      ${String(packages.length).padStart(4)}
  Packages with no declared licence            ${String(missing.length).padStart(4)}

The Rust list is the union across every target PaperOtter ships (macOS arm64 and
x86_64, Windows x86_64, Linux x86_64), so it covers each platform's build rather
than the machine that generated it.

`;

const body = `${header}
${section('RUST CRATES', crates)}
${section('JAVASCRIPT PACKAGES', packages)}`;

writeFileSync(OUT, body);
console.log(`Wrote ${OUT}`);
console.log(`  ${crates.length} Rust crates, ${packages.length} npm packages`);
if (missing.length) {
  // Surfaced, never swallowed: a package with no declared licence is the one
  // case a notices file cannot resolve on its own.
  console.log(`  ${missing.length} with no declared licence:`);
  for (const e of missing) console.log(`    ${e.name} ${e.version}`);
}
