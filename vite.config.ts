import { defineConfig, type PluginOption } from 'vite';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import type { OutputAsset, OutputBundle } from 'rollup';

const projectRoot = __dirname;
const extensionRoot = path.resolve(projectRoot, 'extension');
const manifestPath = path.resolve(extensionRoot, 'manifest.json');
const iconsSpecPath = path.resolve(projectRoot, 'scripts', 'extension-icons.json');
const outDir = path.resolve(projectRoot, 'dist');

const backgroundEntry = path.resolve(extensionRoot, 'src/background/index.ts');
const contentEntry = path.resolve(extensionRoot, 'src/content/index.ts');
const popupEntry = path.resolve(extensionRoot, 'src/popup/index.html');

const entryFileNameMap = new Map([
  [path.relative(extensionRoot, backgroundEntry), 'src/background.js'],
  [path.relative(extensionRoot, contentEntry), 'src/content.main.js'],
]);

const POPUP_HTML_OUTPUT = 'src/popup.html';
const CONTENT_ASSET_GLOB = 'assets/*';
const MEDIA_ASSET_PATH = path.resolve(projectRoot, 'media', 'oh-oh-icq-sound.mp3');
const MEDIA_ASSET_OUTPUT = 'media/oh-oh-icq-sound.mp3';
const ICONS_OUTPUT_DIR = 'icons';

interface IconSpec {
  name: string;
  size: number;
  base64: string;
}

let cachedIconSpecs: IconSpec[] | null = null;

async function loadIconSpecs(): Promise<IconSpec[]> {
  if (cachedIconSpecs) {
    return cachedIconSpecs;
  }

  const source = await readFile(iconsSpecPath, 'utf-8');
  const specs = JSON.parse(source) as IconSpec[];

  cachedIconSpecs = specs;
  return cachedIconSpecs;
}

function ensureManifestIcons(manifest: Record<string, unknown>): Record<string, string> {
  const current = manifest.icons;
  if (current && typeof current === 'object') {
    return current as Record<string, string>;
  }

  const icons: Record<string, string> = {};
  manifest.icons = icons;
  return icons;
}

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

function findPopupHtmlFileName(bundle: OutputBundle): string | null {
  const htmlAssets = Object.values(bundle).filter(
    (asset): asset is OutputAsset => asset.type === 'asset' && asset.fileName.endsWith('.html'),
  );

  if (htmlAssets.length === 0) {
    return null;
  }

  const popupAsset = htmlAssets.find((asset) => asset.fileName === POPUP_HTML_OUTPUT);

  return (popupAsset ?? htmlAssets[0]).fileName;
}

function manifestCopyPlugin(): PluginOption {
  return {
    name: 'codex-manifest-copy',
    apply: 'build',
    enforce: 'post',
    buildStart() {
      this.addWatchFile(manifestPath);
      this.addWatchFile(iconsSpecPath);
    },
    async generateBundle(_, bundle) {
      const manifestSource = await readFile(manifestPath, 'utf-8');
      const manifest = JSON.parse(manifestSource);
      const iconSpecs = await loadIconSpecs();

      const backgroundFileName = findChunkFileName(bundle, backgroundEntry);
      const contentFileName = findChunkFileName(bundle, contentEntry);
      const popupHtmlFileName = findPopupHtmlFileName(bundle);

      if (!popupHtmlFileName) {
        this.warn(
          `Popup HTML asset not found in bundle; defaulting to \"${POPUP_HTML_OUTPUT}\" in manifest`,
        );
      }

      const contentLoaderFileName = 'src/content.js';
      const ensureContentResources = () => {
        const requiredResources = new Set([contentFileName, CONTENT_ASSET_GLOB, MEDIA_ASSET_OUTPUT]);

        if (!Array.isArray(manifest.web_accessible_resources) || manifest.web_accessible_resources.length === 0) {
          manifest.web_accessible_resources = [
            {
              resources: Array.from(requiredResources),
              matches: [
                'https://*.openai.com/*',
                'https://*.chatgpt.com/*',
              ],
            },
          ];
          return;
        }

        const targetEntry =
          manifest.web_accessible_resources.find(
            (entry: { resources?: string[] }) =>
              Array.isArray(entry.resources) && entry.resources.includes(contentFileName),
          ) ?? manifest.web_accessible_resources[0];

        const currentResources = new Set(targetEntry.resources ?? []);
        for (const resource of requiredResources) {
          currentResources.add(resource);
        }

        targetEntry.resources = Array.from(currentResources).sort();
      };

      if (manifest.background) {
        manifest.background.service_worker = backgroundFileName;
      }

      if (manifest.action) {
        manifest.action.default_popup = popupHtmlFileName ?? POPUP_HTML_OUTPUT;
      }

      if (Array.isArray(manifest.content_scripts)) {
        manifest.content_scripts = manifest.content_scripts.map((script: { js?: string[] }) => {
          if (Array.isArray(script.js) && script.js.length > 0) {
            return { ...script, js: [contentLoaderFileName] };
          }
          return script;
        });
      }

      const loaderSource = `(() => {
  const moduleUrl = chrome.runtime.getURL(${JSON.stringify(contentFileName)});

  import(moduleUrl).catch((error) => {
    console.error('Failed to bootstrap Codex content script module', error);
  });
})();\n`;

      this.emitFile({
        type: 'asset',
        fileName: contentLoaderFileName,
        source: loaderSource,
      });

      try {
        const mediaSource = await readFile(MEDIA_ASSET_PATH);
        this.emitFile({
          type: 'asset',
          fileName: MEDIA_ASSET_OUTPUT,
          source: mediaSource,
        });
      } catch (error) {
        this.warn(`Failed to bundle media asset "${MEDIA_ASSET_PATH}": ${String(error)}`);
      }

      ensureContentResources();

      const manifestIcons = ensureManifestIcons(manifest);

      for (const { name, base64, size } of iconSpecs) {
        const fileName = path.posix.join(ICONS_OUTPUT_DIR, name);
        manifestIcons[String(size)] = fileName;

        this.emitFile({
          type: 'asset',
          fileName,
          source: Buffer.from(base64, 'base64'),
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
          if (assetInfo.type === 'asset') {
            const assetName = assetInfo.name ? path.basename(assetInfo.name) : '';
            if (assetName === 'index.html' || assetName === 'popup.html') {
              return POPUP_HTML_OUTPUT;
            }
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
