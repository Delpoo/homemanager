import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { assertConfiguration } from '../../src/ha/validation.mjs';
import { assertActionDefinition } from '../../src/ha/actions.mjs';

// Plan 0.12 contract (#91–#97): the same cases are checked by the integration (test_plan012.py).
const cases = JSON.parse(readFileSync(new URL('../fixtures/plan012.json', import.meta.url), 'utf8'));
const schema = name => JSON.parse(readFileSync(new URL(`../../schemas/${name}.schema.json`, import.meta.url), 'utf8'));
const ajv = new Ajv({ strict: true, strictTypes: false, allErrors: true });
addFormats(ajv);
ajv.addSchema(schema('catalog'), 'catalog.schema.json');
const validate = ajv.compile(schema('configuration'));
function configuration({ display, bindings, config } = {}) {
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
    architecture: { format: 'svg', content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 80"/>' },
    actions: {},
    panels: {},
    stateSources: {},
    ...config,
  };
}

test('new optional fields of plan 0.12 are accepted by the validator and the schema', () => {
  for (const patch of cases.valid) {
    assert.doesNotThrow(() => assertConfiguration(configuration(patch)), JSON.stringify(patch));
    assert.equal(validate(configuration(patch)), true, JSON.stringify([patch, validate.errors]));
  }
});
test('unsafe links, nested menus and out-of-range values are rejected in both', () => {
  for (const patch of cases.invalid) {
    assert.throws(() => assertConfiguration(configuration(patch)), JSON.stringify(patch));
    assert.equal(validate(configuration(patch)), false, JSON.stringify(patch));
  }
});
test('device programs and modes are allowed actions; a select needs its option (#96)', () => {
  for (const action of [
    { domain: 'scene', service: 'turn_on', target: { entity_id: 'scene.ficticia' } },
    { domain: 'vacuum', service: 'return_to_base', target: { entity_id: 'vacuum.ficticio' } },
    { domain: 'select', service: 'select_option', target: { entity_id: 'select.ficticio' }, data: { option: 'alto' } },
  ])
    assert.doesNotThrow(() => assertActionDefinition(action), JSON.stringify(action));
  assert.throws(() =>
    assertActionDefinition({ domain: 'select', service: 'select_option', target: { entity_id: 'select.ficticio' } }),
  );
  assert.throws(() =>
    assertActionDefinition({ domain: 'vacuum', service: 'set_fan_speed', target: { entity_id: 'vacuum.ficticio' } }),
  );
});
test('indicators: one of each type, min below max and ranges in order are semantic checks (0.13)', () => {
  const ring = { type: 'ring', entity: 'cover.sample', min: 0, max: 100 };
  for (const indicators of [
    [ring, { ...ring, entity: 'cover.other' }],
    [{ ...ring, min: 50, max: 10 }],
    [{ type: 'border', entity: 'sensor.sample', ranges: [{ from: 5, to: 1, color: '#000000' }] }],
  ])
    assert.throws(() => assertConfiguration(configuration({ display: { indicators } })), JSON.stringify(indicators));
});
