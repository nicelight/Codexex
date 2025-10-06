import { defineConfig } from 'vite';
import webExtension from '@webext-core/mv3-vite';
import path from 'node:path';

export default defineConfig({
  plugins: [
    webExtension({
      manifest: path.resolve(__dirname, 'extension/manifest.json'),
    }),
  ],
  resolve: {
    alias: {
      'src': path.resolve(__dirname, 'extension/src'),
      '@': path.resolve(__dirname, 'extension/src'),
    },
  },
  build: {
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['extension/tests/unit/**/*.test.ts'],
  },
});
