/**
 * The generated fixtures really are what they declare.
 *
 * Every tool test will read its expectation out of a spec in known.ts — "this
 * document has twelve A4 pages, and page seven says PAGE 007". If the generator
 * and the declaration ever disagree, the tests do not fail: they assert the
 * wrong thing and pass, which is the failure this whole exercise exists to
 * remove. So the two are checked against each other here, by the same verifier
 * the tool tests will use.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { KNOWN_PDFS, buildKnownPdf, buildKnownFixtures, expectedPageBox, pageMarker, knownPdf } from '../../fixtures/known';
import { pdfFacts, pdfText } from '../verify';

let dir: string;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'papercut-known-'));
  await buildKnownFixtures(dir);
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe.each(KNOWN_PDFS.map((s) => [s.name, s] as const))('%s', (name, spec) => {
  it('has the page count it declares', async () => {
    expect((await pdfFacts(join(dir, name))).pageCount).toBe(spec.pageCount);
  });

  it('has the page size it declares, on every page', async () => {
    const facts = await pdfFacts(join(dir, name));
    const box = expectedPageBox(spec);
    // Every page, not just the first: a generator that sized page one correctly
    // and the rest by accident would satisfy a spot check.
    for (const size of facts.pageSizes) {
      expect(size.width).toBeCloseTo(box.width, -1);
      expect(size.height).toBeCloseTo(box.height, -1);
    }
  });

  it('carries the rotation it declares', async () => {
    const facts = await pdfFacts(join(dir, name));
    for (const angle of facts.rotations) expect(angle).toBe(spec.rotation ?? 0);
  });

  it('is not encrypted', async () => {
    expect((await pdfFacts(join(dir, name))).encrypted).toBe(false);
  });

  it('marks every page with its own number, and only its own', async () => {
    for (let i = 0; i < spec.pageCount; i++) {
      const text = await pdfText(join(dir, name), i);
      expect(text).toContain(pageMarker(i));
      // The point of the padding: PAGE 001 must not be findable on page 11.
      for (let other = 0; other < spec.pageCount; other++) {
        if (other !== i) expect(text).not.toContain(pageMarker(other));
      }
    }
  });
});

describe('the fixtures as a set', () => {
  it('builds byte-identical output every time', async () => {
    // Two runs must agree, or "the output differs from the input" means nothing
    // and no run can be compared with the one before it.
    const [first, second] = await Promise.all([
      buildKnownPdf(KNOWN_PDFS[0]),
      buildKnownPdf(KNOWN_PDFS[0]),
    ]);
    expect(Buffer.from(first).equals(Buffer.from(second))).toBe(true);
  });

  it('covers more than one page size and one orientation', async () => {
    // A suite whose fixtures are all A4 portrait cannot tell "kept the page
    // size" from "assumed A4".
    expect(new Set(KNOWN_PDFS.map((s) => s.size)).size).toBeGreaterThan(1);
    expect(KNOWN_PDFS.some((s) => s.landscape)).toBe(true);
    expect(KNOWN_PDFS.some((s) => s.rotation)).toBe(true);
    expect(KNOWN_PDFS.some((s) => s.pageCount === 1)).toBe(true);
  });

  it('names every fixture uniquely, and knownPdf finds each one', () => {
    expect(new Set(KNOWN_PDFS.map((s) => s.name)).size).toBe(KNOWN_PDFS.length);
    for (const spec of KNOWN_PDFS) expect(knownPdf(spec.name)).toBe(spec);
    expect(() => knownPdf('nope.pdf')).toThrow(/No known fixture/);
  });

  it('detects a fixture that does not match its declaration', async () => {
    // The guard on the guard: if the generator drifted from the spec, the tests
    // above have to notice. Build a document with the wrong page count and
    // confirm the same check that passes above fails here.
    const spec = { ...KNOWN_PDFS[0], pageCount: KNOWN_PDFS[0].pageCount + 1 };
    const wrong = join(dir, 'drifted.pdf');
    writeFileSync(wrong, await buildKnownPdf(spec));
    expect((await pdfFacts(wrong)).pageCount).not.toBe(KNOWN_PDFS[0].pageCount);
  });
});
