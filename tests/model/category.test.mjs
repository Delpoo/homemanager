import test from 'node:test';
import assert from 'node:assert/strict';
import { CATEGORIES, categoryOf, sectionsOf } from '../../.work/model/category.js';
import { archetypeOf } from '../../.work/model/archetype.js';
import { symbolSpec } from '../../.work/model/symbol-spec.js';

const device = (kind, entityId, display = {}) => ({
  id: 'd',
  roomId: null,
  kind,
  display: { label: 'Dispositivo', icon: 'mdi:shape', ...display },
  bindings: { entityId },
});
const hass = states => ({ states });

test('without a stored category, it is suggested from the archetype and the entity, never written', () => {
  const states = {
    'light.lamp': { state: 'on', attributes: {} },
    'binary_sensor.leak': { state: 'off', attributes: { device_class: 'moisture' } },
    'binary_sensor.hall': { state: 'off', attributes: { device_class: 'motion' } },
    'binary_sensor.door': { state: 'off', attributes: { device_class: 'door' } },
    'sensor.temperature': { state: '21.5', attributes: { device_class: 'temperature', unit_of_measurement: '°C' } },
    'sensor.fertility': { state: '420', attributes: { device_class: 'conductivity', unit_of_measurement: 'µS/cm' } },
    'climate.air': { state: 'cool', attributes: {} },
  };
  const cases = [
    [device('light', 'light.lamp'), 'switch'],
    [device('sensor', 'binary_sensor.leak'), 'alert'],
    [device('sensor', 'binary_sensor.hall'), 'presence'],
    [device('sensor', 'binary_sensor.door'), 'presence'],
    [device('sensor', 'sensor.temperature'), 'meter'],
    [device('sensor', 'sensor.fertility'), 'plant'],
    [device('plant', 'sensor.temperature'), 'plant'],
    [device('ac', 'climate.air'), 'equipment'],
    [device('infra', null), 'infrastructure'],
    [{ ...device('fan', null), bindings: { entityId: null, remoteId: 'ceiling' } }, 'remote'],
  ];
  for (const [item, expected] of cases) {
    const before = structuredClone(item);
    assert.equal(categoryOf(item, hass(states)), expected, item.bindings.entityId ?? item.kind);
    assert.deepEqual(item, before);
  }
});

test('a chosen category wins over the stored archetype and decides the symbol', () => {
  const states = { 'sensor.temperature': { state: '21.5', attributes: { unit_of_measurement: '°C' } } };
  const chosen = device('sensor', 'sensor.temperature', { archetype: 'meter', category: 'alert' });
  assert.equal(categoryOf(chosen, hass(states)), 'alert');
  assert.equal(archetypeOf(chosen, hass(states)), 'sensor');
  // An old plan with only an archetype keeps it, and its category follows it.
  const old = device('light', 'sensor.temperature', { archetype: 'infrastructure' });
  assert.equal(categoryOf(old, hass(states)), 'infrastructure');
  // A plant is drawn as a meter: its value, not an icon.
  const plant = device('switch', 'sensor.temperature', { category: 'plant' });
  assert.equal(symbolSpec(plant, hass(states), Date.now()).body.show, 'value');
  const remote = device('light', 'sensor.temperature', { category: 'remote' });
  assert.equal(symbolSpec(remote, hass(states), Date.now()).tap, 'remote');
});

test('each category shows only its sections: no button editor for a meter, a plant or an alert', () => {
  assert.equal(CATEGORIES.length, 8);
  const withControls = CATEGORIES.filter(category => sectionsOf(category).controls);
  assert.deepEqual(withControls, ['switch', 'equipment', 'remote']);
  assert.deepEqual(
    CATEGORIES.filter(category => sectionsOf(category).show),
    ['meter', 'plant'],
  );
  assert.deepEqual(
    CATEGORIES.filter(category => sectionsOf(category).remote),
    ['switch', 'equipment', 'remote'],
  );
});
