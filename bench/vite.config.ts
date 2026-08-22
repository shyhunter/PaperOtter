import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

const t = (f: string) => path.resolve(__dirname, 'tauri', f);

export default defineConfig({
  root: path.resolve(__dirname),
  publicDir: process.env.BENCH_FIXTURE_DIR || path.resolve(__dirname, '../test-fixtures'),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@/lib/diagLog': t('diaglog-console.ts'),
      '@': path.resolve(__dirname, '../src'),
      '@tauri-apps/plugin-fs': t('plugin-fs.ts'),
      '@tauri-apps/api/path': t('api-path.ts'),
      '@tauri-apps/api/core': t('api-core.ts'),
      '@tauri-apps/api/event': t('api-event.ts'),
      '@tauri-apps/api/window': t('api-window.ts'),
      '@tauri-apps/api/webview': t('api-webview.ts'),
      '@tauri-apps/plugin-dialog': t('plugin-dialog.ts'),
      '@tauri-apps/plugin-store': t('plugin-store.ts'),
      '@tauri-apps/plugin-updater': t('plugin-misc.ts'),
      '@tauri-apps/plugin-process': t('plugin-misc.ts'),
      '@tauri-apps/plugin-opener': t('plugin-misc.ts'),
      '@tauri-apps/plugin-shell': t('plugin-misc.ts'),
      '@tauri-apps/plugin-http': t('plugin-misc.ts'),
    },
  },
  build: {
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        editor: path.resolve(__dirname, 'editor.html'),
        repro: path.resolve(__dirname, 'react-repro.html'),
        index: path.resolve(__dirname, 'index.html'),
      },
    },
  },
  server: { port: 1499, strictPort: true },
  preview: { port: 1498, strictPort: true },
});
