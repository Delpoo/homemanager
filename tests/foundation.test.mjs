import test from 'node:test';
import assert from 'node:assert/strict';
import { validateFoundation } from '../scripts/validate-foundation.mjs';
import { migrateConfiguration, LEGACY_V1_ROOM_IDS } from '../src/ha/migration.mjs';

// Deliberately synthetic contract records; no dwelling inventory or RF payloads.
const device = () => ({
  id: 'contract-light',
  roomId: 'living',
  kind: 'light',
  position: { x: 0.5, y: 0.5 },
  mobility: 'editable',
  display: { label: 'Contract light', icon: 'mdi:lightbulb' },
  bindings: { entityId: 'light.contract_light', primaryAction: 'light-toggle', advancedPopupId: 'light-controls' },
  state: { value: 'unknown', confidence: 'unknown' },
});
const configuration = () => ({
  schemaVersion: 2,
  rooms: [{ id: 'living', label: 'Contract space' }],
  catalog: { schemaVersion: 2, devices: [device()] },
  architecture: { format: 'svg', content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"></svg>' },
  actions: { 'light-toggle': { domain: 'light', service: 'toggle', target: { entity_id: 'light.contract_light' } } },
  panels: {
    'light-controls': {
      kind: 'device-controls',
      title: 'Contract controls',
      controls: [{ id: 'toggle', label: 'Toggle', actionId: 'light-toggle' }],
    },
  },
  stateSources: { 'contract-light': { entityId: 'light.contract_light', attribute: null, feedback: 'optimistic' } },
  commandTtlSeconds: 30,
});
function expectInvalid(kind, value) {
  assert.equal(validateFoundation(kind, value).valid, false);
}

test('a minimal catalog and configured native panel satisfy V2', () => {
  assert.deepEqual(validateFoundation('catalog', { schemaVersion: 2, devices: [device()] }), {
    valid: true,
    errors: [],
  });
  assert.deepEqual(validateFoundation('configuration', configuration()), { valid: true, errors: [] });
});
test('spaces are instance data: any declared kebab-case space is valid, undeclared ones are not', () => {
  for (const roomId of ['attic', 'garage', 'kids-room-2', 'b1']) {
    const value = configuration();
    value.rooms.push({ id: roomId, label: 'Synthetic space' });
    value.catalog.devices[0].roomId = roomId;
    assert.deepEqual(validateFoundation('configuration', value), { valid: true, errors: [] }, roomId);
  }
  const undeclared = configuration();
  undeclared.catalog.devices[0].roomId = 'attic';
  expectInvalid('configuration', undeclared);
  const duplicate = configuration();
  duplicate.rooms.push({ id: 'living', label: 'Again' });
  expectInvalid('configuration', duplicate);
  for (const roomId of ['Living', 'living room', '__proto__', ''])
    expectInvalid('catalog', { schemaVersion: 2, devices: [{ ...device(), roomId }] });
  const unassigned = configuration();
  unassigned.catalog.devices[0].roomId = null;
  assert.equal(validateFoundation('configuration', unassigned).valid, true);
});
test('V1 documents migrate to schema-valid V2 without losing devices, bindings or labels', () => {
  const v1 = {
    ...configuration(),
    schemaVersion: 1,
    catalog: { schemaVersion: 1, devices: [device(), { ...device(), id: 'second', roomId: 'ac-ledge' }] },
  };
  delete v1.rooms;
  v1.architecture.content =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><rect id="room-kitchen" width="1" height="1"/></svg>';
  assert.deepEqual(validateFoundation('configuration-v1', v1), { valid: true, errors: [] });
  const v2 = migrateConfiguration(v1, { roomLabels: { living: 'Sala' } });
  assert.deepEqual(validateFoundation('configuration', v2), { valid: true, errors: [] });
  assert.deepEqual(v2.rooms, [
    { id: 'living', label: 'Sala' },
    { id: 'kitchen', label: 'Kitchen' },
    { id: 'ac-ledge', label: 'Ac ledge' },
  ]);
  assert.deepEqual(v2.catalog.devices, v1.catalog.devices);
  assert.equal(v1.schemaVersion, 1, 'migration never mutates its input');
  assert.deepEqual(migrateConfiguration(v2), v2, 'V2 is a fixed point');
  assert.equal(LEGACY_V1_ROOM_IDS.length, 12);
});
test('coordinates are normalized against the complete SVG viewBox', () => {
  for (const coordinate of [-0.001, 1.001, Infinity, NaN, '0.5']) {
    expectInvalid('catalog', { schemaVersion: 2, devices: [{ ...device(), position: { x: coordinate, y: 0.5 } }] });
    expectInvalid('catalog', { schemaVersion: 2, devices: [{ ...device(), position: { x: 0.5, y: coordinate } }] });
  }
});
test('unknown schema versions and additional catalog fields fail', () => {
  expectInvalid('catalog', { schemaVersion: 3, devices: [] });
  expectInvalid('catalog', { schemaVersion: 2, devices: [], token: 'not-a-token' });
  expectInvalid('catalog', { schemaVersion: 2, devices: [{ ...device(), raw: 'payload' }] });
});
test('stable device identifiers must be unique', () => {
  expectInvalid('catalog', { schemaVersion: 2, devices: [device(), device()] });
});
test('persistent configuration cannot carry live or acknowledged state', () => {
  for (const confidence of ['confirmed', 'estimated', 'sent', 'error']) {
    const value = configuration();
    value.catalog.devices[0].state = { value: 'on', confidence };
    expectInvalid('configuration', value);
  }
  const value = configuration();
  value.runtime = { states: {} };
  expectInvalid('configuration', value);
});
test('bindings require declared actions and native panels', () => {
  const action = configuration();
  action.catalog.devices[0].bindings.primaryAction = 'missing';
  expectInvalid('configuration', action);
  const panel = configuration();
  panel.catalog.devices[0].bindings.advancedPopupId = 'missing';
  expectInvalid('configuration', panel);
  const control = configuration();
  control.panels['light-controls'].controls[0].actionId = 'missing';
  expectInvalid('configuration', control);
});
test('state sources cannot reference undeclared devices', () => {
  const value = configuration();
  value.stateSources['missing-device'] = value.stateSources['contract-light'];
  expectInvalid('configuration', value);
});
test('action targets are explicit and match their service domain', () => {
  const mismatch = configuration();
  mismatch.actions['light-toggle'].target.entity_id = 'switch.contract_switch';
  expectInvalid('configuration', mismatch);
  const missing = configuration();
  delete missing.actions['light-toggle'].target;
  expectInvalid('configuration', missing);
  const global = configuration();
  global.actions['light-toggle'].target.entity_id = 'light.all';
  expectInvalid('configuration', global);
  const broad = configuration();
  broad.actions['light-toggle'].target = { area_id: 'everywhere' };
  expectInvalid('configuration', broad);
});
test('service allowlist excludes arbitrary HA services and executable configuration', () => {
  const value = configuration();
  value.actions['light-toggle'].service = 'reload';
  expectInvalid('configuration', value);
  const unsafe = configuration();
  unsafe.actions['light-toggle'].javascript = 'disabled';
  expectInvalid('configuration', unsafe);
});
test('RF panels only invoke pre-existing HA scripts', () => {
  const invalid = configuration();
  invalid.panels['light-controls'].kind = 'rf-fan';
  expectInvalid('configuration', invalid);
  const valid = configuration();
  valid.panels['light-controls'].kind = 'rf-fan';
  valid.actions['light-toggle'] = {
    domain: 'script',
    service: 'turn_on',
    target: { entity_id: 'script.contract_action' },
  };
  assert.equal(validateFoundation('configuration', valid).valid, true);
  valid.actions['light-toggle'].data = { rf_code: 'disabled' };
  expectInvalid('configuration', valid);
});
test('duplicate native control IDs fail semantic validation', () => {
  const value = configuration();
  value.panels['light-controls'].controls.push({ ...value.panels['light-controls'].controls[0] });
  expectInvalid('configuration', value);
});
test('architecture limits count UTF-8 bytes as well as characters', () => {
  const value = configuration();
  value.architecture.content = 'é'.repeat(524289);
  expectInvalid('configuration', value);
});
test('runtime state has its own schema and validates dates', () => {
  const state = { value: 'unknown', confidence: 'unknown', observedAt: null, sourceEntityId: null, command: null };
  assert.equal(
    validateFoundation('runtime-state', { schemaVersion: 1, states: { 'contract-light': state } }).valid,
    true,
  );
  expectInvalid('runtime-state', {
    schemaVersion: 1,
    states: { 'contract-light': { ...state, observedAt: 'not-a-date' } },
  });
});
test('command TTL has finite bounded integer configuration', () => {
  for (const ttl of [0, 301, 1.5, Infinity]) {
    const value = configuration();
    value.commandTtlSeconds = ttl;
    expectInvalid('configuration', value);
  }
});
test('action data is bounded in total size and nesting depth', () => {
  const oversized = configuration();
  oversized.actions['light-toggle'].data = Object.fromEntries(
    Array.from({ length: 10 }, (_, index) => [`key${index}`, 'x'.repeat(1000)]),
  );
  expectInvalid('configuration', oversized);
  const deep = configuration();
  deep.actions['light-toggle'].data = Array.from({ length: 11 }).reduce(value => ({ nested: value }), {});
  expectInvalid('configuration', deep);
});
test('runtime commands cannot declare reversed or unbounded lifetimes', () => {
  const command = {
    id: 'command',
    actionId: 'light-toggle',
    issuedAt: '2026-10-28T00:00:00Z',
    expiresAt: '2026-10-28T00:00:30Z',
    baselineLastUpdated: null,
    status: 'sent',
  };
  const value = {
    schemaVersion: 1,
    states: {
      'contract-light': { value: 'unknown', confidence: 'sent', observedAt: null, sourceEntityId: null, command },
    },
  };
  assert.equal(validateFoundation('runtime-state', value).valid, true);
  command.expiresAt = command.issuedAt;
  expectInvalid('runtime-state', value);
  command.expiresAt = '2026-10-28T00:05:01Z';
  expectInvalid('runtime-state', value);
});
