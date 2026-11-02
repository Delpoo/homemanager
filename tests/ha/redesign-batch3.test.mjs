import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { assertControlLayout } from '../../src/ha/validation.mjs';
const cases = JSON.parse(readFileSync(new URL('../fixtures/redesign-batch3.json', import.meta.url)));
const catalog = JSON.parse(readFileSync(new URL('../../schemas/catalog.schema.json', import.meta.url)));
const piece = catalog.$defs.device.properties.bindings.properties.layout;
const ajv = new Ajv({ strict: true, strictTypes: false });
addFormats(ajv);
const validate = ajv.compile(piece);
test('shared designer layouts agree in JavaScript and JSON Schema, without mutating old layouts', () => {
  for (const [expected, entries] of [
    [true, cases.valid],
    [false, cases.invalid],
  ]) {
    for (const layout of entries) {
      const before = structuredClone(layout);
      if (expected) assert.doesNotThrow(() => assertControlLayout(layout));
      else assert.throws(() => assertControlLayout(layout), JSON.stringify(layout));
      assert.equal(validate(layout), expected, JSON.stringify(validate.errors));
      assert.deepEqual(layout, before);
    }
  }
});
