import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: false, // explicit imports — keeps test files self-documenting
    testTimeout: 15000, // imageProcessor integration fixture test takes ~3.5s; give headroom when running full suite
    environment: 'node', // default for lib tests — pdf-lib works in Node
    environmentMatchGlobs: [
      ['src/components/**/*.test.tsx', 'jsdom'], // component tests need DOM
      ['src/integration/**/*.test.tsx', 'jsdom'], // integration tests need DOM
    ],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    // The E2E specs run under wdio, not vitest. The helpers they lean on are a
    // different matter: the output verifier decides whether every future tool
    // test means anything, and a verifier that silently returns nothing turns
    // the whole suite green. It gets covered by the fast suite, against real
    // fixture bytes.
    exclude: ['src/e2e/tests/**', 'src/e2e/wdio.conf.ts'],
    setupFiles: ['./src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/lib/**', 'src/components/**'],
      exclude: [
        'src/lib/__tests__/**',
        'src/test/**',
        'src/lib/pdfThumbnail.ts', // browser-only (DOM canvas + pdfjs worker)
        'src/lib/pdfOutline.ts', // extractPdfOutline is browser-only (pdfjs worker); pure logic tested via outlineToBoundaries
      ],
    },
  },
  resolve: {
    alias: [
      { find: '@', replacement: path.resolve(__dirname, './src') },
      // pdf.js ships a separate build for Node and says so out loud: the
      // default one calls Promise.try, which Node 22 does not have, and prints
      // "Please use the `legacy` build in Node.js environments" before failing.
      // Without this, every getDocument() in a test rejects for a reason that
      // has nothing to do with the document, which is how a password check that
      // answered the same way for every file looked like it was passing.
      // The app itself keeps the default build: its webview has what that needs.
      // Exact match only. A plain string alias matches by prefix, which rewrote
      // explicit subpath imports into .../pdf.mjs/legacy/build/pdf.mjs.
      { find: /^pdfjs-dist$/, replacement: path.resolve(__dirname, './node_modules/pdfjs-dist/legacy/build/pdf.mjs') },
    ],
  },
});
