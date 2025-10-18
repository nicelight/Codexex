import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');
const defaultIconsDir = join(projectRoot, 'extension', 'icons');
const iconsSpecPath = join(__dirname, 'extension-icons.json');

const decodeBase64 = (value) => Buffer.from(value, 'base64');

const normalizeTargetDir = (dir) => {
  return isAbsolute(dir) ? dir : resolve(projectRoot, dir);
};

const loadIconSpecs = async () => {
  const source = await readFile(iconsSpecPath, 'utf-8');
  const entries = JSON.parse(source);

  if (!Array.isArray(entries)) {
    throw new Error('Icon specification must be an array');
  }

  return entries.map((entry) => {
    const { name, base64, size } = entry ?? {};
    if (typeof name !== 'string' || name.length === 0) {
      throw new Error('Icon specification is missing required "name" field');
    }
    if (typeof base64 !== 'string' || base64.length === 0) {
      throw new Error(`Icon "${name}" is missing its base64 payload`);
    }
    if (typeof size !== 'number') {
      throw new Error(`Icon "${name}" is missing its numeric "size" field`);
    }

    return { name, base64, size };
  });
};

const writeIconsToDir = async (icons, targetDir) => {
  await mkdir(targetDir, { recursive: true });

  await Promise.all(
    icons.map(async ({ name, base64 }) => {
      const filePath = join(targetDir, name);
      await writeFile(filePath, decodeBase64(base64));
    })
  );
};

const main = async () => {
  const iconSpecs = await loadIconSpecs();
  const cliTargets = process.argv.slice(2).filter(Boolean);
  const targetDirs = [defaultIconsDir, ...cliTargets.map(normalizeTargetDir)];

  for (const targetDir of new Set(targetDirs)) {
    await writeIconsToDir(iconSpecs, targetDir);
  }
};

await main();
