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
    exclude: ['src/e2e/**'], // E2E tests run via wdio, not vitest
    setupFiles: ['./src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/lib/**', 'src/components/**'],
      exclude: [
        'src/lib/__tests__/**',
        'src/test/**',
        'src/lib/pdfThumbnail.ts', // browser-only (DOM canvas + pdfjs worker)
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
