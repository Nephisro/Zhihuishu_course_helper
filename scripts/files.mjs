import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = dirname(dirname(fileURLToPath(import.meta.url)));
export const runtimeFiles = [
  'background.js', 'content.js', 'core.js', 'input-controller.js', 'chapter-engine.js', 'chapter-dom.js', 'chapter.js',
  'manifest.json', 'options.html', 'options.js', 'api-config.js', 'chapter-flow.js', 'page-runtime.js',
];
const rootFiles = ['.gitattributes', '.gitignore', 'CHANGELOG.md', 'README.md', 'package.json'];
const sourceDirectories = ['tests', 'scripts', 'docs', '.github'];

async function listTextFiles(directory) {
  const entries = await readdir(join(root, directory), { withFileTypes: true });
  const result = [];
  for (const entry of entries) {
    const relative = `${directory}/${entry.name}`;
    if (entry.isSymbolicLink()) throw new Error(`Symbolic links are not packaged: ${relative}`);
    if (entry.isDirectory()) result.push(...await listTextFiles(relative));
    else if (/\.(?:cjs|mjs|md|yml)$/.test(entry.name)) result.push(relative);
    else throw new Error(`Unexpected source file; review before packaging: ${relative}`);
  }
  return result;
}

export async function sourceFiles() {
  const files = [...rootFiles, ...runtimeFiles.map(name => `extension/${name}`)];
  for (const directory of sourceDirectories) files.push(...await listTextFiles(directory));
  // An owner-selected license is included automatically if present.
  try {
    await readFile(join(root, 'LICENSE'));
    files.push('LICENSE');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  return files.sort();
}

export async function readText(relative) {
  return (await readFile(join(root, relative), 'utf8')).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
}
