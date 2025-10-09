import { defineConfig } from 'vitest/config';
import path from 'node:path';

const resolveAlias = {
  src: path.resolve(__dirname, 'extension/src'),
  '@': path.resolve(__dirname, 'extension/src'),
};

export default defineConfig({
  resolve: {
    alias: resolveAlias,
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['extension/tests/contract/**/*.test.ts'],
    watch: false,
  },
});
