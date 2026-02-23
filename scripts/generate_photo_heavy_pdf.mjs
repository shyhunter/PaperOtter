/**
 * Generates test-fixtures/photo_heavy.pdf — a 3-page PDF with the pexels
 * JPEG embedded on each page. Used to verify real GS compression differences
 * in automated tests (a text-only PDF compresses differently than an image PDF).
 *
 * Run from the project root:
 *   node scripts/generate_photo_heavy_pdf.mjs
 */
import { PDFDocument } from 'pdf-lib';
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');

const jpegPath = resolve(projectRoot, 'test-fixtures/pexels-pixabay-459225.jpg');
const outputPath = resolve(projectRoot, 'test-fixtures/photo_heavy.pdf');

const pexelsJpeg = readFileSync(jpegPath);

const pdfDoc = await PDFDocument.create();
const jpgImage = await pdfDoc.embedJpg(pexelsJpeg);
const { width: imgW, height: imgH } = jpgImage.scale(1);

for (let i = 0; i < 3; i++) {
  const page = pdfDoc.addPage([imgW, imgH]);
  page.drawImage(jpgImage, { x: 0, y: 0, width: imgW, height: imgH });
}

const bytes = await pdfDoc.save();
writeFileSync(outputPath, bytes);
console.log('Generated test-fixtures/photo_heavy.pdf —', bytes.length, 'bytes (', (bytes.length / 1024 / 1024).toFixed(2), 'MB)');
