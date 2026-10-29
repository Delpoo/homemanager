import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { transformSync } from 'esbuild';

const root = fileURLToPath(new URL('../', import.meta.url));
const load = async file => {
  const { code } = transformSync(readFileSync(path.join(root, file), 'utf8'), { loader: 'ts', format: 'esm' });
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
};
function sources(dir) {
  return readdirSync(dir).flatMap(name => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory()
      ? sources(full)
      : /\.ts$/.test(name) && !full.includes(`${path.sep}i18n${path.sep}`)
        ? [full]
        : [];
  });
}
const keys = new Set();
for (const file of sources(path.join(root, 'src')))
  for (const match of readFileSync(file, 'utf8').matchAll(/\bt\(\s*'((?:[^'\\]|\\.)*)'/g))
    keys.add(match[1].replace(/\\'/g, "'"));

test('every user-facing string has an English translation with the same variables', async () => {
  // RF and device-control strings live in their own files; index.ts reads all.
  const en = {
    ...(await load('src/i18n/en.ts')).en,
    ...(await load('src/i18n/en-rf.ts')).enRf,
    ...(await load('src/i18n/en-controls.ts')).enControls,
  };
  const missing = [...keys].filter(key => !Object.hasOwn(en, key));
  assert.deepEqual(missing, [], `Missing English translations:\n${missing.join('\n')}`);
  const vars = text => [...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();
  for (const key of keys) assert.deepEqual(vars(en[key]), vars(key), `Variables differ for: ${key}`);
  assert.ok(keys.size > 300);
});

test('language follows Home Assistant and falls back to readable text', async () => {
  globalThis.__homemanagerLanguage = undefined;
  const i18n = await import(
    `data:text/javascript;base64,${Buffer.from(transformSync(readFileSync(path.join(root, 'src/i18n/index.ts'), 'utf8').replace("import { en } from './en.js';", "const en = { 'Encuadrar {label}': 'Show {label}' };").replace("import { enRf } from './en-rf.js';", 'const enRf = {};').replace("import { enControls } from './en-controls.js';", 'const enControls = {};'), { loader: 'ts', format: 'esm' }).code).toString('base64')}`
  );
  assert.equal(i18n.t('Encuadrar {label}', { label: 'Sala' }), 'Show Sala');
  i18n.setLanguage(i18n.languageFromHass({ locale: { language: 'es-AR' } }));
  assert.equal(i18n.t('Encuadrar {label}', { label: 'Sala' }), 'Encuadrar Sala');
  i18n.setLanguage('de');
  assert.equal(i18n.t('Sin traducción'), 'Sin traducción');
  globalThis.__homemanagerLanguage = undefined;
});
