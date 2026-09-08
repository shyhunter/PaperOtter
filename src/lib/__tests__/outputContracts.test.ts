/**
 * [OUT] What each tool actually produced, read back from the document it wrote.
 *
 * Every layer built so far tests the *interface*: a control is on screen, a step
 * advanced, a flow can be walked. A tool that writes a wrong document passes all
 * of them. Thirteen of the forty-three defects found by hand were geometry —
 * pages turned the wrong way, crops taken off the wrong edge, stamps landing
 * outside the visible area — and nothing in the repo could see any of it.
 *
 * The transforms are pure: bytes in, bytes out, no Tauri, no canvas. So they run
 * here in Node, on every pull request, in milliseconds — and the output is
 * opened with pdf-lib and interrogated independently of the code that made it.
 *
 * **Rotated twins are the whole point.** Almost every geometry defect in the
 * list had the same shape: the tool worked on an upright page and applied the
 * user's intent to the unturned coordinate space underneath a turned one. So
 * nothing here is checked at one rotation. Each contract is stated once and run
 * against 0, 90, 180 and 270 degrees, because a tool that only works upright
 * looks completely correct until someone opens a scanned document.
 *
 * Not covered here, and deliberately named rather than left as a silent gap:
 * compress, protect and unlock go through the Ghostscript sidecar; redact,
 * pdf-to-jpg and the image tools need pdf.js or a canvas and belong in the
 * browser layer; convert-doc and OCR need external engines. This file covers the
 * seven tools that are pure geometry, which is where the geometry defects were.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { PDFDocument, PDFArray, PDFStream, degrees } from 'pdf-lib';

import { rotatePdf } from '@/lib/pdfRotate';
import { cropPdf, type CropMargins } from '@/lib/pdfCrop';
import { addPageNumbers } from '@/lib/pdfPageNumbers';
import { addWatermark, DEFAULT_WATERMARK_OPTIONS } from '@/lib/pdfWatermark';
import { addSignature } from '@/lib/pdfSign';
import { organizePdf } from '@/lib/pdfOrganize';
import { splitPdf } from '@/lib/pdfSplit';

const FIXTURES = join(process.cwd(), 'test-fixtures');
const read = (name: string) => new Uint8Array(readFileSync(join(FIXTURES, name)));

/** The four orientations every contract below is checked at. */
const ROTATIONS = [0, 90, 180, 270] as const;
type Rotation = (typeof ROTATIONS)[number];

interface PageFacts {
  width: number;
  height: number;
  rotation: number;
  /** A hash of the page's content stream — page identity, for order and slicing. */
  content: string;
  media: { width: number; height: number };
  crop: { width: number; height: number };
}

/**
 * Read the document back with no help from the code that wrote it.
 *
 * A verifier that asked the transform what it had done would agree with it by
 * construction, so everything here comes out of the saved bytes.
 */
async function facts(bytes: Uint8Array): Promise<PageFacts[]> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  return doc.getPages().map((page) => {
    const contents = page.node.Contents();
    const hash = createHash('sha1');
    if (contents instanceof PDFArray) {
      for (let i = 0; i < contents.size(); i++) {
        const stream = contents.lookup(i);
        if (stream instanceof PDFStream) hash.update(stream.getContents());
      }
    } else if (contents instanceof PDFStream) {
      hash.update(contents.getContents());
    }
    const { width, height } = page.getSize();
    const m = page.getMediaBox();
    const c = page.getCropBox();
    return {
      width,
      height,
      rotation: page.getRotation().angle,
      content: hash.digest('hex'),
      media: { width: m.width, height: m.height },
      crop: { width: c.width, height: c.height },
    };
  });
}

/** The same fixture, turned — the twin every contract is also checked against. */
async function turned(bytes: Uint8Array, angle: Rotation): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes);
  for (const page of doc.getPages()) page.setRotation(degrees(angle));
  return new Uint8Array(await doc.save({ useObjectStreams: true }));
}

const SAMPLE = read('sample.pdf');
const SIGNATURE_PNG = read('sample.png');

/**
 * Tools that draw on a page without changing its shape.
 *
 * Grouped because they owe the reader the same three promises, and stating those
 * once over a list is what keeps a fourth stamping tool from being added with
 * nobody checking it.
 */
const STAMPERS: { id: string; apply: (bytes: Uint8Array) => Promise<Uint8Array> }[] = [
  {
    id: 'page-numbers',
    apply: (bytes) =>
      addPageNumbers(bytes, {
        position: 'bottom-center',
        format: 'numeric',
        fontSize: 12,
        startNumber: 1,
        margin: 30,
      }),
  },
  {
    id: 'watermark',
    apply: (bytes) => addWatermark(bytes, { ...DEFAULT_WATERMARK_OPTIONS }),
  },
  {
    id: 'sign-pdf',
    apply: (bytes) =>
      addSignature(bytes, {
        imageBytes: SIGNATURE_PNG,
        xRatio: 0.6,
        yRatio: 0.1,
        width: 120,
        height: 60,
        pageIndices: [0, 1, 2],
      }),
  },
];

describe('[OUT-01] a stamping tool leaves the document the shape it found it', () => {
  for (const tool of STAMPERS) {
    for (const rotation of ROTATIONS) {
      it(`${tool.id} preserves page count, size and rotation at ${rotation}deg`, async () => {
        const input = await turned(SAMPLE, rotation);
        const before = await facts(input);
        const after = await facts(await tool.apply(input));

        expect(after, 'the page count is unchanged').toHaveLength(before.length);

        for (const [i, page] of after.entries()) {
          // The silent un-rotate: a tool that drops /Rotate turns a scanned
          // page back on its side, and every UI assertion still passes because
          // nothing on screen changed.
          expect(page.rotation, `page ${i} keeps the rotation it had`).toBe(rotation);
          expect(page.media.width, `page ${i} keeps its media width`).toBeCloseTo(before[i].media.width, 1);
          expect(page.media.height, `page ${i} keeps its media height`).toBeCloseTo(before[i].media.height, 1);
        }
      });

      it(`${tool.id} actually marks every page at ${rotation}deg`, async () => {
        const input = await turned(SAMPLE, rotation);
        const before = await facts(input);
        const after = await facts(await tool.apply(input));

        // Without this, a tool that quietly did nothing would satisfy every
        // assertion above: the shape of an untouched document is perfect.
        for (const [i, page] of after.entries()) {
          expect(page.content, `page ${i} was drawn on`).not.toBe(before[i].content);
        }
      });
    }
  }
});

describe('[OUT-02] crop takes the margins off the edges the reader can see', () => {
  // Deliberately lopsided. Equal margins pass whether the mapping is right,
  // reversed, or transposed, which is exactly the bug being looked for.
  const MARGINS: CropMargins = { top: 40, bottom: 10, left: 25, right: 5 };

  for (const rotation of ROTATIONS) {
    it(`crops the visual top by ${MARGINS.top}pt at ${rotation}deg`, async () => {
      const input = await turned(SAMPLE, rotation);
      const before = await facts(input);
      const after = await facts(await cropPdf(input, MARGINS));

      // Stated from the reader's side, not copied from the implementation: on a
      // quarter-turned page the edge the reader calls "top" is one of the sides
      // of the unturned box, so the horizontal margins govern the page's height
      // and the vertical ones its width.
      const upright = rotation === 0 || rotation === 180;
      const expectedWidth = before[0].media.width - (upright ? MARGINS.left + MARGINS.right : MARGINS.top + MARGINS.bottom);
      const expectedHeight = before[0].media.height - (upright ? MARGINS.top + MARGINS.bottom : MARGINS.left + MARGINS.right);

      for (const [i, page] of after.entries()) {
        expect(page.crop.width, `page ${i} crop width at ${rotation}deg`).toBeCloseTo(expectedWidth, 1);
        expect(page.crop.height, `page ${i} crop height at ${rotation}deg`).toBeCloseTo(expectedHeight, 1);

        // A crop hides content, it does not remove it.
        expect(page.media.width, `page ${i} media box untouched`).toBeCloseTo(before[i].media.width, 1);
        expect(page.crop.width, `page ${i} crop is inside the media box`).toBeLessThan(page.media.width + 0.01);
      }
    });
  }
});

describe('[OUT-03] rotate turns the page it was asked to and no other', () => {
  for (const rotation of ROTATIONS) {
    it(`adds a quarter turn to page 1 only, from ${rotation}deg`, async () => {
      const input = await turned(SAMPLE, rotation);
      const before = await facts(input);
      const { bytes } = await rotatePdf(input, [{ pageIndex: 0, rotation: 90 }]);
      const after = await facts(bytes);

      expect(after[0].rotation, 'the chosen page turned').toBe((rotation + 90) % 360);
      expect(after[1].rotation, 'page 2 was left alone').toBe(rotation);
      expect(after[2].rotation, 'page 3 was left alone').toBe(rotation);

      // Rotation is metadata. A tool that re-drew the page to achieve it would
      // rewrite the content stream and lose the text layer with it.
      for (const [i, page] of after.entries()) {
        expect(page.content, `page ${i} content is untouched`).toBe(before[i].content);
        expect(page.media.width, `page ${i} media box is untouched`).toBeCloseTo(before[i].media.width, 1);
      }
    });
  }
});

describe('[OUT-04] organize puts the pages in the order it was given', () => {
  for (const rotation of ROTATIONS) {
    it(`reorders to 3,1,2 and keeps each page whole at ${rotation}deg`, async () => {
      const input = await turned(SAMPLE, rotation);
      const before = await facts(input);
      const after = await facts(await organizePdf(input, [2, 0, 1]));

      // Identity by content, not by position: "there are still three pages" is
      // true of every wrong answer as well as the right one.
      expect(after.map((p) => p.content), 'pages appear in the requested order').toEqual([
        before[2].content,
        before[0].content,
        before[1].content,
      ]);
      for (const [i, page] of after.entries()) {
        expect(page.rotation, `moved page ${i} keeps its rotation`).toBe(rotation);
      }
    });
  }
});

describe('[OUT-05] split takes the pages asked for and nothing else', () => {
  for (const rotation of ROTATIONS) {
    it(`cuts 1-2 and 3-3 into two documents at ${rotation}deg`, async () => {
      const input = await turned(SAMPLE, rotation);
      const before = await facts(input);
      const { outputs } = await splitPdf(input, 'sample.pdf', {
        type: 'ranges',
        ranges: [
          { start: 1, end: 2 },
          { start: 3, end: 3 },
        ],
      });

      expect(outputs, 'one document per range').toHaveLength(2);

      const first = await facts(outputs[0].bytes);
      const second = await facts(outputs[1].bytes);

      expect(first.map((p) => p.content), 'the first document is pages 1 and 2').toEqual([
        before[0].content,
        before[1].content,
      ]);
      expect(second.map((p) => p.content), 'the second document is page 3').toEqual([before[2].content]);

      for (const page of [...first, ...second]) {
        expect(page.rotation, 'a split page keeps its rotation').toBe(rotation);
      }
    });
  }
});
