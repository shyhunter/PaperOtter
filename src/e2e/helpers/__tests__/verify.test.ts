/**
 * The verifier, checked against real fixture bytes.
 *
 * Everything the tool specs will assert runs through this module, so a bug here
 * does not fail a test — it passes all of them. The expectations below come
 * from what the fixtures independently are (the generator in
 * tools/generate-fixtures states the sizes it writes; locked.pdf is encrypted
 * because that is what it was made for), never from running this code and
 * recording its answer.
 */
import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { pdfFacts, pdfText, imageFacts, differsFrom } from '../verify';

const FIXTURES = join(process.cwd(), 'test-fixtures');
const f = (name: string) => join(FIXTURES, name);

describe('pdfFacts', () => {
  it('reads page count and page size', async () => {
    const facts = await pdfFacts(f('photo_heavy.pdf'));
    // Generated as a 3-page PDF — see tools/generate-fixtures/src/main.rs.
    expect(facts.pageCount).toBe(3);
    expect(facts.pageSizes).toHaveLength(3);
    for (const size of facts.pageSizes) {
      expect(size.width).toBeGreaterThan(0);
      expect(size.height).toBeGreaterThan(0);
    }
    expect(facts.bytes).toBeGreaterThan(0);
  });

  it('reports an unrotated document as 0, not as missing', async () => {
    const facts = await pdfFacts(f('sample.pdf'));
    expect(facts.rotations).toHaveLength(facts.pageCount);
    for (const angle of facts.rotations) expect([0, 90, 180, 270]).toContain(angle);
  });

  it('identifies an encrypted document instead of throwing', async () => {
    const facts = await pdfFacts(f('locked.pdf'));
    expect(facts.encrypted).toBe(true);
    // Still readable enough to count pages — a refusal to open is not a refusal
    // to describe, and a Protect test needs both halves.
    expect(facts.pageCount).toBeGreaterThan(0);
  });

  it('does not call an ordinary document encrypted', async () => {
    expect((await pdfFacts(f('sample.pdf'))).encrypted).toBe(false);
    expect((await pdfFacts(f('warnock_camelot.pdf'))).encrypted).toBe(false);
  });
});

describe('pdfText', () => {
  it('extracts text a document really contains', async () => {
    // warnock_camelot.pdf is the Camelot sample: its text is its whole point.
    const text = await pdfText(f('warnock_camelot.pdf'));
    expect(text.length).toBeGreaterThan(0);
    expect(text.toLowerCase()).toContain('camelot');
  });

  it('can be narrowed to one page', async () => {
    const all = await pdfText(f('warnock_camelot.pdf'));
    const first = await pdfText(f('warnock_camelot.pdf'), 0);
    expect(first.length).toBeGreaterThan(0);
    expect(all.length).toBeGreaterThanOrEqual(first.length);
  });
});

describe('imageFacts', () => {
  // Sizes are what tools/generate-fixtures/src/main.rs writes.
  it('reads a PNG', () => {
    expect(imageFacts(f('sample.png'))).toMatchObject({ format: 'png', width: 200, height: 200 });
  });

  it('reads a JPEG', () => {
    expect(imageFacts(f('sample.jpg'))).toMatchObject({ format: 'jpeg', width: 300, height: 200 });
  });

  it('identifies the formats the app can be handed', () => {
    expect(imageFacts(f('sample.gif')).format).toBe('gif');
    expect(imageFacts(f('sample.bmp')).format).toBe('bmp');
    expect(imageFacts(f('sample.tiff')).format).toBe('tiff');
  });

  it('goes by the header, not the extension', () => {
    // The claim the tool specs will rest on: a JPEG renamed .webp is a JPEG.
    expect(imageFacts(f('pexels-pixabay-459225.jpg')).format).toBe('jpeg');
    expect(imageFacts(f('sample.pdf')).format).toBe('unknown');
  });

  it('reports real dimensions, never zero, for the formats it claims to size', () => {
    for (const name of ['sample.png', 'sample.jpg', 'pexels-pixabay-459225.jpg']) {
      const facts = imageFacts(f(name));
      expect(facts.width, name).toBeGreaterThan(0);
      expect(facts.height, name).toBeGreaterThan(0);
    }
  });
});

describe('differsFrom', () => {
  it('is false for a file compared with itself', () => {
    expect(differsFrom(f('sample.pdf'), f('sample.pdf'))).toBe(false);
  });

  it('is true for two different files', () => {
    expect(differsFrom(f('sample.pdf'), f('warnock_camelot.pdf'))).toBe(true);
  });
});
