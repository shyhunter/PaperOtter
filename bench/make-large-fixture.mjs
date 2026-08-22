// Generates the large stress fixture used by the bench harness: a PDF with
// enough pages and embedded images to match a real-world scanned document.
// The output is gitignored — regenerate it locally rather than committing 40 MB.
//
//   node bench/make-large-fixture.mjs <imageDir> <out.pdf> [pages] [imagesPerPage]
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require_ = createRequire(fileURLToPath(new URL('../package.json', import.meta.url)));
const { PDFDocument, StandardFonts, rgb } = require_('pdf-lib');
import fs from 'node:fs';
import path from 'node:path';

const IMG_DIR = process.argv[2];
const OUT = process.argv[3];
const PAGES = Number(process.argv[4] ?? 688);
const IMGS_PER_PAGE = Number(process.argv[5] ?? 2);

const imgs = fs.readdirSync(IMG_DIR).filter(f => f.endsWith('.jpg'))
  .map(f => fs.readFileSync(path.join(IMG_DIR, f)));

const t0 = Date.now();
const doc = await PDFDocument.create();
const font = await doc.embedFont(StandardFonts.Helvetica);

let imgCount = 0;
for (let p = 0; p < PAGES; p++) {
  const page = doc.addPage([595, 842]);
  for (let k = 0; k < IMGS_PER_PAGE; k++) {
    // embed fresh each time -> distinct image objects, like a real scanned doc
    const jpg = await doc.embedJpg(imgs[(p * IMGS_PER_PAGE + k) % imgs.length]);
    imgCount++;
    page.drawImage(jpg, { x: 40, y: 500 - k * 230, width: 240, height: 200 });
  }
  page.drawText(`Stress fixture page ${p + 1} of ${PAGES}`, { x: 40, y: 800, size: 14, font, color: rgb(0,0,0) });
  for (let l = 0; l < 12; l++) {
    page.drawText(`Line ${l}: the quick brown fox jumps over the lazy dog ${p}-${l}`,
      { x: 40, y: 460 - l * 16, size: 9, font, color: rgb(0.2,0.2,0.2) });
  }
  if (p % 100 === 0) console.log(`  ...page ${p} (${((Date.now()-t0)/1000).toFixed(1)}s)`);
}

const bytes = await doc.save();
fs.writeFileSync(OUT, bytes);
console.log(`WROTE ${OUT}  pages=${PAGES} images=${imgCount} size=${(bytes.length/1048576).toFixed(1)}MB in ${((Date.now()-t0)/1000).toFixed(1)}s`);
