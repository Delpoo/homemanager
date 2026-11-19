import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { assertControlLayout } from '../../src/ha/validation.mjs';
import {
  APPLIANCES,
  DESIGNS,
  applyTemplate,
  learnOrder,
  libraryNames,
  resolveWanted,
  setTemplateNames,
  template,
  wantedId,
} from '../../.work/model/remote-templates.js';

const catalog = JSON.parse(readFileSync(new URL('../../schemas/catalog.schema.json', import.meta.url)));
const ajv = new Ajv({ strict: true, strictTypes: false });
addFormats(ajv);
const schema = ajv.compile(catalog.$defs.device.properties.bindings.properties.layout);
const fixture = JSON.parse(readFileSync(new URL('../fixtures/remote-templates.json', import.meta.url)));

test('every starting design is a valid layout that waits for each button it uses, without overlaps', () => {
  for (const [kind] of APPLIANCES)
    for (const [design] of DESIGNS) {
      const layout = template(kind, design);
      const where = `${kind}/${design}`;
      assert.doesNotThrow(() => assertControlLayout(structuredClone(layout)), where);
      assert.equal(schema(layout), true, `${where} ${JSON.stringify(schema.errors)}`);
      const canvas = layout.find(piece => piece.type === 'canvas');
      const wanted = new Set(canvas.wanted.map(item => item.id));
      assert.equal(wanted.size, canvas.wanted.length, where);
      const pieces = layout.filter(piece => piece.type !== 'canvas');
      for (const piece of pieces) {
        for (const ref of [...piece.buttons, ...Object.values(piece.slots ?? {})])
          assert.ok(wanted.has(ref), `${where} ${piece.id} ${ref}`);
        assert.ok(
          piece.x >= 0 && piece.x + piece.w <= canvas.w && piece.y + piece.h <= canvas.h,
          `${where} ${piece.id} out of the canvas`,
        );
      }
      const cells = new Set();
      for (const piece of pieces)
        for (let x = piece.x; x < piece.x + piece.w; x++)
          for (let y = piece.y; y < piece.y + piece.h; y++) {
            assert.ok(!cells.has(`${x},${y}`), `${where} overlap at ${x},${y} (${piece.id})`);
            cells.add(`${x},${y}`);
          }
    }
});

test('the guide asks for the buttons of the mockup, and a learned name takes its place in any design', () => {
  assert.equal(learnOrder('ac', 'modern').length, 22);
  assert.equal(learnOrder('ac', 'classic').length, 26);
  assert.equal(learnOrder('fan', 'modern').length, 7);
  assert.equal(learnOrder('cover', 'classic').length, 6);
  assert.equal(learnOrder('ac', 'modern')[0].name, 'Encender / apagar');
  const learned = [
    { id: 'power-1', name: 'Encender / apagar' },
    { id: 'up-1', name: 'Velocidad +' },
  ];
  for (const [design] of DESIGNS) {
    const layout = applyTemplate('fan', design, learned);
    const canvas = layout.find(piece => piece.type === 'canvas');
    assert.ok(!canvas.wanted.some(item => item.name === 'Encender / apagar'), design);
    assert.ok(
      layout.some(piece => piece.buttons.includes('power-1')),
      design,
    );
    assert.ok(
      layout.some(piece => piece.buttons.includes('up-1')),
      design,
    );
    assert.ok(
      layout.some(piece => piece.buttons.includes(wantedId('Velocidad −'))),
      design,
    );
  }
  assert.equal(wantedId('Temperatura +'), 'w-temperatura-mas');
  assert.equal(wantedId('Temperatura −'), 'w-temperatura-menos');
});

test('the Home Assistant check uses the same templates (tests/fixtures/remote-templates.json)', () => {
  const now = Object.fromEntries(
    APPLIANCES.flatMap(([kind]) => DESIGNS.map(([design]) => [`${kind}/${design}`, template(kind, design)])),
  );
  assert.deepEqual(fixture, now, 'run: node scripts/remote-templates-fixture.mjs');
});

test('library buttons are recognised by their usual names, each used once', () => {
  const wanted = learnOrder('tv', 'modern');
  const entries = ['POWER', 'Vol_up', 'VOL-', 'Mute', 'OK', 'Netflix', '5', 'Unknown thing'].map((name, index) => ({
    index,
    name,
  }));
  assert.deepEqual(libraryNames(wanted, entries), {
    0: 'Encender / apagar',
    1: 'Volumen +',
    2: 'Volumen −',
    3: 'Silencio',
    4: 'OK',
    5: 'Netflix',
    6: 'Número 5',
  });
  assert.deepEqual(
    libraryNames(learnOrder('fan', 'classic'), [
      { index: 0, name: 'power' },
      { index: 1, name: 'Power' },
    ]),
    {
      0: 'Encender / apagar',
    },
  );
});

test('templates speak the screen language; ids, Spanish learned names and library words still match', () => {
  const english = {
    'Velocidad +': 'Speed +',
    'Velocidad −': 'Speed −',
    Velocidad: 'Speed',
    'Encender / apagar': 'On / off',
  };
  setTemplateNames(name => english[name] ?? name);
  try {
    const layout = template('fan', 'modern');
    const wanted = layout.find(piece => piece.type === 'canvas').wanted;
    const plus = wanted.find(item => item.id === wantedId('Velocidad +'));
    assert.equal(plus.name, 'Speed +');
    assert.ok(layout.some(piece => piece.label === 'Speed'));
    // A button learned with the Spanish name still takes its place; an English one too.
    const resolved = resolveWanted(layout, [
      { id: 'b1', name: 'Velocidad +' },
      { id: 'b2', name: 'On / off' },
    ]);
    const left = resolved.find(piece => piece.type === 'canvas').wanted ?? [];
    assert.ok(!left.some(item => item.id === wantedId('Velocidad +') || item.id === wantedId('Encender / apagar')));
    assert.ok(
      resolved.some(piece => piece.buttons.includes('b1')) && resolved.some(piece => piece.buttons.includes('b2')),
    );
    // Library words are found by the waited id, whatever the language.
    assert.deepEqual(
      libraryNames(wanted, [
        { index: 0, name: 'speed_up' },
        { index: 1, name: 'POWER' },
      ]),
      {
        0: 'Speed +',
        1: 'On / off',
      },
    );
  } finally {
    setTemplateNames(name => name);
  }
});
