import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { assertConfiguration, inspectConfiguration } from '../../src/ha/validation.mjs';
import { LEGACY_V1_ROOM_IDS } from '../../src/ha/migration.mjs';
const make = () => ({
  schemaVersion: 2,
  rooms: [{ id: 'living', label: 'Sample space' }],
  catalog: {
    schemaVersion: 2,
    devices: [
      {
        id: 'sample-light',
        roomId: 'living',
        kind: 'light',
        position: { x: 0.5, y: 0.5 },
        mobility: 'editable',
        display: { label: 'Sample', icon: 'mdi:lightbulb' },
        bindings: { entityId: 'light.sample', primaryAction: null, advancedPopupId: null },
        state: { value: 'unknown', confidence: 'unknown' },
      },
    ],
  },
  architecture: { format: 'svg', content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"/>' },
  actions: {},
  panels: {},
  stateSources: {},
  commandTtlSeconds: 30,
});
const ajv = new Ajv2020({ strict: true, strictTypes: false });
addFormats(ajv);
for (const name of ['catalog', 'configuration', 'runtime-state'])
  ajv.addSchema(
    JSON.parse(readFileSync(new URL(`../../schemas/${name}.schema.json`, import.meta.url))),
    `${name}.schema.json`,
  );
const schema = ajv.getSchema('configuration.schema.json');

test('accepted configuration conforms to committed schema, with instance-defined spaces', () => {
  for (const roomId of ['attic', 'garage-2', 'studio', ...LEGACY_V1_ROOM_IDS]) {
    const config = make();
    config.rooms.push({ id: roomId, label: 'Synthetic' });
    config.catalog.devices[0].roomId = roomId;
    if (roomId === 'living') config.rooms.pop();
    assert(schema(assertConfiguration(config)), JSON.stringify(schema.errors));
  }
  const unassigned = make();
  unassigned.catalog.devices[0].roomId = null;
  assert(schema(assertConfiguration(unassigned)));
  for (const mutate of [
    c => {
      c.catalog.devices[0].roomId = 'attic';
    },
    c => {
      c.rooms.push({ id: 'living', label: 'Again' });
    },
    c => {
      c.rooms[0].extra = true;
    },
    c => {
      c.rooms[0].id = '__proto__';
    },
    c => {
      delete c.rooms;
    },
  ]) {
    const config = make();
    mutate(config);
    assert.throws(() => assertConfiguration(config));
  }
});
test('V1 input is migrated in memory to a schema-valid V2 document', () => {
  const v1 = make();
  v1.schemaVersion = 1;
  v1.catalog.schemaVersion = 1;
  delete v1.rooms;
  v1.catalog.devices[0].roomId = 'master-bath';
  const result = assertConfiguration(v1);
  assert.equal(result.schemaVersion, 2);
  assert.deepEqual(result.rooms, [{ id: 'master-bath', label: 'Master bath' }]);
  assert(schema(result), JSON.stringify(schema.errors));
  assert.equal(v1.schemaVersion, 1);
});
test('serialized configuration stays below the HA websocket frame budget', () => {
  const config = make();
  config.catalog.devices = Array.from({ length: 2000 }, (_, i) => ({
    ...config.catalog.devices[0],
    id: `d-${i}`,
    display: { label: 'x'.repeat(240), icon: 'mdi:lightbulb' },
  }));
  config.architecture.content = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><desc>${'x'.repeat(1000000)}</desc></svg>`;
  const variables = Object.fromEntries(Array.from({ length: 7 }, (_, i) => [`v${i}`, 'y'.repeat(1000)]));
  for (let i = 0; i < 200; i++)
    config.actions[`a-${i}`] = {
      domain: 'script',
      service: 'turn_on',
      target: { entity_id: 'script.sample' },
      data: { variables },
    };
  assert.throws(() => assertConfiguration(config), /3 MiB/);
});
test('unknown/extra/missing fields and ephemeral state fail before using imported data', () => {
  for (const mutate of [
    c => {
      delete c.actions;
    },
    c => {
      c.token = 'sample';
    },
    c => {
      c.catalog.devices[0].state.value = 'on';
    },
    c => {
      c.catalog.devices[0].position.x = Infinity;
    },
    c => {
      c.catalog.devices[0].bindings.extra = true;
    },
    c => {
      c.commandTtlSeconds = 0;
    },
    c => {
      c.commandTtlSeconds = 301;
    },
    c => {
      c.catalog.devices.push(c.catalog.devices[0]);
    },
  ]) {
    const config = make();
    mutate(config);
    assert.throws(() => assertConfiguration(config));
  }
});
test('pending references are explicit and disabled or can be rejected for strict review', () => {
  const config = make();
  config.catalog.devices[0].bindings.primaryAction = 'missing-action';
  config.catalog.devices[0].bindings.advancedPopupId = 'missing-panel';
  const result = inspectConfiguration(config);
  assert.equal(result.valid, true);
  assert.equal(result.issues.length, 2);
  assert(result.issues.every(i => i.severity === 'pending'));
  assert.throws(() => assertConfiguration(config, { allowPending: false }));
  assert(schema(config));
});
test('panels only reference actions and RF panels only call explicit scripts', () => {
  const config = make();
  config.actions['sample-action'] = { domain: 'light', service: 'turn_on', target: { entity_id: 'light.sample' } };
  config.panels['sample-panel'] = {
    kind: 'rf-fan',
    title: 'Sample',
    controls: [{ id: 'control', label: 'Sample', actionId: 'sample-action' }],
  };
  assert.throws(() => assertConfiguration(config));
  config.panels['sample-panel'].kind = 'device-controls';
  assertConfiguration(config);
  config.panels['sample-panel'].controls.push(config.panels['sample-panel'].controls[0]);
  assert.throws(() => assertConfiguration(config));
});
test('unsafe objects, getters, sparse/cyclic inputs fail without evaluating getters', () => {
  const config = make();
  let read = 0;
  Object.defineProperty(config, 'actions', {
    enumerable: true,
    get() {
      read++;
      return {};
    },
  });
  assert.throws(() => assertConfiguration(config));
  assert.equal(read, 0);
  const unsafe = make();
  unsafe.actions = JSON.parse('{"constructor":{}}');
  assert.throws(() => assertConfiguration(unsafe));
  const cyclic = make();
  cyclic.catalog.devices.push(cyclic);
  assert.throws(() => assertConfiguration(cyclic));
  const sparse = make();
  sparse.catalog.devices = new Array(1);
  assert.throws(() => assertConfiguration(sparse));
});
test('UTF-8 architecture byte bound is independent of character count', () => {
  const config = make();
  config.architecture.content = 'é'.repeat(524289);
  assert.throws(() => assertConfiguration(config));
});
test('imported array prototypes cannot execute inherited serialization hooks', () => {
  const config = make();
  let reads = 0;
  Object.setPrototypeOf(
    config.catalog.devices,
    Object.assign(Object.create(Array.prototype), {
      toJSON() {
        reads++;
        return [];
      },
    }),
  );
  assert.throws(() => assertConfiguration(config));
  assert.equal(reads, 0);
});
