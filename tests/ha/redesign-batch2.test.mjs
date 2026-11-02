import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { assertConfiguration } from '../../src/ha/validation.mjs';
const cases = JSON.parse(readFileSync(new URL('../fixtures/redesign-batch2.json', import.meta.url), 'utf8'));
const schema = name => JSON.parse(readFileSync(new URL(`../../schemas/${name}.schema.json`, import.meta.url), 'utf8'));
const ajv = new Ajv({ strict: true, strictTypes: false, allErrors: true });
addFormats(ajv);
ajv.addSchema(schema('catalog'), 'catalog.schema.json');
const validate = ajv.compile(schema('configuration'));
export function configuration(patch = {}) {
  const { display, bindings, rules } = patch;
  return {
    schemaVersion: 2,
    rooms: [],
    catalog: {
      schemaVersion: 2,
      devices: [
        {
          id: 'sample',
          roomId: null,
          kind: 'light',
          position: { x: 0.5, y: 0.5 },
          mobility: 'editable',
          display: { label: 'Sample', icon: 'mdi:lightbulb', ...display },
          bindings: { entityId: 'light.sample', primaryAction: null, advancedPopupId: null, ...bindings },
          state: { value: 'unknown', confidence: 'unknown' },
        },
      ],
    },
    architecture: { format: 'svg', content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"/>' },
    actions: {},
    panels: {},
    stateSources: {},
    ...(rules !== undefined ? { rules } : {}),
  };
}
test('E05–E08 shared accepted/rejected cases agree between JS and JSON Schema', () => {
  for (const patch of cases.valid) {
    const input = configuration(patch),
      before = structuredClone(input);
    assert.deepEqual(assertConfiguration(input), before);
    assert.equal(validate(input), true, JSON.stringify(validate.errors));
    assert.deepEqual(input, before);
  }
  for (const patch of cases.invalid) {
    const input = configuration(patch);
    assert.throws(() => assertConfiguration(input), JSON.stringify(patch));
    assert.equal(validate(input), false, JSON.stringify(patch));
  }
});
test('rules reject semantic ambiguity and the whole document remains size bounded', () => {
  const r = cases.valid.find(p => p.rules?.length).rules[0];
  for (const rule of [
    { ...r, sources: [{ reading: 'sensor.sample' }, { reading: 'binary_sensor.sample' }] },
    { ...r, sources: [{ reading: 'sensor.sample' }, { reading: 'sensor.sample' }] },
    { ...r, below: undefined },
  ]) {
    const c = configuration({ rules: [rule] });
    assert.throws(() => assertConfiguration(c));
  }
  assert.throws(() =>
    assertConfiguration(
      configuration({ rules: Array.from({ length: 2001 }, (_, i) => ({ ...r, id: 'sample-' + i })) }),
    ),
  );
});
