import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// #78: no technical words in visible text outside Advanced. A few messages belong to
// advanced places (icon names, logical actions) and are listed on purpose.
const root = fileURLToPath(new URL('../../', import.meta.url));
const ADVANCED = new Set([
  'El icono debe usar mdi:nombre.',
  'El icono debe ser un nombre mdi: válido.',
  'Definí únicamente destinos entity_id explícitos.',
  'Buscar: luz, ventilador, mdi:…',
  '{zones} zonas · {spaces} espacios · {devices} dispositivos · huella {print}',
]);
const FORBIDDEN = /entity_id|\bmdi:|\btransparent\b|\bhuella\b/;
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
test('visible texts carry no technical words outside Advanced (#78)', () => {
  const offending = [];
  for (const file of sources(path.join(root, 'src')))
    for (const match of readFileSync(file, 'utf8').matchAll(/\bt\(\s*'((?:[^'\\]|\\.)*)'/g)) {
      const key = match[1].replace(/\\'/g, "'");
      if (FORBIDDEN.test(key) && !ADVANCED.has(key)) offending.push(`${path.relative(root, file)}: ${key}`);
    }
  assert.deepEqual(offending, []);
});
test('the glossary exists in Spanish and English (#78)', () => {
  const glossary = readFileSync(path.join(root, 'docs/rediseno/glosario.md'), 'utf8');
  for (const word of ['Espacio', 'Space', 'Configuración', 'Settings', 'Datos técnicos', 'Technical details'])
    assert.match(glossary, new RegExp(word));
});
