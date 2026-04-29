#!/usr/bin/env node
/**
 * Generate E2E error-path fixtures into Tauri's $TEMP fs scope.
 * Run automatically via `npm run pretest:e2e` before every test run.
 *
 * Creates in ${os.tmpdir()}/papercut-e2e/error/:
 *   large-sparse.pdf   -- 110 MB sparse file (triggers >100 MB guard)
 *   large-sparse.jpg   -- 110 MB sparse file (image variant)
 *   corrupt.pdf        -- 0 bytes (triggers empty-file error)
 *   corrupt.jpg        -- 0 bytes (triggers empty-image error)
 *
 * Why $TEMP: Tauri's fs capability scope (capabilities/default.json) only
 * permits reads from $DOCUMENT, $DOWNLOAD, $DESKTOP, $TEMP. Fixtures placed
 * outside those paths are denied by the runtime, causing handleFileSelected
 * to fall into the corrupt-file branch and never advance past step 0.
 *
 * Real PDF/image inputs are staged from project test-fixtures/ → ${stage}/real/
 * by the wdio config's top-level setup (see src/e2e/wdio.conf.ts).
 */
import { writeFileSync, mkdirSync, openSync, ftruncateSync, closeSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const outDir = join(tmpdir(), 'papercut-e2e', 'error');
mkdirSync(outDir, { recursive: true });

function createSparseFile(filePath, sizeBytes) {
  const fd = openSync(filePath, 'w');
  ftruncateSync(fd, sizeBytes);
  closeSync(fd);
  console.log(`Created sparse file: ${filePath} (${(sizeBytes / 1024 / 1024).toFixed(0)} MB)`);
}

const MB_110 = 110 * 1024 * 1024;
createSparseFile(join(outDir, 'large-sparse.pdf'), MB_110);
createSparseFile(join(outDir, 'large-sparse.jpg'), MB_110);

// Zero-byte corrupt stubs
writeFileSync(join(outDir, 'corrupt.pdf'), Buffer.alloc(0));
writeFileSync(join(outDir, 'corrupt.jpg'), Buffer.alloc(0));

console.log(`E2E error-path fixtures ready in ${outDir}`);
