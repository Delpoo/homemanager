// Messages are asserted in Spanish, the language of the first installation.
globalThis.__homemanagerLanguage = 'es';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  moveRoom,
  newDeviceId,
  pendingReferences,
  persistentConfiguration,
  remapPositions,
  removeDevice,
  removeRoom,
  stableKey,
  summarizeImport,
  upsertAction,
  upsertDevice,
  upsertPanel,
  upsertRoom,
  upsertStateSource,
} from '../../.work/editor/model.js';

const device = (id = 'test-light', overrides = {}) => ({
  id,
  roomId: 'living',
  kind: 'light',
  position: { x: 0.2, y: 0.4 },
  mobility: 'editable',
  display: { label: 'Test light', icon: 'mdi:lightbulb' },
  bindings: { entityId: 'light.test_light', primaryAction: 'test-toggle', advancedPopupId: 'test-panel' },
  state: { value: 'unknown', confidence: 'unknown' },
  ...overrides,
});
function configuration() {
  return {
    schemaVersion: 2,
    rooms: [
      { id: 'living', label: 'Space A' },
      { id: 'kitchen', label: 'Space B' },
    ],
    catalog: { schemaVersion: 2, devices: [device()] },
    architecture: { format: 'svg', content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"></svg>' },
    actions: { 'test-toggle': { domain: 'light', service: 'toggle', target: { entity_id: 'light.test_light' } } },
    panels: {
      'test-panel': {
        kind: 'device-controls',
        title: 'Test panel',
        controls: [{ id: 'toggle', label: 'Toggle', actionId: 'test-toggle' }],
      },
    },
    stateSources: { 'test-light': { entityId: 'light.test_light', attribute: null, feedback: 'optimistic' } },
  };
}

test('editing preserves registry bindings and clones additional readings without mutating input', () => {
  const input = device();
  input.bindings.deviceId = 'registry-device';
  input.bindings.readings = ['sensor.extra'];
  const next = upsertDevice(configuration(), input, { previousId: input.id });
  assert.equal(next.catalog.devices[0].bindings.deviceId, 'registry-device');
  assert.deepEqual(next.catalog.devices[0].bindings.readings, ['sensor.extra']);
  input.bindings.readings.push('sensor.later');
  assert.deepEqual(next.catalog.devices[0].bindings.readings, ['sensor.extra']);
});

test('editing preserves optional 0.7 presentation and room icons', () => {
  const original = configuration();
  original.rooms[0].icon = 'mdi:sofa';
  original.catalog.devices[0].display = {
    ...original.catalog.devices[0].display,
    archetype: 'equipment',
    show: 'both',
  };
  const next = upsertDevice(original, original.catalog.devices[0], { previousId: 'test-light' });
  assert.equal(next.catalog.devices[0].display.archetype, 'equipment');
  assert.equal(next.catalog.devices[0].display.show, 'both');
  const renamed = upsertRoom(next, { ...next.rooms[0], label: 'Renamed' }, { previousId: 'living' });
  assert.equal(renamed.rooms[0].icon, 'mdi:sofa');
});

test('device edits keep IDs, HA bindings and shared logical maps when room changes', () => {
  const original = configuration(),
    before = structuredClone(original),
    edited = device('test-light', { roomId: 'kitchen', position: { x: 0.7, y: 0.8 } });
  const next = upsertDevice(original, edited, { previousId: 'test-light' });
  assert.equal(next.catalog.devices[0].roomId, 'kitchen');
  assert.deepEqual(next.catalog.devices[0].bindings, before.catalog.devices[0].bindings);
  assert.deepEqual(next.actions, before.actions);
  assert.deepEqual(next.panels, before.panels);
  assert.deepEqual(next.stateSources, before.stateSources);
  assert.deepEqual(original, before);
});
test('immutable existing ID and duplicate new ID are rejected', () => {
  assert.throws(() => upsertDevice(configuration(), device('renamed'), { previousId: 'test-light' }), /inmutable/);
  assert.throws(() => upsertDevice(configuration(), device()), /ya existe/);
});
test('fixed devices can change room while position correction still requires explicit authorization', () => {
  const config = configuration();
  config.catalog.devices[0].mobility = 'fixed';
  const reassigned = upsertDevice(
    config,
    { ...config.catalog.devices[0], roomId: 'kitchen' },
    { previousId: 'test-light' },
  );
  assert.equal(reassigned.catalog.devices[0].roomId, 'kitchen');
  assert.deepEqual(reassigned.catalog.devices[0].position, config.catalog.devices[0].position);
  const moved = device('test-light', { position: { x: 0.7, y: 0.8 }, mobility: 'portable' });
  assert.throws(() => upsertDevice(config, moved, { previousId: 'test-light' }), /corregir ubicación/);
  assert.equal(
    upsertDevice(config, moved, { previousId: 'test-light', allowFixedPosition: true }).catalog.devices[0].position.x,
    0.7,
  );
});
test('position/name/icon/reference validation prevents unsafe or incomplete edits', () => {
  for (const x of [-0.01, 1.01, NaN, Infinity])
    assert.throws(() => upsertDevice(configuration(), device('new-light', { position: { x, y: 0.5 } })), /coordenadas/);
  assert.throws(
    () => upsertDevice(configuration(), device('new-light', { display: { label: ' ', icon: 'mdi:lightbulb' } })),
    /Nombre/,
  );
  assert.throws(
    () => upsertDevice(configuration(), device('new-light', { display: { label: 'Test', icon: '<svg>' } })),
    /mdi/,
  );
  assert.throws(() => stableKey('__proto__'), /kebab/);
});
test('new device IDs are unique, stable, normalized and never unsafe object keys', () => {
  const config = configuration();
  config.catalog.devices.push(device('luz-cocina'), device('luz-cocina-2'));
  assert.equal(newDeviceId('Lúz / cocina', config), 'luz-cocina-3');
  assert.equal(newDeviceId('constructor', config), 'device');
  assert.equal(newDeviceId('💡', config), 'device');
});
test('persistent snapshots reset readings and commands without mutating live device state', () => {
  const config = configuration();
  config.catalog.devices[0].state = { value: 'on', confidence: 'confirmed' };
  assert.deepEqual(persistentConfiguration(config).catalog.devices[0].state, {
    value: 'unknown',
    confidence: 'unknown',
  });
  assert.equal(config.catalog.devices[0].state.value, 'on');
});
test('delete removes icon/stateSource only; reusable actions and panels remain', () => {
  const before = configuration(),
    next = removeDevice(before, 'test-light');
  assert.deepEqual(next.catalog.devices, []);
  assert.deepEqual(next.stateSources, {});
  assert.deepEqual(next.actions, before.actions);
  assert.deepEqual(next.panels, before.panels);
  assert.equal(before.catalog.devices.length, 1);
  assert.throws(() => removeDevice(next, 'test-light'), /ya no existe/);
});
test('actions accept explicit HA service targets and structured data without executing anything', () => {
  const config = configuration(),
    action = {
      domain: 'fan',
      service: 'set_percentage',
      target: { entity_id: ['fan.test_a', 'fan.test_b'] },
      data: { percentage: 35 },
    };
  const next = upsertAction(config, 'set-test-speed', action);
  assert.deepEqual(next.actions['set-test-speed'], action);
  action.data.percentage = 80;
  assert.equal(next.actions['set-test-speed'].data.percentage, 35);
});
test('action targets reject broadcast, duplicate, mismatched and indirect destinations', () => {
  const action = { domain: 'light', service: 'toggle', target: { entity_id: 'light.test' } };
  for (const target of [
    { entity_id: 'light.all' },
    { entity_id: ['light.test', 'light.test'] },
    { entity_id: 'switch.test' },
    { entity_id: [] },
    { entity_id: 'light.test', area_id: 'test' },
  ])
    assert.throws(() => upsertAction(configuration(), 'test-action', { ...action, target }));
  assert.throws(
    () => upsertAction(configuration(), 'test-action', { ...action, domain: 'mqtt', service: 'publish' }),
    /permitido/,
  );
});
test('action data rejects raw radio payloads, target overrides, templates and non-JSON values', () => {
  const action = { domain: 'script', service: 'turn_on', target: { entity_id: 'script.test' } };
  for (const data of [
    { raw: 'abc' },
    { rf_code: 123 },
    { entity_id: 'light.other' },
    { variables: { code: 123 } },
    { variables: { x: '{{ states() }}' } },
    { x: 'javascript:alert(1)' },
    { x: 'eval(1)' },
    { x: new Date() },
    { x: new Map() },
    { x: undefined },
    { x: Infinity },
    JSON.parse('{"__proto__":{}}'),
  ])
    assert.throws(() => upsertAction(configuration(), 'test-script', { ...action, data }));
});
test('action data enforces bounded byte size, string length, lists and nesting', () => {
  const action = { domain: 'script', service: 'turn_on', target: { entity_id: 'script.test' } };
  const nested = {};
  let pointer = nested;
  for (let i = 0; i < 12; i++) pointer = pointer.next = {};
  for (const data of [
    { list: Array(101).fill(0) },
    { text: 'a'.repeat(1025) },
    nested,
    { list: Array(10).fill('é'.repeat(500)) },
  ])
    assert.throws(() => upsertAction(configuration(), 'test-script', { ...action, data }));
});
test('state sources require a device, declared entity and safe attribute; removal is explicit', () => {
  const next = upsertStateSource(configuration(), 'test-light', {
    entityId: 'sensor.test_feedback',
    attribute: 'power',
    feedback: 'measured',
  });
  assert.equal(next.stateSources['test-light'].feedback, 'measured');
  assert.deepEqual(upsertStateSource(next, 'test-light', null).stateSources, {});
  assert.throws(
    () => upsertStateSource(next, 'missing', { entityId: 'sensor.test', attribute: null, feedback: 'optimistic' }),
    /existente/,
  );
  assert.throws(
    () =>
      upsertStateSource(next, 'test-light', { entityId: 'sensor.test', attribute: '__proto__', feedback: 'measured' }),
    /atributo/,
  );
});
test('RF native panels allow script.turn_on only and preserve reusable action references', () => {
  const config = upsertAction(configuration(), 'test-script', {
    domain: 'script',
    service: 'turn_on',
    target: { entity_id: 'script.test' },
  });
  const panel = {
    kind: 'rf-fan',
    title: 'Test radio controls',
    controls: [{ id: 'run', label: 'Run HA script', actionId: 'test-script' }],
  };
  assert.deepEqual(upsertPanel(config, 'test-rf', panel).panels['test-rf'], panel);
  assert.throws(
    () =>
      upsertPanel(config, 'test-rf', { ...panel, controls: [{ id: 'run', label: 'Run', actionId: 'test-toggle' }] }),
    /script.turn_on/,
  );
});
test('panel control IDs are unique and absent action refs remain explicit pending drafts', () => {
  const panel = {
    kind: 'device-controls',
    title: 'Test panel',
    controls: [{ id: 'run', label: 'Run', actionId: 'missing-action' }],
  };
  const next = upsertPanel(configuration(), 'new-panel', panel);
  assert.equal(next.panels['new-panel'].controls[0].actionId, 'missing-action');
  assert.throws(
    () => upsertPanel(configuration(), 'new-panel', { ...panel, controls: [...panel.controls, ...panel.controls] }),
    /únicos/,
  );
});
test('pending references include missing device bindings, panel actions and feedback entities', () => {
  const config = configuration();
  config.catalog.devices[0].bindings.primaryAction = 'missing-action';
  config.catalog.devices[0].bindings.advancedPopupId = 'missing-panel';
  config.panels['test-panel'].controls[0].actionId = 'pending-control';
  const pending = pendingReferences(config, {});
  assert.equal(pending.length, 6);
  assert(pending.some(text => text.includes('missing-action')));
  assert(pending.some(text => text.includes('pending-control')));
  assert(pending.some(text => text.includes('destino light.test_light pendiente')));
  assert.equal(pendingReferences(configuration(), { 'light.test_light': {} }).length, 0);
});
test('import summary distinguishes new/deleted/changed icons and excludes live state differences', () => {
  const before = configuration(),
    after = structuredClone(before);
  after.catalog.devices[0].state = { value: 'on', confidence: 'confirmed' };
  assert.deepEqual(summarizeImport(before, after).changed, []);
  after.catalog.devices[0].display.label = 'Updated';
  after.catalog.devices.push(device('new-device'));
  after.architecture.content += ' ';
  const summary = summarizeImport(before, after);
  assert.deepEqual(summary.added, ['new-device']);
  assert.deepEqual(summary.changed, ['test-light']);
  assert.equal(summary.architectureChanged, true);
  assert.deepEqual(summarizeImport(after, before).removed, ['new-device']);
});
test('a space keeps its framing and arrows on rename, and they change or go only when given', () => {
  let config = upsertRoom(configuration(), {
    id: 'attic',
    label: 'Attic',
    frame: 'wide',
    nav: { skip: true, hidden: ['living', 'attic'] },
  });
  // A space never hides an arrow to itself.
  assert.deepEqual(config.rooms.at(-1), {
    id: 'attic',
    label: 'Attic',
    frame: 'wide',
    nav: { skip: true, hidden: ['living'] },
  });
  config = upsertRoom(config, { id: 'attic', label: 'Loft' }, { previousId: 'attic' });
  assert.equal(config.rooms.at(-1).frame, 'wide');
  config = upsertRoom(config, { id: 'attic', label: 'Loft', frame: 'normal', nav: {} }, { previousId: 'attic' });
  assert.deepEqual(config.rooms.at(-1), { id: 'attic', label: 'Loft' });
  config = upsertRoom(
    config,
    { id: 'attic', label: 'Loft', shape: { x: 0, y: 0, width: 0.5, height: 0.5 }, shapeSource: 'app' },
    { previousId: 'attic' },
  );
  config = upsertRoom(
    config,
    { id: 'attic', label: 'Loft', shape: undefined, shapeSource: undefined },
    { previousId: 'attic' },
  );
  assert.deepEqual(config.rooms.at(-1), { id: 'attic', label: 'Loft' });
});
test('renaming a space keeps its own shape and where it came from (D22)', () => {
  const shape = { x: 0.1, y: 0.2, width: 0.3, height: 0.4 };
  let config = upsertRoom(configuration(), { id: 'attic', label: 'Attic', shape, shapeSource: 'app' });
  config = upsertRoom(config, { id: 'attic', label: 'Loft', icon: 'mdi:sofa' }, { previousId: 'attic' });
  assert.deepEqual(config.rooms.at(-1), { id: 'attic', label: 'Loft', icon: 'mdi:sofa', shape, shapeSource: 'app' });
  assert.notEqual(config.rooms.at(-1).shape, shape);
});
test('spaces are created, renamed, reordered and removed without touching devices or bindings', () => {
  let config = upsertRoom(configuration(), { id: 'attic', label: '  Attic  ' });
  assert.deepEqual(config.rooms.at(-1), { id: 'attic', label: 'Attic' });
  assert.throws(() => upsertRoom(config, { id: 'attic', label: 'Again' }), /ya existe/);
  assert.throws(() => upsertRoom(config, { id: 'Attic Room', label: 'Bad' }), /kebab/);
  assert.throws(() => upsertRoom(config, { id: 'loft', label: 'Renamed' }, { previousId: 'attic' }), /inmutable/);
  config = upsertRoom(config, { id: 'attic', label: 'Loft' }, { previousId: 'attic' });
  assert.equal(config.rooms.at(-1).label, 'Loft');
  config = moveRoom(config, 'attic', -1);
  assert.deepEqual(
    config.rooms.map(r => r.id),
    ['living', 'attic', 'kitchen'],
  );
  assert.deepEqual(
    moveRoom(config, 'living', -1).rooms.map(r => r.id),
    ['living', 'attic', 'kitchen'],
  );
  const removed = removeRoom(config, 'living');
  assert.deepEqual(removed.unassigned, ['test-light']);
  assert.equal(removed.configuration.catalog.devices[0].roomId, null);
  assert.deepEqual(removed.configuration.catalog.devices[0].bindings, configuration().catalog.devices[0].bindings);
  assert.equal(config.catalog.devices[0].roomId, 'living', 'inputs are never mutated');
});
test('devices must reference a declared space or stay explicitly unassigned', () => {
  assert.throws(() => upsertDevice(configuration(), device('new-light', { roomId: 'attic' })), /Espacio/);
  assert.equal(upsertDevice(configuration(), device('new-light', { roomId: null })).catalog.devices[1].roomId, null);
});
test('V1 drafts are upgraded in memory with their spaces derived from use', () => {
  const v1 = { ...configuration(), schemaVersion: 1, catalog: { schemaVersion: 1, devices: [device()] } };
  delete v1.rooms;
  const next = persistentConfiguration(v1);
  assert.equal(next.schemaVersion, 2);
  assert.deepEqual(next.rooms, [{ id: 'living', label: 'Living' }]);
  assert.equal(v1.schemaVersion, 1);
});
test('replacing the plan remaps positions to the same drawing point or keeps proportions', () => {
  const config = configuration();
  config.catalog.devices[0].position = { x: 0.5, y: 0.5 };
  const from = { x: 0, y: 0, width: 100, height: 100 };
  // Same drawing, extended canvas: the device must stay on SVG point (50,50).
  const drawing = remapPositions(config, from, { x: -100, y: 0, width: 200, height: 100 }, 'drawing');
  assert.deepEqual(drawing.configuration.catalog.devices[0].position, { x: 0.75, y: 0.5 });
  assert.deepEqual(drawing.clamped, []);
  assert.deepEqual(
    remapPositions(config, from, { x: 0, y: 0, width: 400, height: 400 }, 'relative').configuration.catalog.devices[0]
      .position,
    { x: 0.5, y: 0.5 },
  );
  // Cropping that leaves the device outside: clamped to the edge and reported, never dropped.
  const cropped = remapPositions(config, from, { x: 60, y: 0, width: 40, height: 100 }, 'drawing');
  assert.deepEqual(cropped.configuration.catalog.devices[0].position, { x: 0, y: 0.5 });
  assert.deepEqual(cropped.clamped, ['test-light']);
  assert.throws(() => remapPositions(config, from, { x: 0, y: 0, width: 0, height: 1 }, 'drawing'), /viewBox/);
  assert.deepEqual(config.catalog.devices[0].position, { x: 0.5, y: 0.5 });
});
test('import summary reports added and removed spaces', () => {
  const before = configuration(),
    after = upsertRoom(removeRoom(before, 'kitchen').configuration, { id: 'garage', label: 'Garage' });
  const summary = summarizeImport(before, after);
  assert.deepEqual(summary.roomsAdded, ['garage']);
  assert.deepEqual(summary.roomsRemoved, ['kitchen']);
});
