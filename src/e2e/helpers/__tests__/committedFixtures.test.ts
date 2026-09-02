/**
 * The committed fixtures have not changed underneath the tests.
 *
 * Assertions all over this repo are pinned to what these files are: sample.png
 * is 200×200, photo_heavy.pdf has three pages and compresses, locked.pdf is
 * encrypted, warnock_camelot.pdf contains the word Camelot. None of that is
 * enforced anywhere — replace a fixture with a different document and the tests
 * that depended on it either fail somewhere far away, for a reason nobody
 * connects back, or keep passing while meaning something else entirely.
 *
 * The manifest makes a fixture change a deliberate act: the checksum moves, this
 * fails, and whoever changed it re-reads the tests that rest on it before
 * updating the record.
 *
 * To update after an intended change:
 *   node -e "…" — regenerate src/e2e/fixtures/committed-manifest.json
 * and say in the commit message which tests were re-checked.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import manifest from '../../fixtures/committed-manifest.json';

const DIR = join(process.cwd(), 'test-fixtures');

const onDisk = readdirSync(DIR)
  .filter((name) => statSync(join(DIR, name)).isFile())
  .sort();

const recorded = Object.keys(manifest as Record<string, unknown>).sort();

describe('committed fixtures', () => {
  it('are exactly the files the manifest records', () => {
    // Both directions. A fixture added without a record is unprotected; one
    // recorded but missing means a test is about to fail for a confusing
    // reason, and this says why first.
    expect(onDisk).toEqual(recorded);
  });

  it.each(recorded)('%s is byte-for-byte what it was', (name) => {
    const entry = (manifest as Record<string, { sha256: string; bytes: number }>)[name];
    const buf = readFileSync(join(DIR, name));
    expect(buf.length, `${name} changed size`).toBe(entry.bytes);
    expect(createHash('sha256').update(buf).digest('hex'), `${name} changed content`).toBe(entry.sha256);
  });

  it('records a checksum that would actually catch a change', () => {
    // The guard on the guard: a manifest of empty strings would pass every test
    // above if the hashing were broken.
    const [first] = recorded;
    const entry = (manifest as Record<string, { sha256: string }>)[first];
    expect(entry.sha256).toMatch(/^[0-9a-f]{64}$/);
    const mutated = Buffer.concat([readFileSync(join(DIR, first)), Buffer.from([0])]);
    expect(createHash('sha256').update(mutated).digest('hex')).not.toBe(entry.sha256);
  });
});
