// Trace the logo source art into a single-path SVG.
//
// Source PNGs live in brand/source/ (gitignored). potrace + jimp install into the
// OS temp dir, never into this repo — package.json and the lockfile stay untouched,
// so notices:check remains valid.
//
//   node scripts/trace-logo.mjs                    full-detail trace
//   node scripts/trace-logo.mjs --small 140        downscale first, then trace
//   node scripts/trace-logo.mjs --icon 1024         square transparent PNG for `tauri icon`
//
// --small is how the icon-size variant is made: shrinking the bitmap before
// tracing merges hairlines and fur tufts the way a 32px render would, so the
// simplification comes out of the artwork itself rather than from redrawing it.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, existsSync, writeFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const argv = process.argv.slice(2);
const smallAt = argv.includes('--small') ? Number(argv[argv.indexOf('--small') + 1]) : 0;
const iconAt = argv.includes('--icon') ? Number(argv[argv.indexOf('--icon') + 1]) : 0;
const positional = argv.filter((a, i) =>
  !a.startsWith('--') && argv[i - 1] !== '--small' && argv[i - 1] !== '--icon');
const src = positional[0] ?? 'brand/source/paperotter-head.png';
const out = positional[1] ?? (iconAt ? 'brand/icon-source.png'
  : smallAt ? 'brand/paperotter-mark-simple.svg' : 'brand/paperotter-mark.svg');

if (!existsSync(src)) {
  console.error(`\n  No source art at ${src}\n`);
  console.error('  Save the logo PNG there first (the folder is gitignored), then re-run.\n');
  process.exit(1);
}

const work = mkdtempSync(join(tmpdir(), 'trace-'));
console.log(`  installing potrace into ${work} …`);
execFileSync('npm', ['install', '--no-save', '--silent', '--prefix', work, 'potrace'],
  { stdio: ['ignore', 'ignore', 'inherit'] });

const potrace = (await import(join(work, 'node_modules/potrace/lib/index.js'))).default;
const Jimp = (await import(join(work, 'node_modules/jimp/dist/index.js'))).default;

if (iconAt) {
  // `tauri icon` wants one square source with a transparent ground. The artwork
  // is drawn on white in the middle of a much larger canvas, so: find the ink,
  // crop to it, square it, drop the white, and scale.
  const img = await Jimp.read(src);
  const { width: W, height: H } = img.bitmap;
  // Count ink per row and per column, then take the bounds of rows/columns that
  // carry a real amount of it. A plain min/max would be anchored by the stray
  // 5 px dot the source art has near the origin.
  const cols = new Uint32Array(W), rows = new Uint32Array(H);
  img.scan(0, 0, W, H, (x, y, i) => {
    if (img.bitmap.data[i] < 128) { cols[x]++; rows[y]++; }
  });
  const MIN_INK = Math.max(8, Math.round(Math.min(W, H) * 0.006));
  const span = (arr) => {
    let a = 0, b = arr.length - 1;
    while (a < arr.length && arr[a] < MIN_INK) a++;
    while (b > a && arr[b] < MIN_INK) b--;
    return [a, b];
  };
  const [x0, x1] = span(cols), [y0, y1] = span(rows);
  const side = Math.max(x1 - x0, y1 - y0);
  const pad = Math.round(side * 0.08);
  const box = side + pad * 2;
  const canvas = new Jimp(box, box, 0x00000000);
  const cx = Math.round(x0 - (box - (x1 - x0)) / 2);
  const cy = Math.round(y0 - (box - (y1 - y0)) / 2);
  const cropped = img.clone().crop(
    Math.max(0, cx), Math.max(0, cy),
    Math.min(box, W - Math.max(0, cx)), Math.min(box, H - Math.max(0, cy)));
  cropped.scan(0, 0, cropped.bitmap.width, cropped.bitmap.height, (x, y, i) => {
    const d = cropped.bitmap.data;
    d[i + 3] = 255 - d[i];                          // white -> clear, black -> opaque
    d[i] = d[i + 1] = d[i + 2] = 0;
  });
  canvas.composite(cropped, 0, 0);
  canvas.resize(iconAt, iconAt);
  await canvas.writeAsync(out);
  console.log(`\n  ${out} — ${iconAt}x${iconAt}, ink at ${x0},${y0}..${x1},${y1}\n`);
  process.exit(0);
}

let input = src;
if (smallAt) {
  const img = await Jimp.read(src);
  img.resize(smallAt, Jimp.AUTO).greyscale().contrast(0.25);
  input = join(work, 'small.png');
  await img.writeAsync(input);
  console.log(`  downscaled ${img.bitmap.width}x${img.bitmap.height} before tracing`);
}

const svg = await new Promise((resolve, reject) =>
  potrace.trace(input, {
    threshold: 128,                       // black-on-white art: split at mid grey
    turdSize: smallAt ? 2 : 120,          // despeckle; the source has a stray dot near the origin
    alphaMax: smallAt ? 1.3 : 1,          // higher = rounder corners
    optCurve: true,
    optTolerance: smallAt ? 0.6 : 0.2,    // higher = fewer, smoother segments
    turnPolicy: 'minority',
    background: 'transparent',
  }, (err, res) => (err ? reject(err) : resolve(res))));

// Crop the viewBox to the ink, then square it so it drops into an icon slot
// without distortion. Bezier control points can sit slightly outside the true
// outline, which only ever adds padding — it never clips.
const nums = (svg.match(/ d="([^"]+)"/g) ?? []).join(' ').match(/-?\d+(?:\.\d+)?/g) ?? [];
let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
for (let i = 0; i + 1 < nums.length; i += 2) {
  const x = +nums[i], y = +nums[i + 1];
  if (x < x0) x0 = x; if (x > x1) x1 = x;
  if (y < y0) y0 = y; if (y > y1) y1 = y;
}
const pad = Math.max(x1 - x0, y1 - y0) * 0.04;
const side = Math.max(x1 - x0, y1 - y0) + pad * 2;
const sx = Math.round(x0 - pad - (side - (x1 - x0) - pad * 2) / 2);
const sy = Math.round(y0 - pad - (side - (y1 - y0) - pad * 2) / 2);

const cleaned = svg
  // strip potrace's own presentation attrs, or the path ends up with duplicate
  // fill/fill-rule — valid to a browser, rejected by stricter parsers
  .replace(/ fill-rule="[^"]*"/g, '')
  .replace(/ fill="[^"]*"/g, '')
  .replace(/ stroke="[^"]*"/g, '')
  .replace(/ (?:viewBox|width|height|version)="[^"]*"/g, '')
  .replace(/<svg([^>]*)>/,
    `<svg$1 viewBox="${sx} ${sy} ${Math.round(side)} ${Math.round(side)}" role="img" aria-label="PaperOtter">\n  <title>PaperOtter</title>`)
  .replace(/<path /, '<path fill="currentColor" fill-rule="evenodd" ');

writeFileSync(out, cleaned);
const curves = (cleaned.match(/[CL]/g) ?? []).length;
console.log(`\n  ${out} — ${statSync(out).size} bytes, ${curves} segments, ${Math.round(side)}px square\n`);
