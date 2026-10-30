import test from 'node:test';
import assert from 'node:assert/strict';
import { symbolSpec, formattedValue } from '../../.work/model/symbol-spec.js';
import { fixture, now } from './fixtures.mjs';

test('healthy active lights have a warm ring and no health point; levels are arcs', () => {
  const { device, hass } = fixture('light', 'light.test_light', 'on', { brightness: 153 });
  const spec = symbolSpec(device, hass, now, { value: 'on', confidence: 'confirmed' });
  assert.deepEqual(spec.ring, { active: true, level: 0.6, tone: 'active' });
  assert.equal(spec.health, null);
  assert.equal(spec.badge, null);
  hass.states[device.bindings.entityId].state = 'off';
  assert.equal(symbolSpec(device, hass, now).ring, null);
});

test('temperature meters use HA formatting, fallback numeric unit, and show overrides', () => {
  const { device, hass, entity } = fixture('sensor', 'sensor.test_temperature', '23.4', {
    device_class: 'temperature',
    unit_of_measurement: '°C',
  });
  hass.formatEntityState = state => {
    assert.equal(state, entity);
    return '23,4°';
  };
  let spec = symbolSpec(device, hass, now);
  assert.equal(spec.archetype, 'meter');
  assert.equal(spec.body.value, '23,4°');
  assert.equal(spec.body.icon, null);
  assert.equal(spec.ring, null);
  delete hass.formatEntityState;
  assert.equal(formattedValue(entity, hass), '23,4 °C');
  hass.formatEntityState = () => {
    throw new Error('formatter not available');
  };
  assert.equal(formattedValue(entity, hass), '23,4 °C');
  device.display.show = 'both';
  spec = symbolSpec(device, hass, now);
  assert.equal(spec.body.icon, 'mdi:thermometer');
  assert.equal(spec.body.value, '23,4 °C');
  device.display.show = 'icon';
  assert.equal(symbolSpec(device, hass, now).body.value, null);
});

test('meter pills stay bounded without losing the complete formatted value', () => {
  const { device, hass } = fixture();
  hass.formatEntityState = () => '1234567890 kWh';
  const spec = symbolSpec(device, hass, now);
  assert.equal(spec.body.value.length, 9);
  assert.equal(spec.body.fullValue, '1234567890 kWh');
});

test('binary sensor changes icon and a leak has a critical badge', () => {
  const { device, hass, entity } = fixture('sensor', 'binary_sensor.test_door', 'off', { device_class: 'door' });
  assert.equal(symbolSpec(device, hass, now).body.icon, 'mdi:door-closed');
  entity.state = 'on';
  assert.equal(symbolSpec(device, hass, now).body.icon, 'mdi:door-open');
  entity.attributes.device_class = 'moisture';
  assert.deepEqual(symbolSpec(device, hass, now).badge, { count: 1, level: 'critical' });
});

test('unavailable, assumed and sent have problem-only health marks and never fake a ring', () => {
  const { device, hass, entity } = fixture('fan', 'fan.test_fan', 'unavailable');
  assert.equal(symbolSpec(device, hass, now).health, 'unavailable');
  entity.state = 'off';
  const sent = symbolSpec(device, hass, now, { value: 'unknown', confidence: 'sent' });
  assert.equal(sent.health, 'estimated');
  assert.equal(sent.ring, null);
  entity.state = 'on';
  entity.attributes.assumed_state = true;
  assert.equal(symbolSpec(device, hass, now).health, 'estimated');
  entity.state = 'unknown';
  assert.equal(symbolSpec(device, hass, now).ring, null);
});

test('all archetypes emit their own interaction and body grammar', () => {
  for (const archetype of ['actuator', 'equipment', 'sensor', 'meter', 'remote', 'infrastructure']) {
    const { device, hass } = fixture('other', 'sensor.test_value', '23.4');
    device.display.archetype = archetype;
    device.bindings.primaryAction = archetype === 'actuator' ? 'test-action' : null;
    const spec = symbolSpec(device, hass, now);
    assert.equal(spec.archetype, archetype);
    assert.equal(spec.hold, ['actuator', 'equipment', 'remote'].includes(archetype) ? 'panel' : null);
    assert.equal(spec.tap, archetype === 'actuator' ? 'control' : archetype === 'remote' ? 'remote' : 'panel');
  }
});

test('an explicit D18 tap keeps working on a legacy sensor after linking an actuator entity', () => {
  const { device, hass } = fixture('sensor', 'light.test_light', 'off');
  device.bindings.tap = 'power';
  assert.equal(symbolSpec(device, hass, now).tap, 'control');
});

test('inputs and runtime remain unchanged by rendering decisions', () => {
  const { device, hass } = fixture('ac', 'climate.test_ac', 'cool', { temperature: 22 });
  const runtime = { value: 'cool', confidence: 'estimated' };
  const before = structuredClone({ device, hass, runtime });
  assert.equal(symbolSpec(device, hass, now, runtime).tag, '22°');
  assert.deepEqual({ device, hass, runtime }, before);
});

test('a normal entity needs no health mark merely because a feedback source is unconfigured', () => {
  const { device, hass } = fixture('light', 'light.test_light', 'on');
  const spec = symbolSpec(device, hass, now, { value: 'unknown', confidence: 'unknown' });
  assert.equal(spec.health, null);
  assert.equal(spec.ring.active, true);
  assert.equal(symbolSpec(device, hass, now, { value: 'on', confidence: 'estimated' }).health, null);
  device.bindings.entityId = null;
  assert.equal(symbolSpec(device, hass, now).health, 'unknown');
  assert.notEqual(symbolSpec(device, hass, now).health, 'unavailable');
});
