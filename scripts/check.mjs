import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { root, runtimeFiles, sourceFiles, readText } from './files.mjs';

const manifest = JSON.parse(await readText('extension/manifest.json'));
const pkg = JSON.parse(await readText('package.json'));
assert.equal(manifest.manifest_version, 3, 'Expected a Manifest V3 extension');
assert.equal(pkg.version, manifest.version, 'package.json and manifest.json versions must match');
assert.match(pkg.version, /^\d+\.\d+\.\d+$/, 'Expected a three-part release version');
assert.ok(Number(manifest.minimum_chrome_version) >= 118, 'Chrome 118 or later is required');
const actual = await readdir(join(root, 'extension'), { withFileTypes: true });
assert.ok(actual.every(entry => entry.isFile()), 'Only regular runtime files belong in extension/');
assert.deepEqual(actual.map(entry => entry.name).sort(), [...runtimeFiles].sort(), 'Review the runtime file list before packaging new files');
const references = [
  manifest.background.service_worker,
  manifest.options_page,
  ...manifest.content_scripts.flatMap(script => script.js),
];
const options = await readText(`extension/${manifest.options_page}`);
for (const match of options.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/g)) references.push(match[1]);
const background = await readText(`extension/${manifest.background.service_worker}`);
for (const match of background.matchAll(/importScripts\(['"]([^'"]+)['"]\)/g)) references.push(match[1]);
for (const reference of references) assert.ok(runtimeFiles.includes(reference), `Missing runtime reference: ${reference}`);

const files = await sourceFiles();
let syntaxCount = 0;
for (const file of files) {
  const content = await readText(file);
  assert.ok(!/[A-Z]:[\\/]Users[\\/]/i.test(content), `Remove local user paths from ${file}`);
  assert.ok(!/\bsk-[A-Za-z0-9_-]{20,}\b/.test(content), `Possible API key in ${file}; inspect it before publishing`);
  assert.ok(!/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(content), `Private key material in ${file}`);
  if (/\.(?:js|mjs|cjs)$/.test(file)) {
    const checked = spawnSync(process.execPath, ['--check', join(root, file)], { encoding: 'utf8' });
    assert.equal(checked.status, 0, `${file}\n${checked.stderr || checked.error || ''}`);
    syntaxCount++;
  }
}
console.log(`Checked v${pkg.version}: ${files.length} source files, ${syntaxCount} JavaScript syntax checks, manifest references and basic secret/path checks passed.`);
