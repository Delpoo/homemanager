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
    ...(await load('src/i18n/en-shell.ts')).enShell,
    ...(await load('src/i18n/en-plan012.ts')).enPlan012,
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
    `data:text/javascript;base64,${Buffer.from(transformSync(readFileSync(path.join(root, 'src/i18n/index.ts'), 'utf8').replace("import { en } from './en.js';", "const en = { 'Encuadrar {label}': 'Show {label}' };").replace("import { enRf } from './en-rf.js';", 'const enRf = {};').replace("import { enControls } from './en-controls.js';", 'const enControls = {};').replace("import { enShell } from './en-shell.js';", 'const enShell = {};').replace("import { enPlan012 } from './en-plan012.js';", 'const enPlan012 = {};'), { loader: 'ts', format: 'esm' }).code).toString('base64')}`
  );
  assert.equal(i18n.t('Encuadrar {label}', { label: 'Sala' }), 'Show Sala');
  i18n.setLanguage(i18n.languageFromHass({ locale: { language: 'es-AR' } }));
  assert.equal(i18n.t('Encuadrar {label}', { label: 'Sala' }), 'Encuadrar Sala');
  i18n.setLanguage('de');
  assert.equal(i18n.t('Sin traducción'), 'Sin traducción');
  globalThis.__homemanagerLanguage = undefined;
});

test('a Spanish word with two meanings keeps both in English (0.14)', async () => {
  const { buildSync } = await import('esbuild');
  const [bundle] = buildSync({
    entryPoints: [path.join(root, 'src/i18n/index.ts')],
    bundle: true,
    format: 'esm',
    write: false,
    platform: 'neutral',
  }).outputFiles;
  const i18n = await import(`data:text/javascript;base64,${Buffer.from(bundle.text).toString('base64')}`);
  const before = globalThis.__homemanagerLanguage;
  i18n.setLanguage('en');
  // «Más» is the + key of a remote and the «More» menu; «Nivel» a button's level and an alert's severity.
  assert.equal(i18n.t('Más'), 'Up');
  assert.equal(i18n.tc('menú', 'Más'), 'More');
  assert.equal(i18n.t('Nivel'), 'Level');
  assert.equal(i18n.tc('alerta', 'Nivel'), 'Severity');
  assert.equal(i18n.tc('pestaña', 'Información'), 'Info');
  assert.equal(i18n.tc('pestaña', 'Botones'), i18n.t('Botones'), 'without its own context it is the plain word');
  // Every literal context in the code has its English.
  for (const file of sources(path.join(root, 'src')))
    for (const [, context, source] of readFileSync(file, 'utf8').matchAll(/\btc\(\s*'([^']+)',\s*'([^']+)'/g))
      assert.notEqual(i18n.tc(context, source), source, `No English for ${context}|${source}`);
  i18n.setLanguage('es');
  assert.equal(i18n.tc('menú', 'Más'), 'Más');
  globalThis.__homemanagerLanguage = before;
});
