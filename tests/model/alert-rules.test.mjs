import test from 'node:test';
import assert from 'node:assert/strict';
import { alertsOf, observeAlertRules, presenceHighlightOf } from '../../.work/model/alerts.js';

const now = Date.parse('2026-10-30T12:00:00Z');
function plant(rules = [{ reading: 'sensor.test_soil', below: 20, level: 'warning' }]) {
  const device = {
    id: 'test-plant',
    roomId: 'test-room',
    kind: 'plant',
    display: { label: 'Planta de prueba', icon: 'mdi:flower', category: 'plant', alerts: rules },
    bindings: { entityId: 'sensor.test_soil', deviceId: 'fictional-device' },
  };
  const hass = {
    states: {
      'sensor.test_soil': {
        state: '10',
        attributes: { device_class: 'moisture', friendly_name: 'Humedad del suelo' },
        last_changed: new Date(now).toISOString(),
      },
      'sensor.test_light': {
        state: '0',
        attributes: { device_class: 'illuminance', friendly_name: 'Luz' },
        last_changed: new Date(now).toISOString(),
      },
    },
    entities: {
      'sensor.test_soil': { device_id: 'fictional-device' },
      'sensor.test_light': { device_id: 'fictional-device' },
    },
  };
  return { device, hass };
}

test('numeric bounds are strict, include zero and negative limits, and use the declared severity', () => {
  const { device, hass } = plant([{ reading: 'sensor.test_soil', below: 0, above: 20, level: 'alert' }]);
  for (const [state, count] of [
    ['-1', 1],
    ['0', 0],
    ['10', 0],
    ['20', 0],
    ['21', 1],
  ]) {
    hass.states['sensor.test_soil'].state = state;
    const alerts = alertsOf(device, hass, now);
    assert.equal(alerts.length, count, state);
    if (count) {
      assert.equal(alerts[0].level, 'critical');
      assert.equal(alerts[0].rule, 'threshold');
      assert.equal(alerts[0].readingLabel, 'Humedad del suelo');
    }
  }
});

test('unknown, unavailable, absent and nonnumeric readings never create a numeric breach', () => {
  const { device, hass } = plant();
  for (const state of ['unknown', 'unavailable', '', ' ', 'NaN', 'Infinity', 'on']) {
    hass.states['sensor.test_soil'].state = state;
    assert.equal(alertsOf(device, hass, now).length, 0, state);
  }
  delete hass.states['sensor.test_soil'];
  assert.deepEqual(alertsOf(device, hass, now), []);
  assert.deepEqual(alertsOf(device, undefined, now), []);
});

test('auxiliary readings require registry evidence; names and prefixes never establish association', () => {
  const { device, hass } = plant([{ reading: 'sensor.test_light', below: 800, level: 'warning' }]);
  assert.equal(alertsOf(device, hass, now).length, 1);
  hass.entities['sensor.test_light'].device_id = 'another-fictional-device';
  assert.deepEqual(alertsOf(device, hass, now), []);
  delete hass.entities['sensor.test_light'];
  assert.deepEqual(alertsOf(device, hass, now), []);
  hass.entities['sensor.test_light'] = { device_id: 'fictional-device' };
  device.bindings.entityId = null;
  assert.equal(alertsOf(device, hass, now).length, 1);
  delete device.bindings.deviceId;
  assert.deepEqual(alertsOf(device, hass, now), []);
});

test('a duration uses a stable HA timestamp, never last_updated, missing dates or a future clock', () => {
  const { device, hass } = plant([{ reading: 'sensor.test_light', below: 800, forMinutes: 4320, level: 'warning' }]);
  const reading = hass.states['sensor.test_light'];
  reading.last_changed = new Date(now - 4320 * 60000).toISOString();
  assert.equal(alertsOf(device, hass, now).length, 1);
  assert.equal(alertsOf(device, hass, now - 1).length, 0);
  reading.last_updated = reading.last_changed;
  for (const stamp of [undefined, 'invalid', new Date(now + 1).toISOString()]) {
    reading.last_changed = stamp;
    assert.deepEqual(alertsOf(device, hass, now), []);
  }
  assert.deepEqual(alertsOf(device, hass, NaN), []);
});

test('a changing numeric value that remains below the limit keeps its observed duration', () => {
  const { device, hass } = plant([{ reading: 'sensor.test_soil', below: 20, forMinutes: 1, level: 'warning' }]);
  const before = structuredClone({ device, hass });
  let context = observeAlertRules([device], hass, now);
  assert.deepEqual({ device, hass }, before);
  const savedContext = structuredClone(context);
  hass.states['sensor.test_soil'].state = '12';
  hass.states['sensor.test_soil'].last_changed = new Date(now + 30000).toISOString();
  context = observeAlertRules([device], hass, now + 30000, context);
  assert.deepEqual(savedContext, observeAlertRules([device], before.hass, now));
  assert.equal(alertsOf(device, hass, now + 59999, context).length, 0);
  assert.equal(alertsOf(device, hass, now + 60000, context).length, 1);
  // A reload without observed continuity cannot credit the previous, changing values.
  assert.equal(alertsOf(device, hass, now + 60000).length, 0);
});

test('leaving a bound, unknown data, lost membership and disconnection discard temporal evidence', () => {
  const { device, hass } = plant([{ reading: 'sensor.test_light', below: 800, forMinutes: 1, level: 'warning' }]);
  const context = observeAlertRules([device], hass, now);
  for (const state of ['800', '900', 'unknown', 'unavailable']) {
    hass.states['sensor.test_light'].state = state;
    assert.deepEqual(observeAlertRules([device], hass, now + 30000, context), {});
  }
  hass.states['sensor.test_light'].state = '1';
  hass.entities['sensor.test_light'].device_id = 'other';
  assert.deepEqual(observeAlertRules([device], hass, now + 30000, context), {});
  hass.entities['sensor.test_light'].device_id = 'fictional-device';
  hass.connection = { connected: false };
  assert.deepEqual(observeAlertRules([device], hass, now + 30000, context), {});
  assert.deepEqual(alertsOf(device, hass, now + 90000, context), []);
});

test('clock rollback and switching to the other side of a range do not reuse old evidence', () => {
  const { device, hass } = plant([
    { reading: 'sensor.test_soil', below: 20, above: 80, forMinutes: 1, level: 'warning' },
  ]);
  const context = observeAlertRules([device], hass, now);
  const rollback = observeAlertRules([device], hass, now - 1000, context);
  assert.equal(Object.values(rollback)[0].since, now - 1000);
  hass.states['sensor.test_soil'].state = '90';
  hass.states['sensor.test_soil'].last_changed = new Date(now + 30000).toISOString();
  const otherSide = observeAlertRules([device], hass, now + 30000, context);
  assert.equal(alertsOf(device, hass, now + 60000, otherSide).length, 0);
  assert.equal(alertsOf(device, hass, now + 90000, otherSide).length, 1);
});

test('presence highlighting is independent of alert counting and defaults to off', () => {
  const { device, hass } = plant([]);
  device.display.category = 'presence';
  device.bindings.entityId = 'binary_sensor.test_door';
  hass.states['binary_sensor.test_door'] = {
    state: 'on',
    attributes: { device_class: 'door' },
    last_changed: new Date(now - 120000).toISOString(),
  };
  assert.equal(presenceHighlightOf(device, hass), false);
  assert.deepEqual(alertsOf(device, hass, now), []);
  device.display.highlight = true;
  assert.equal(presenceHighlightOf(device, hass), true);
  device.display.alerts = [{ reading: 'binary_sensor.test_door', forMinutes: 2, level: 'warning' }];
  assert.equal(alertsOf(device, hass, now).length, 1);
  assert.equal(alertsOf(device, hass, now)[0].level, 'warning');
  hass.states['binary_sensor.test_door'].state = 'off';
  assert.equal(presenceHighlightOf(device, hass), false);
  assert.deepEqual(alertsOf(device, hass, now), []);
});

test('an alarm level replaces the default critical alert instead of duplicating it', () => {
  const { device, hass } = plant([]);
  device.display.category = 'alert';
  device.bindings.entityId = 'binary_sensor.test_alarm';
  hass.states['binary_sensor.test_alarm'] = {
    state: 'on',
    attributes: { device_class: 'moisture' },
    last_changed: new Date(now).toISOString(),
  };
  assert.equal(alertsOf(device, hass, now)[0].level, 'critical');
  device.display.alerts = [{ reading: 'binary_sensor.test_alarm', level: 'warning', forMinutes: 1 }];
  assert.deepEqual(alertsOf(device, hass, now), []);
  const alerts = alertsOf(device, hass, now + 60000);
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].level, 'warning');
  assert.equal(alerts[0].message, 'Fuga detectada');
});

test('changing category keeps configuration intact while hidden rule types stay inactive', () => {
  const { device, hass } = plant();
  const original = structuredClone(device.display.alerts);
  device.display.category = 'switch';
  assert.deepEqual(alertsOf(device, hass, now), []);
  assert.deepEqual(device.display.alerts, original);
  device.display.category = 'plant';
  assert.equal(alertsOf(device, hass, now).length, 1);
});

test('identical conditions deduplicate deterministically and an active alarm wins over a warning', () => {
  const { device, hass } = plant([
    { reading: 'sensor.test_soil', below: 20, level: 'warning' },
    { reading: 'sensor.test_soil', below: 20, level: 'alert' },
  ]);
  const snapshot = structuredClone({ device, hass });
  const first = alertsOf(device, hass, now);
  assert.equal(first.length, 1);
  assert.equal(first[0].level, 'critical');
  assert.deepEqual({ device, hass }, snapshot);
  device.display.alerts.reverse();
  assert.deepEqual(alertsOf(device, hass, now), first);
});
