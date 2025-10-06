import { defineConfig, type PluginOption } from 'vite';
import path from 'node:path';
import { readFile } from 'node:fs/promises';

const projectRoot = __dirname;
const extensionRoot = path.resolve(projectRoot, 'extension');
const manifestPath = path.resolve(extensionRoot, 'manifest.json');
const outDir = path.resolve(projectRoot, 'dist');

const backgroundEntry = path.resolve(extensionRoot, 'src/background/index.ts');
const contentEntry = path.resolve(extensionRoot, 'src/content/index.ts');
const popupEntry = path.resolve(extensionRoot, 'src/popup/index.html');

const entryFileNameMap = new Map([
  [path.relative(extensionRoot, backgroundEntry), 'src/background.js'],
  [path.relative(extensionRoot, contentEntry), 'src/content.js'],
]);

function manifestCopyPlugin(): PluginOption {
  return {
    name: 'codex-manifest-copy',
    apply: 'build',
    buildStart() {
      this.addWatchFile(manifestPath);
    },
    async generateBundle() {
      const manifestSource = await readFile(manifestPath, 'utf-8');
      this.emitFile({
        type: 'asset',
        fileName: 'manifest.json',
        source: manifestSource,
      });
    },
  };
}

export default defineConfig({
  resolve: {
    alias: {
      src: path.resolve(extensionRoot, 'src'),
      '@': path.resolve(extensionRoot, 'src'),
    },
  },
  plugins: [manifestCopyPlugin()],
  build: {
    outDir,
    emptyOutDir: true,
    rollupOptions: {
      input: {
        background: backgroundEntry,
        content: contentEntry,
        popup: popupEntry,
      },
      output: {
        entryFileNames: (chunkInfo) => {
          const facadeModuleId = chunkInfo.facadeModuleId;
          if (facadeModuleId) {
            const relativePath = path.relative(extensionRoot, facadeModuleId);
            const explicitName = entryFileNameMap.get(relativePath);
            if (explicitName) {
              return explicitName;
            }
          }
          return 'assets/[name]-[hash].js';
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: (assetInfo) => {
          if (assetInfo.type === 'asset' && assetInfo.name === 'index.html') {
            return 'src/popup.html';
          }
          return 'assets/[name]-[hash][extname]';
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['extension/tests/unit/**/*.test.ts'],
  },
});
