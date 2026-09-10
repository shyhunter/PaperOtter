// macOS release build, with the DMG step made reliable.
//
// Tauri vendors create-dmg as bundle_dmg.sh and rewrites it on every build, so
// the script itself cannot be patched durably. It has a real bug: the unmount
// retry loop only retries when hdiutil exits 16 (EBUSY), but on this macOS
// hdiutil returns 2 for the same "Resource busy" condition, so it gives up on
// the first attempt instead of using its own 3-attempt backoff.
//
// The condition is a race — Spotlight or fseventsd touching the volume that was
// mounted moments earlier — so it fails intermittently. When it does, the disk
// image is already fully staged; only the final unmount-and-convert is missing.
// This wrapper clears stale mounts first, and finishes the job if the race bites.
//
//   node scripts/build-macos.mjs [...extra tauri args]

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const BUNDLE = 'src-tauri/target/release/bundle';
const DMG_DIR = join(BUNDLE, 'dmg');
const sh = (cmd, args, opts = {}) =>
  spawnSync(cmd, args, { encoding: 'utf8', ...opts });

function mountedScratchVolumes() {
  const out = sh('ls', ['/Volumes']).stdout ?? '';
  return out.split('\n').filter((v) => v.startsWith('dmg.')).map((v) => `/Volumes/${v}`);
}

function detach(target, { force = false } = {}) {
  const args = ['detach', target, '-quiet'];
  if (force) args.push('-force');
  return sh('hdiutil', args).status === 0;
}

/** Unmount with the backoff create-dmg meant to have, then force as a last resort. */
function detachStubborn(target) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    if (detach(target)) return true;
    execFileSync('sleep', [String(2 ** attempt)]);
  }
  return detach(target, { force: true });
}

function cleanStaleMounts(label) {
  const vols = mountedScratchVolumes();
  for (const v of vols) {
    process.stdout.write(`  ${label}: unmounting ${v}\n`);
    detachStubborn(v);
  }
  if (existsSync(DMG_DIR)) {
    for (const f of readdirSync(DMG_DIR)) {
      if (f.startsWith('rw.') && f.endsWith('.dmg')) {
        rmSync(join(DMG_DIR, f));
        process.stdout.write(`  ${label}: removed scratch ${f}\n`);
      }
    }
  }
  for (const f of existsSync(join(BUNDLE, 'macos')) ? readdirSync(join(BUNDLE, 'macos')) : []) {
    if (f.startsWith('rw.') && f.endsWith('.dmg')) rmSync(join(BUNDLE, 'macos', f));
  }
}

/** The staged image is complete; convert it to the compressed DMG create-dmg would have made. */
function finishStagedDmg() {
  if (!existsSync(DMG_DIR)) return null;
  const scratch = readdirSync(DMG_DIR).find((f) => f.startsWith('rw.') && f.endsWith('.dmg'));
  if (!scratch) return null;

  for (const v of mountedScratchVolumes()) detachStubborn(v);

  // rw.<pid>.<final name>.dmg  ->  <final name>.dmg
  const finalName = scratch.replace(/^rw\.\d+\./, '');
  const src = join(DMG_DIR, scratch);
  const out = join(DMG_DIR, finalName);
  process.stdout.write(`  finishing DMG: ${scratch} -> ${finalName}\n`);

  // UDZO with no imagekey: the same format flags bundle_dmg.sh uses.
  const conv = sh('hdiutil', ['convert', src, '-format', 'UDZO', '-ov', '-o', out]);
  if (conv.status !== 0) {
    process.stderr.write(conv.stderr || conv.stdout || 'hdiutil convert failed\n');
    return null;
  }
  rmSync(src);
  return out;
}

cleanStaleMounts('pre-build');

const extra = process.argv.slice(2);
const build = sh('npm', ['run', 'tauri', 'build', ...(extra.length ? ['--', ...extra] : [])],
  { stdio: 'inherit' });

if (build.status === 0) {
  cleanStaleMounts('post-build');
  process.stdout.write('\n  build ok\n');
  process.exit(0);
}

process.stdout.write('\n  tauri build reported failure — checking whether only the DMG unmount raced\n');
const recovered = finishStagedDmg();
cleanStaleMounts('post-recovery');

if (recovered && existsSync(recovered)) {
  process.stdout.write(`  recovered: ${recovered}\n`);
  process.exit(0);
}
process.stderr.write('  build failed for a reason other than the DMG unmount\n');
process.exit(build.status ?? 1);
