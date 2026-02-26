#!/usr/bin/env node
/**
 * Generate E2E error-path fixtures.
 * Run automatically via `npm run pretest:e2e` before every test run.
 *
 * Creates in test-fixtures-e2e/:
 *   large-sparse.pdf   -- 110 MB sparse file (triggers >100 MB guard)
 *   large-sparse.jpg   -- 110 MB sparse file (image variant)
 *   corrupt.pdf        -- 0 bytes (triggers empty-file error)
 *   corrupt.jpg        -- 0 bytes (triggers empty-image error)
 *
 * Real PDF/image inputs are reused from test-fixtures/ -- no need to regenerate them.
 *
 * Note: test-fixtures-e2e/large-sparse.* are in .gitignore (too large to commit).
 *       test-fixtures-e2e/corrupt.* ARE committed as zero-byte stubs.
 */
import { writeFileSync, mkdirSync, openSync, ftruncateSync, closeSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '../../../test-fixtures-e2e');
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

// Zero-byte corrupt stubs (already committed; recreated here for idempotency)
writeFileSync(join(outDir, 'corrupt.pdf'), Buffer.alloc(0));
writeFileSync(join(outDir, 'corrupt.jpg'), Buffer.alloc(0));

console.log('E2E error-path fixtures ready in test-fixtures-e2e/');
