import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import {
  assertConfiguration,
  inspectConfiguration,
  DEVICE_CATEGORIES,
  SYMBOL_ARCHETYPES,
  SYMBOL_SHOW,
} from '../../src/ha/validation.mjs';
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

test('CP4 alert rules and highlighting agree between JS and JSON Schema without changing old plans', () => {
  const cases = JSON.parse(readFileSync(new URL('../fixtures/alert-rules.json', import.meta.url)));
  for (const fields of cases.valid) {
    const configuration = make();
    Object.assign(configuration.catalog.devices[0].display, fields);
    const before = structuredClone(configuration);
    assert.equal(schema(configuration), true, JSON.stringify(fields));
    assert.deepEqual(assertConfiguration(configuration), before);
    assert.deepEqual(configuration, before);
  }
  for (const fields of cases.invalid) {
    const configuration = make();
    Object.assign(configuration.catalog.devices[0].display, fields);
    assert.equal(schema(configuration), false, JSON.stringify(fields));
    assert.throws(() => assertConfiguration(configuration), undefined, JSON.stringify(fields));
  }
  for (const field of ['below', 'above', 'forMinutes'])
    for (const invalid of [NaN, Infinity, -Infinity]) {
      const configuration = make();
      configuration.catalog.devices[0].display.alerts = [
        { reading: 'sensor.test', level: 'warning', [field]: invalid },
      ];
      assert.equal(schema(configuration), false);
      assert.throws(() => assertConfiguration(configuration));
    }
});

test('0.8 registry and additional readings round-trip; entity-only 0.7 documents remain unchanged', () => {
  const legacy = make(),
    before = structuredClone(legacy);
  assert.deepEqual(assertConfiguration(legacy), before);
  assert(schema(legacy));
  for (const readings of [
    [],
    ['sensor.sample_temperature'],
    ['sensor.sample_temperature', 'sensor.sample_humidity', 'sensor.sample_power'],
  ]) {
    const value = make();
    Object.assign(value.catalog.devices[0].bindings, { deviceId: '0011aaBB-device_1', readings });
    assert.deepEqual(assertConfiguration(value), value);
    assert(schema(value), JSON.stringify(schema.errors));
  }
});
test('0.8 JS and schema reject malformed registry IDs and unsafe additional-reading lists', () => {
  const invalid = [
    ...['', null, false, 1, {}, [], 'device.id', 'device/id', ' bad', 'bad\n', 'constructor', 'x'.repeat(241)].map(
      value => ['deviceId', value],
    ),
    ...[
      null,
      false,
      'sensor.a',
      {},
      [null],
      ['sensor.all'],
      ['sensor.a\n'],
      ['sensor.a', 'sensor.a'],
      ['sensor.a', 'sensor.b', 'sensor.c', 'sensor.d'],
    ].map(value => ['readings', value]),
  ];
  for (const [field, value] of invalid) {
    const input = make();
    input.catalog.devices[0].bindings.deviceId = 'registry-device';
    input.catalog.devices[0].bindings[field] = value;
    assert.throws(() => assertConfiguration(input), undefined, `${field}: ${JSON.stringify(value)}`);
    assert.equal(schema(input), false, `${field}: ${JSON.stringify(value)}`);
  }
  const missing = make();
  missing.catalog.devices[0].bindings.readings = ['sensor.sample'];
  assert.throws(() => assertConfiguration(missing));
  assert.equal(schema(missing), false);
  const duplicatePrincipal = make();
  Object.assign(duplicatePrincipal.catalog.devices[0].bindings, {
    deviceId: 'registry-device',
    readings: ['light.sample'],
  });
  assert.throws(() => assertConfiguration(duplicatePrincipal));
});

test('0.7 presentation fields are optional, preserve 0.6 documents and round-trip without defaults', () => {
  const legacy = make();
  const input = structuredClone(legacy);
  assert.deepEqual(assertConfiguration(legacy), input);
  assert.deepEqual(legacy, input);
  assert(schema(legacy), JSON.stringify(schema.errors));
  for (const icon of ['mdi:sofa', 'mdi:flower-tulip-outline', `mdi:${'a'.repeat(236)}`]) {
    const configuration = make();
    configuration.rooms[0].icon = icon;
    assert.deepEqual(assertConfiguration(configuration), configuration);
    assert(schema(configuration), JSON.stringify(schema.errors));
  }
  for (const archetype of SYMBOL_ARCHETYPES) {
    for (const show of SYMBOL_SHOW) {
      const configuration = make();
      Object.assign(configuration.catalog.devices[0].display, { archetype, show });
      assert.deepEqual(assertConfiguration(configuration), configuration);
      assert(schema(configuration), JSON.stringify(schema.errors));
    }
    const configuration = make();
    configuration.catalog.devices[0].display.archetype = archetype;
    assert(schema(assertConfiguration(configuration)), JSON.stringify(schema.errors));
  }
  for (const show of SYMBOL_SHOW) {
    const configuration = make();
    configuration.catalog.devices[0].display.show = show;
    assert(schema(assertConfiguration(configuration)), JSON.stringify(schema.errors));
  }
  const catalogSchema = JSON.parse(readFileSync(new URL('../../schemas/catalog.schema.json', import.meta.url)));
  assert.deepEqual(catalogSchema.$defs.device.properties.display.properties.archetype.enum, SYMBOL_ARCHETYPES);
  assert.deepEqual(catalogSchema.$defs.device.properties.display.properties.show.enum, SYMBOL_SHOW);
  assert.deepEqual(catalogSchema.$defs.device.properties.display.properties.category.enum, DEVICE_CATEGORIES);
  for (const room of [
    { shape: { x: 0, y: 0, width: 1, height: 1 } },
    { shape: { x: 0.25, y: 0.5, width: 0.5, height: 0.25 }, shapeSource: 'svg' },
    { shape: { x: 0.1, y: 0.1, width: 0.2, height: 0.3 }, shapeSource: 'app' },
  ]) {
    const configuration = make();
    Object.assign(configuration.rooms[0], room);
    assert.deepEqual(assertConfiguration(configuration), configuration);
    assert(schema(configuration), JSON.stringify(schema.errors));
  }
  for (const category of DEVICE_CATEGORIES) {
    const configuration = make();
    Object.assign(configuration.catalog.devices[0].display, { category, archetype: 'actuator', show: 'icon' });
    assert.deepEqual(assertConfiguration(configuration), configuration);
    assert(schema(configuration), JSON.stringify(schema.errors));
  }
});

test('JS and JSON Schema reject the same unsafe 0.7 fields, types and unknown presentation properties', () => {
  const invalidIcons = [
    null,
    false,
    1,
    [],
    {},
    '',
    'mdi:',
    'mdi:Bad',
    'lightbulb',
    'mdi:sofa ',
    'mdi:sofa\n',
    'mdi:sofa\r\n',
    'mdi:sofa\u2028',
    'mdi:sofa--outline',
    'mdi:sofa-',
    'mdi:<svg>',
    'mdi:sofa" onload="x',
    'https://example.test/icon.svg',
    `mdi:${'a'.repeat(237)}`,
  ];
  for (const icon of invalidIcons) {
    const configuration = make();
    configuration.rooms[0].icon = icon;
    assert.equal(inspectConfiguration(configuration).valid, false, JSON.stringify(icon));
    assert.equal(schema(configuration), false, JSON.stringify(icon));
  }
  for (const [field, invalid] of [
    ['archetype', [null, false, 1, [], {}, '', 'Actuator', 'actuador', 'dimmer', 'actuator\n']],
    ['show', [null, false, 1, [], {}, '', 'Icon', 'all', 'value\n']],
    ['category', [null, false, 1, [], {}, '', 'Switch', 'actuator', 'planta', 'plant\n']],
  ]) {
    for (const value of invalid) {
      const configuration = make();
      configuration.catalog.devices[0].display[field] = value;
      assert.equal(inspectConfiguration(configuration).valid, false, JSON.stringify([field, value]));
      assert.equal(schema(configuration), false, JSON.stringify([field, value]));
    }
  }
  for (const mutate of [
    c => {
      c.rooms[0].archetype = 'sensor';
    },
    c => {
      c.catalog.devices[0].display.iconUrl = 'https://example.test/icon.svg';
    },
    c => {
      c.catalog.devices[0].bindings.alerts = {};
    },
  ]) {
    const configuration = make();
    mutate(configuration);
    assert.equal(inspectConfiguration(configuration).valid, false);
    assert.equal(schema(configuration), false);
  }
});

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

test('quick actions and the RF remote are optional V2 bindings, validated and bounded', () => {
  const configuration = make();
  configuration.actions['sample-on'] = {
    domain: 'light',
    service: 'turn_on',
    target: { entity_id: 'light.sample' },
    data: {},
  };
  configuration.catalog.devices[0].bindings.quickActions = [
    { id: 'quick-1', label: 'Encender', actionId: 'sample-on' },
    { id: 'quick-2', label: 'Ausente', actionId: 'missing' },
  ];
  configuration.catalog.devices[0].bindings.remoteId = 'techo';
  const result = inspectConfiguration(configuration, { allowPending: true });
  assert.equal(result.valid, true);
  assert.ok(schema(configuration), JSON.stringify(schema.errors));
  // An absent action is a pending reference, like a primary action.
  assert.deepEqual(
    result.issues.map(issue => [issue.path, issue.severity]),
    [['catalog.sample-light.bindings.quickActions.quick-2', 'pending']],
  );
  // Plans without the new fields stay valid.
  assert.equal(inspectConfiguration(make()).valid, true);
  const quick = id => ({ id, label: 'x', actionId: 'sample-on' });
  for (const bindings of [
    { quickActions: ['a', 'b', 'c', 'd', 'e'].map(quick) },
    { quickActions: [quick('a'), quick('a')] },
    { quickActions: [{ ...quick('a'), label: 'x'.repeat(81) }] },
    { quickActions: [{ ...quick('a'), script: 'x' }] },
    { remoteId: 'Not An Id' },
  ]) {
    const bad = make();
    Object.assign(bad.catalog.devices[0].bindings, bindings);
    assert.equal(inspectConfiguration(bad).valid, false, JSON.stringify(bindings));
    // JSON Schema cannot express unique ids; only the semantic validator rejects those.
    const duplicates = bindings.quickActions?.[1]?.id === 'a';
    assert.equal(schema(bad), duplicates, JSON.stringify(bindings));
  }
});

test('device controls, the tap, pinned controls and the symbol size are optional V2 fields, validated and bounded', () => {
  const configuration = make();
  configuration.actions['sample-on'] = { domain: 'light', service: 'turn_on', target: { entity_id: 'light.sample' } };
  configuration.actions['sample-off'] = { domain: 'light', service: 'turn_off', target: { entity_id: 'light.sample' } };
  const device = configuration.catalog.devices[0];
  device.bindings.controls = [
    {
      id: 'power',
      type: 'cycle',
      label: 'Encender / Apagar',
      steps: [
        { actionId: 'sample-on', label: 'Encender', icon: 'mdi:lightbulb' },
        { actionId: 'missing', label: 'Apagar' },
      ],
    },
    { id: 'level', type: 'slider', label: 'Nivel', steps: [], entityId: 'light.sample', orientation: 'vertical' },
    { id: 'speed', type: 'slider', label: 'Velocidad', steps: [{ actionId: 'sample-on' }, { actionId: 'sample-off' }] },
    { id: 'mode', type: 'updown', label: 'Subir', steps: [{ actionId: 'sample-on' }, { actionId: 'sample-off' }] },
  ];
  device.bindings.tap = 'power';
  device.display.size = 'l';
  device.display.pinned = ['level', 'mode'];
  const result = inspectConfiguration(configuration, { allowPending: true });
  assert.equal(result.valid, true, JSON.stringify(result.issues));
  assert.ok(schema(configuration), JSON.stringify(schema.errors));
  // An absent step action is pending, like any reference.
  assert.deepEqual(
    result.issues.map(issue => [issue.path, issue.severity]),
    [['catalog.sample-light.bindings.controls.power.1', 'pending']],
  );
  // tap: null opens the panel.
  const panel = make();
  panel.catalog.devices[0].bindings.tap = null;
  assert.equal(inspectConfiguration(panel).valid, true);
  const step = { actionId: 'sample-on' };
  const control = (type, steps, extra = {}) => ({ id: 'c', type, label: 'C', steps, ...extra });
  // [bindings, display, rejected by the schema too]
  for (const [bindings, display, bySchema] of [
    [{ controls: [control('button', [step, step])] }, {}, false],
    [{ controls: [control('cycle', [step])] }, {}, false],
    [{ controls: [control('cycle', [step, step, step, step, step])] }, {}, false],
    [{ controls: [control('select', Array(9).fill(step))] }, {}, false],
    [{ controls: [control('slider', [step])] }, {}, false],
    [{ controls: [control('slider', Array(13).fill(step))] }, {}, true],
    [{ controls: [control('dimmer', [])] }, {}, true],
    [{ controls: [control('button', [step], { entityId: 'light.sample' })] }, {}, false],
    [{ controls: [control('slider', [step, step], { entityId: 'light.sample' })] }, {}, false],
    [{ controls: [control('cycle', [step, step], { orientation: 'vertical' })] }, {}, false],
    [{ controls: [control('button', [{ ...step, code: '1010' }])] }, {}, true],
    [{ controls: [control('button', [step]), control('button', [step])] }, {}, false],
    [
      { controls: Array.from({ length: 9 }, (_, index) => ({ ...control('button', [step]), id: `c${index}` })) },
      {},
      true,
    ],
    [{ controls: [control('slider', [])], tap: 'c' }, {}, false],
    [{ tap: 'missing' }, {}, false],
    [{ controls: [control('button', [step])] }, { pinned: ['missing'] }, false],
    [{ controls: [control('button', [step])] }, { pinned: ['c', 'c'] }, true],
    [{}, { size: 'xl' }, true],
  ]) {
    const bad = make();
    Object.assign(bad.catalog.devices[0].bindings, bindings);
    Object.assign(bad.catalog.devices[0].display, display);
    assert.equal(inspectConfiguration(bad).valid, false, JSON.stringify([bindings, display]));
    // Counts per type and references between fields are semantic: only some cases are schema errors.
    if (bySchema) assert.equal(schema(bad), false, JSON.stringify([bindings, display]));
  }
});

test('a space shape is a rectangle with an area inside the plan, and its source needs it', () => {
  const invalid = [
    { shape: null },
    { shape: { x: 0, y: 0, width: 0, height: 0.5 } },
    { shape: { x: 0.6, y: 0, width: 0.5, height: 0.5 } },
    { shape: { x: 0, y: 0.9, width: 0.5, height: 0.2 } },
    { shape: { x: -0.1, y: 0, width: 0.5, height: 0.5 } },
    { shape: { x: 0, y: 0, width: 0.5, height: 0.5, kind: 'rect' } },
    { shape: { x: 0, y: 0, width: '0.5', height: 0.5 } },
    { shape: { x: 0, y: 0, width: 0.5 } },
    { shapeSource: 'svg' },
    { shape: { x: 0, y: 0, width: 0.5, height: 0.5 }, shapeSource: 'user' },
  ];
  for (const room of invalid) {
    const configuration = make();
    Object.assign(configuration.rooms[0], room);
    assert.equal(inspectConfiguration(configuration).valid, false, JSON.stringify(room));
  }
});

test('a space framing and room view navigation are optional, closed and well formed', () => {
  const valid = [
    { frame: 'tight' },
    { frame: 'wide', nav: { skip: true } },
    { nav: { hidden: ['kitchen', 'office'] } },
  ];
  for (const room of valid) {
    const configuration = make();
    Object.assign(configuration.rooms[0], room);
    assert.deepEqual(assertConfiguration(configuration), configuration);
    assert(schema(configuration), JSON.stringify(schema.errors));
  }
  const invalid = [
    { frame: 'huge' },
    { frame: null },
    { nav: [] },
    { nav: { skip: 1 } },
    { nav: { hidden: 'kitchen' } },
    { nav: { hidden: ['kitchen', 'kitchen'] } },
    { nav: { hidden: ['Bad Id'] } },
    { nav: { other: true } },
  ];
  for (const room of invalid) {
    const configuration = make();
    Object.assign(configuration.rooms[0], room);
    assert.equal(inspectConfiguration(configuration).valid, false, JSON.stringify(room));
  }
});
