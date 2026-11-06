import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { assertControlLayout } from '../../src/ha/validation.mjs';
const cases = JSON.parse(readFileSync(new URL('../fixtures/designer-look.json', import.meta.url)));
const catalog = JSON.parse(readFileSync(new URL('../../schemas/catalog.schema.json', import.meta.url)));
const ajv = new Ajv({ strict: true, strictTypes: false });
addFormats(ajv);
const schema = ajv.compile(catalog.$defs.device.properties.bindings.properties.layout);

test('the designer look and behaviour is checked the same way as in Home Assistant (piece_look.py)', () => {
  for (const layout of cases.valid) {
    const before = structuredClone(layout);
    assert.doesNotThrow(() => assertControlLayout(layout), JSON.stringify(layout));
    assert.equal(schema(layout), true, JSON.stringify(schema.errors));
    assert.deepEqual(layout, before);
  }
  for (const layout of cases.invalid) assert.throws(() => assertControlLayout(layout), JSON.stringify(layout));
});
