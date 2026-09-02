/**
 * What the app actually produced — read from the file, not from the screen.
 *
 * Most of this suite's assertions have been about the UI: a step appeared, a
 * sentence is present. That tests the screen, and a tool that writes the wrong
 * document passes every one of them. These read the artefact instead and report
 * what is really in it, so a spec can say what it means: rotate turned page one
 * ninety degrees and left the rest alone, split took pages three to five and
 * nothing else, protect produced a file that cannot be opened without the
 * password.
 *
 * All of it runs in the WDIO worker, in Node — the app is not involved and
 * cannot influence the answer. That independence is the point: a verifier that
 * asked the app what it had done would agree with the app by construction.
 *
 * This module is itself unit-tested against the committed fixtures. It has to
 * be: a verifier that quietly returns nothing turns every test built on it
 * green, which is a worse failure than the ones it exists to catch.
 */
import { readFileSync, statSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';

export interface PageBox {
  /** PDF points, rounded — a 0.001pt difference is not a difference anyone means. */
  width: number;
  height: number;
}

export interface PdfFacts {
  pageCount: number;
  pageSizes: PageBox[];
  /** Per page, normalised to 0/90/180/270. */
  rotations: number[];
  encrypted: boolean;
  bytes: number;
}

/** Read a PDF's structure. Encrypted files report `encrypted` rather than throwing. */
export async function pdfFacts(path: string): Promise<PdfFacts> {
  const data = readFileSync(path);
  const bytes = data.length;

  let encrypted = false;
  try {
    await PDFDocument.load(data);
  } catch (err) {
    // pdf-lib refuses an encrypted document unless told to ignore it. That
    // refusal is the signal, not a failure.
    if (/encrypt/i.test(String(err))) encrypted = true;
    else throw err;
  }

  const doc = await PDFDocument.load(data, { ignoreEncryption: true });
  const pages = doc.getPages();

  return {
    pageCount: pages.length,
    pageSizes: pages.map((p) => ({
      width: Math.round(p.getWidth()),
      height: Math.round(p.getHeight()),
    })),
    rotations: pages.map((p) => ((p.getRotation().angle % 360) + 360) % 360),
    encrypted,
    bytes,
  };
}

/**
 * Text from a PDF, via pdf.js's Node build.
 *
 * Omit `pageIndex` for the whole document. Runs of whitespace are collapsed:
 * PDF text extraction splits on layout, not on words, and asserting against
 * incidental spacing makes a test fail on a change nobody made.
 */
export async function pdfText(path: string, pageIndex?: number): Promise<string> {
  // The legacy build is the one that runs outside a browser.
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const data = new Uint8Array(readFileSync(path));
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;

  const indices = pageIndex === undefined
    ? Array.from({ length: doc.numPages }, (_, i) => i)
    : [pageIndex];

  const parts: string[] = [];
  for (const i of indices) {
    const page = await doc.getPage(i + 1);
    const content = await page.getTextContent();
    parts.push(
      content.items
        .map((item) => ('str' in item ? item.str : ''))
        .join(' '),
    );
  }
  await doc.destroy();
  return parts.join('\n').replace(/\s+/g, ' ').trim();
}

export type ImageFormat = 'jpeg' | 'png' | 'webp' | 'gif' | 'bmp' | 'tiff' | 'unknown';

export interface ImageFacts {
  format: ImageFormat;
  /** 0 when the format carries no size we parse (TIFF). */
  width: number;
  height: number;
  bytes: number;
}

/**
 * Format and dimensions, from the file's own header.
 *
 * By header rather than by extension, deliberately: "the output is a WebP" is
 * exactly the claim a wrong extension would let through, and renaming a JPEG
 * to .webp is the bug this is here to catch.
 */
export function imageFacts(path: string): ImageFacts {
  const b = readFileSync(path);
  const bytes = statSync(path).size;
  const facts = (format: ImageFormat, width = 0, height = 0): ImageFacts =>
    ({ format, width, height, bytes });

  if (b.length >= 24 && b.readUInt32BE(0) === 0x89504e47) {
    // PNG: IHDR is the first chunk, width and height at a fixed offset.
    return facts('png', b.readUInt32BE(16), b.readUInt32BE(20));
  }

  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    return facts('jpeg', ...jpegSize(b));
  }

  if (b.length >= 16 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
    return facts('webp', ...webpSize(b));
  }

  if (b.length >= 10 && b.toString('ascii', 0, 3) === 'GIF') {
    return facts('gif', b.readUInt16LE(6), b.readUInt16LE(8));
  }

  if (b.length >= 26 && b[0] === 0x42 && b[1] === 0x4d) {
    return facts('bmp', b.readInt32LE(18), Math.abs(b.readInt32LE(22)));
  }

  if (b.length >= 4 && (b.readUInt32BE(0) === 0x49492a00 || b.readUInt32BE(0) === 0x4d4d002a)) {
    // Dimensions need an IFD walk. The app never writes TIFF, so identifying
    // the format is all that is wanted here.
    return facts('tiff');
  }

  return facts('unknown');
}

/** Width and height from the first JPEG start-of-frame marker. */
function jpegSize(b: Buffer): [number, number] {
  let offset = 2;
  while (offset + 9 < b.length) {
    if (b[offset] !== 0xff) { offset++; continue; }
    const marker = b[offset + 1];
    // SOF0–SOF15, excluding DHT (c4), JPGA (c8) and DAC (cc), which are not frames.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return [b.readUInt16BE(offset + 7), b.readUInt16BE(offset + 5)];
    }
    offset += 2 + b.readUInt16BE(offset + 2);
  }
  return [0, 0];
}

/** Width and height from a WebP's VP8, VP8L or VP8X chunk. */
function webpSize(b: Buffer): [number, number] {
  const chunk = b.toString('ascii', 12, 16);

  if (chunk === 'VP8 ' && b.length >= 30) {
    return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
  }
  if (chunk === 'VP8L' && b.length >= 25) {
    const bits = b.readUInt32LE(21);
    return [(bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1];
  }
  if (chunk === 'VP8X' && b.length >= 30) {
    // 24-bit little-endian, stored as one less than the real size.
    const w = b[24] | (b[25] << 8) | (b[26] << 16);
    const h = b[27] | (b[28] << 8) | (b[29] << 16);
    return [w + 1, h + 1];
  }
  return [0, 0];
}

/**
 * The output is not simply a copy of the input.
 *
 * Every tool changes its document somehow, so a byte-identical output means the
 * work never happened — a pass-through that satisfies "a file exists", "it is a
 * valid PDF" and every size assertion loose enough to allow no change at all.
 */
export function differsFrom(sourcePath: string, outputPath: string): boolean {
  return !readFileSync(sourcePath).equals(readFileSync(outputPath));
}
