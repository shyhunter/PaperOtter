import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getPdfCompressibilityFromBytes } from '@/lib/pdfProcessor';

let fixture: Uint8Array;

beforeAll(() => {
  // Real binary fixture per P007.
  fixture = new Uint8Array(readFileSync(resolve(process.cwd(), 'test-fixtures/sample.pdf')));
});

describe('getPdfCompressibilityFromBytes', () => {
  it('PC-01: reports the document shape from bytes already in memory', async () => {
    // The editor holds edited bytes that may differ from anything on disk, so
    // the path-based entry point cannot serve it.
    const result = await getPdfCompressibilityFromBytes(fixture);

    expect(result.pageCount).toBeGreaterThan(0);
    expect(result.fileSizeBytes).toBe(fixture.byteLength);
    expect(result.compressibilityScore).toBeGreaterThanOrEqual(0);
    expect(result.compressibilityScore).toBeLessThanOrEqual(1);
    expect(result.jpxByteShare).toBeGreaterThanOrEqual(0);
  });

  it('PC-02: sample.pdf is text-only, so it reports as barely compressible', async () => {
    const { compressibilityScore, imageCount } = await getPdfCompressibilityFromBytes(fixture);

    expect(imageCount).toBe(0);
    expect(compressibilityScore).toBeLessThan(0.1);
  });
});
