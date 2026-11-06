import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { assertConfiguration } from '../../src/ha/validation.mjs';
const cases = JSON.parse(readFileSync('tests/fixtures/plan-outline.json'));
const ajv = new Ajv({ strict: true, strictTypes: false });
addFormats(ajv);
ajv.addSchema(JSON.parse(readFileSync('schemas/catalog.schema.json')), 'catalog.schema.json');
const validate = ajv.compile(JSON.parse(readFileSync('schemas/configuration.schema.json')));
test('0.13: a space outline agrees in JS and in the schema, and is never changed by validating', () => {
  for (const [expected, rooms] of [
    [true, cases.valid],
    [false, cases.invalid],
  ])
    for (const room of rooms) {
      const configuration = { ...structuredClone(cases.base), rooms: [room] };
      const before = structuredClone(configuration);
      assert.equal(validate(configuration), expected, `${JSON.stringify(room)} ${JSON.stringify(validate.errors)}`);
      if (expected) assert.doesNotThrow(() => assertConfiguration(configuration));
      else assert.throws(() => assertConfiguration(configuration), JSON.stringify(room));
      assert.deepEqual(configuration, before);
    }
});
