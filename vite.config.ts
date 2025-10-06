import { defineConfig, type PluginOption } from 'vite';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import type { OutputAsset, OutputBundle } from 'rollup';

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

function findChunkFileName(bundle: OutputBundle, entryPath: string): string {
  const normalizedEntry = path.normalize(entryPath);
  for (const chunk of Object.values(bundle)) {
    if (chunk.type !== 'chunk') {
      continue;
    }

    const facadeModuleId = chunk.facadeModuleId;
    if (!facadeModuleId) {
      continue;
    }

    if (path.normalize(facadeModuleId) === normalizedEntry) {
      return chunk.fileName;
    }
  }

  throw new Error(`Cannot locate output chunk for entry: ${entryPath}`);
}

function findPopupHtmlFileName(bundle: OutputBundle): string {
  const htmlAsset = Object.values(bundle).find(
    (asset): asset is OutputAsset => asset.type === 'asset' && asset.fileName.endsWith('.html'),
  );

  if (!htmlAsset) {
    throw new Error('Cannot locate popup HTML asset in the bundle output');
  }

  return htmlAsset.fileName;
}

function manifestCopyPlugin(): PluginOption {
  return {
    name: 'codex-manifest-copy',
    apply: 'build',
    buildStart() {
      this.addWatchFile(manifestPath);
    },
    async generateBundle(_, bundle) {
      const manifestSource = await readFile(manifestPath, 'utf-8');
      const manifest = JSON.parse(manifestSource);

      const backgroundFileName = findChunkFileName(bundle, backgroundEntry);
      const contentFileName = findChunkFileName(bundle, contentEntry);
      const popupHtmlFileName = findPopupHtmlFileName(bundle);

      if (manifest.background) {
        manifest.background.service_worker = backgroundFileName;
      }

      if (manifest.action) {
        manifest.action.default_popup = popupHtmlFileName;
      }

      if (Array.isArray(manifest.content_scripts)) {
        manifest.content_scripts = manifest.content_scripts.map((script: { js?: string[] }) => {
          if (Array.isArray(script.js) && script.js.length > 0) {
            return { ...script, js: [contentFileName] };
          }
          return script;
        });
      }

      const updatedManifest = `${JSON.stringify(manifest, null, 2)}\n`;

      this.emitFile({
        type: 'asset',
        fileName: 'manifest.json',
        source: updatedManifest,
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
