import test from 'node:test';
import assert from 'node:assert/strict';
import { alertsOf } from '../../.work/model/alerts.js';
import { fixture, now } from './fixtures.mjs';

test('enabled critical rules alert only for active binary sensors', () => {
  for (const device_class of ['moisture', 'smoke', 'gas', 'carbon_monoxide', 'safety', 'problem']) {
    const { device, hass, entity } = fixture('sensor', 'binary_sensor.test_alarm', 'on', { device_class });
    const before = structuredClone({ device, hass });
    const alerts = alertsOf(device, hass, now);
    assert.equal(alerts.length, 1, device_class);
    assert.equal(alerts[0].level, 'critical');
    assert.equal(alerts[0].roomId, device.roomId);
    assert.deepEqual({ device, hass }, before);
    for (const state of ['off', 'unknown', 'unavailable']) {
      entity.state = state;
      assert.equal(alertsOf(device, hass, now).length, 0);
    }
  }
});

test('door and window delays and numeric ranges are disabled in v1', () => {
  for (const device_class of ['door', 'window', 'motion']) {
    const { device, hass } = fixture('sensor', 'binary_sensor.test_opening', 'on', { device_class });
    assert.deepEqual(alertsOf(device, hass, now), []);
  }
  const humidity = fixture('sensor', 'sensor.test_humidity', '99', { device_class: 'humidity' });
  assert.deepEqual(alertsOf(humidity.device, humidity.hass, now), []);
});

test('battery warning has a strict 15 percent threshold and rejects invalid readings', () => {
  const { device, hass, entity } = fixture('sensor', 'sensor.test_battery', '14.9', { device_class: 'battery' });
  assert.equal(alertsOf(device, hass, now)[0].rule, 'battery');
  for (const state of ['15', '100', '-1', 'unknown', 'unavailable', '', 'NaN', 'Infinity']) {
    entity.state = state;
    assert.deepEqual(alertsOf(device, hass, now), [], state);
  }
});

test('battery associations use registry membership, never guessed entity names, and deduplicate', () => {
  const { device, hass } = fixture('sensor', 'binary_sensor.test_door', 'off', {
    device_class: 'door',
    battery_level: 10,
  });
  hass.entities = {
    'binary_sensor.test_door': { device_id: 'fictional-ha-device' },
    'sensor.test_battery': { device_id: 'fictional-ha-device' },
    'sensor.unrelated_battery': { device_id: 'other-fictional-device' },
  };
  hass.states['sensor.test_battery'] = { state: '8', attributes: { device_class: 'battery' } };
  hass.states['sensor.unrelated_battery'] = { state: '4', attributes: { device_class: 'battery' } };
  assert.equal(alertsOf(device, hass, now).length, 1);
  assert.equal(alertsOf(device, hass, now)[0].entityId, 'sensor.test_battery');
  delete hass.entities;
  delete hass.states[device.bindings.entityId].attributes.battery_level;
  assert.deepEqual(alertsOf(device, hass, now), []);
});

test('unavailable warning needs over ten minutes proven by last_changed', () => {
  const { device, hass, entity } = fixture('sensor', 'sensor.test_temperature', 'unavailable');
  for (const stamp of [
    undefined,
    'invalid',
    new Date(now + 1000).toISOString(),
    new Date(now - 600000).toISOString(),
  ]) {
    entity.last_changed = stamp;
    entity.last_updated = new Date(now - 999999).toISOString();
    assert.deepEqual(alertsOf(device, hass, now), []);
  }
  entity.last_changed = new Date(now - 600001).toISOString();
  assert.equal(alertsOf(device, hass, now)[0].rule, 'unavailable');
  assert.deepEqual(alertsOf(device, hass, NaN), []);
});

test('unbound and absent entities do not fabricate an alert duration', () => {
  const { device, hass } = fixture();
  delete hass.states[device.bindings.entityId];
  assert.deepEqual(alertsOf(device, hass, now), []);
  device.bindings.entityId = null;
  assert.deepEqual(alertsOf(device, hass, now), []);
});
