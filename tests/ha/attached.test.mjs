import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { assertAttached } from '../../src/ha/validation.mjs';
import { attachedLook } from '../../.work/model/control-layout.js';
const cases = JSON.parse(readFileSync(new URL('../fixtures/attached.json', import.meta.url)));
const catalog = JSON.parse(readFileSync(new URL('../../schemas/catalog.schema.json', import.meta.url)));
const ajv = new Ajv({ strict: true, strictTypes: false });
addFormats(ajv);
const schema = ajv.compile(catalog.$defs.device.properties.display.properties.attached);

test('pieces attached to a symbol are checked the same way here, in Home Assistant and in the schema', () => {
  for (const list of cases.valid) {
    assert.doesNotThrow(() => assertAttached(list), JSON.stringify(list));
    assert.equal(schema(list), true, JSON.stringify(schema.errors));
  }
  for (const list of cases.invalid) {
    assert.throws(() => assertAttached(list), JSON.stringify(list));
    // The schema cannot say that ids are unique; the validators do.
    const repeated = Array.isArray(list) && new Set(list.map(item => item?.id)).size !== list.length;
    if (!repeated) assert.equal(schema(list), false, JSON.stringify(list));
  }
});

test('the attached look goes over the piece of the control, which keeps what it sends', () => {
  const piece = {
    id: 'speed',
    type: 'updown',
    x: 2,
    y: 3,
    w: 1,
    h: 2,
    buttons: ['a', 'b'],
    label: 'Vel',
    icon: null,
    shape: 'round',
    relief: 'flat',
  };
  const drawn = attachedLook(piece, {
    id: 'w1',
    piece: 'speed',
    dx: 0,
    dy: 0,
    w: 60,
    h: 40,
    look: { radius: 8, relief: 'raised', bg: '#FFFFFF' },
  });
  assert.deepEqual(drawn.buttons, ['a', 'b']);
  assert.equal(drawn.radius, 8);
  assert.equal(drawn.shape, undefined);
  assert.equal(drawn.relief, undefined);
  assert.equal(drawn.bg, '#FFFFFF');
  assert.deepEqual([drawn.x, drawn.y, drawn.w, drawn.h], [0, 0, 1, 1]);
});
