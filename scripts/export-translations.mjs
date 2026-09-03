#!/usr/bin/env node
// Export every user-facing string to one CSV, for review outside the codebase.
//
// The brief's rule is to ship only languages someone can check, and eight of the
// nine are `unreviewed`. Reviewing them inside nine TypeScript files is the
// reason it has not happened: nothing lines the languages up against each other,
// against the English they came from, or against what is simply missing.
//
// One row per key, one column per language, so a reviewer (or a model) sees the
// whole set at once and gaps are visible as empty cells rather than as absences.
//
//   node scripts/export-translations.mjs [outfile]
//   node scripts/export-translations.mjs --split <dir>
//
// Default output: translations.csv in the repo root, which is gitignored:
// the reviewed copy lives outside this repository.
//
// --split writes one file per language instead, each carrying the key, the
// English source and that language alone. One reviewer — or one model — reads
// better with two columns to compare than with nine to scan across, and each
// file can go to whichever model is strongest in that language.
import { build } from 'esbuild';
import { writeFileSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const LOCALES = ['en', 'de', 'tr', 'fr', 'es', 'it', 'nl', 'pl', 'pt'];

/** Strings that tell the user something is destroyed, lost or has failed. */
// Kept identical to SAFETY in src/i18n/__tests__/translations.test.ts — these are
// the sentences the brief says are worse wrong than left in English, so a
// reviewer needs to know which rows they are before reading a word.
const SAFETY = /permanent|cannot be undone|destroy|remove|delete|overwrit|lost|irrevers|password|redact|corrupt|fail|not a valid|too large|empty/i;

/** Load the .ts dictionaries by bundling them to ESM first — Node cannot import TS. */
async function loadDictionaries() {
  const dir = mkdtempSync(join(tmpdir(), 'papercut-i18n-'));
  try {
    const entry = join(dir, 'entry.mjs');
    writeFileSync(
      entry,
      LOCALES.map((l) => `export { ${l} } from ${JSON.stringify(join(ROOT, 'src/i18n', l + '.ts'))};`).join('\n'),
    );
    const out = join(dir, 'bundle.mjs');
    await build({
      entryPoints: [entry],
      bundle: true,
      format: 'esm',
      platform: 'node',
      outfile: out,
      logLevel: 'silent',
      alias: { '@': join(ROOT, 'src') },
    });
    return await import('file://' + out);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const csvCell = (value) => {
  const s = String(value ?? '');
  // Quote everything: the copy contains commas, quotes, newlines and em dashes,
  // and a spreadsheet that splits one sentence across two columns is worse than
  // no export at all.
  return '"' + s.replace(/"/g, '""') + '"';
};

const placeholdersOf = (s) => [...new Set((s.match(/\{(\w+)\}/g) ?? []))].sort().join(' ');

/**
 * One CSV per language: key, context, English, and that language.
 *
 * `missing` is a plain yes/no here rather than the master file's list of
 * language codes, because in a single-language file the list could only ever
 * name that one language.
 */
function writePerLanguage(dicts, keys, dir) {
  mkdirSync(dir, { recursive: true });
  const written = [];

  for (const locale of LOCALES.filter((l) => l !== 'en')) {
    const header = ['key', 'placeholders', 'safety_critical', 'missing', 'en', locale];
    const rows = keys.map((key) => {
      const source = dicts.en[key];
      return [
        key,
        placeholdersOf(source),
        SAFETY.test(source) ? 'yes' : '',
        key in dicts[locale] ? '' : 'yes',
        source,
        dicts[locale][key] ?? '',
      ].map(csvCell).join(',');
    });

    const outfile = join(dir, `papercut-translations-${locale}.csv`);
    writeFileSync(outfile, '\ufeff' + [header.map(csvCell).join(','), ...rows].join('\n') + '\n', 'utf8');
    const missing = keys.filter((k) => !(k in dicts[locale])).length;
    written.push([locale, outfile, missing]);
  }

  return written;
}

async function main() {
  const dicts = await loadDictionaries();
  const en = dicts.en;
  const keys = Object.keys(en).sort();

  const header = [
    'key',
    'placeholders',
    'safety_critical',
    'missing_in',
    ...LOCALES,
  ];

  const rows = keys.map((key) => {
    const source = en[key];
    const missing = LOCALES.filter((l) => l !== 'en' && !(key in dicts[l]));
    return [
      key,
      placeholdersOf(source),
      SAFETY.test(source) ? 'yes' : '',
      missing.join(' '),
      ...LOCALES.map((l) => dicts[l][key] ?? ''),
    ].map(csvCell).join(',');
  });

  if (process.argv[2] === '--split') {
    const dir = process.argv[3];
    if (!dir) {
      console.error('--split needs a directory: node scripts/export-translations.mjs --split <dir>');
      process.exit(2);
    }
    const written = writePerLanguage(dicts, keys, dir);
    console.log(`${keys.length} keys, one file per language, in ${dir}`);
    for (const [locale, file, missing] of written) {
      console.log(`  ${locale}  ${file.split('/').pop()}` + (missing ? `  (${missing} untranslated)` : ''));
    }
    console.log(`${keys.filter((k) => SAFETY.test(en[k])).length} safety-critical strings are marked in every file`);
    return;
  }

  const outfile = process.argv[2] ?? join(ROOT, 'translations.csv');
  // A BOM, so Excel opens UTF-8 correctly. Without it every ö, ı and — is mojibake
  // and a reviewer spends the session fixing the export instead of the copy.
  writeFileSync(outfile, '﻿' + [header.map(csvCell).join(','), ...rows].join('\n') + '\n', 'utf8');

  const gaps = LOCALES.filter((l) => l !== 'en')
    .map((l) => [l, keys.filter((k) => !(k in dicts[l])).length])
    .filter(([, n]) => n > 0);

  console.log(`${outfile}`);
  console.log(`${keys.length} keys x ${LOCALES.length} languages`);
  console.log(`${keys.filter((k) => SAFETY.test(en[k])).length} safety-critical strings`);
  if (gaps.length) {
    console.log('untranslated keys: ' + gaps.map(([l, n]) => `${l}=${n}`).join(' '));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
