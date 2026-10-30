import test from 'node:test';
import assert from 'node:assert/strict';
import { RuntimeFeed } from '../../.work/shell/runtime-feed.js';
import { ActivityLog } from '../../.work/model/activity.js';
import { symbolSpec } from '../../.work/model/symbol-spec.js';
import { nowSections } from '../../.work/model/now.js';
import { deviceScreen } from '../../.work/model/device-screen.js';
const at = Date.parse('2026-10-29T00:00:00Z');
const device = {
  id: 'lamp',
  roomId: 'studio',
  kind: 'light',
  display: { label: 'Test lamp', icon: 'mdi:lightbulb' },
  bindings: { entityId: 'light.synthetic' },
};
const configuration = {
  rooms: [{ id: 'studio', label: 'Studio' }],
  catalog: { devices: [device] },
  actions: { toggle: { service: 'toggle', target: { entity_id: 'light.synthetic' } } },
  stateSources: { lamp: { entityId: 'light.synthetic', attribute: null, feedback: 'measured' } },
  commandTtlSeconds: 30,
};
function setup() {
  const log = new ActivityLog(),
    feed = new RuntimeFeed(log);
  feed.configure(configuration);
  return {
    log,
    feed,
    hass: {
      states: { 'light.synthetic': { state: 'off', last_updated: new Date(at - 1000).toISOString(), attributes: {} } },
    },
    runtime: { states: {} },
  };
}

test('service, RF echo and independent measured feedback update exactly one command row', () => {
  const { log, feed, hass, runtime } = setup();
  const token = feed.prepareCommand('lamp', 'toggle', hass, at, 'Toggle');
  runtime.states.lamp = {
    confidence: 'sent',
    command: {
      id: 'command-1',
      actionId: 'toggle',
      issuedAt: new Date(at).toISOString(),
      expiresAt: new Date(at + 30000).toISOString(),
      baselineLastUpdated: new Date(at - 1000).toISOString(),
      status: 'sent',
    },
  };
  feed.update(hass, runtime, new Set(), at + 1);
  feed.noteCommandResult(token, { ok: true }, at + 2);
  hass.states['light.synthetic'].attributes.homemanager_on_air = {
    at: new Date(at + 5).toISOString(),
    result: 'heard',
  };
  feed.update(hass, runtime, new Set(), at + 6);
  assert.equal(log.entries.length, 1);
  assert.equal(log.latest.status, 'on_air');
  runtime.states.lamp = { confidence: 'confirmed', observedAt: new Date(at + 10).toISOString(), command: null };
  feed.update(hass, runtime, new Set(), at + 11);
  assert.equal(log.latest.status, 'on_air');
  feed.update(hass, runtime, new Set(['light.synthetic']), at + 12);
  assert.equal(log.entries.length, 1);
  assert.equal(log.latest.status, 'confirmed');
});

test('validation errors are visible and TTL never claims a physical failure or confirmation', () => {
  const { log, feed, hass, runtime } = setup();
  const token = feed.prepareCommand('lamp', 'toggle', hass, at);
  feed.noteCommandResult(token, { ok: false }, at + 1);
  assert.equal(log.latest.message, 'No se pudo enviar');
  const next = feed.prepareCommand('lamp', 'toggle', hass, at + 2);
  feed.noteCommandResult(next, { ok: true }, at + 3);
  feed.update(hass, runtime, new Set(), at + 40000);
  assert.equal(log.latest.message, 'Enviado');
  assert.equal(log.latest.expired, true);
});

test('alert creation and resolution are separate from watched state observations', () => {
  const { log, feed, hass, runtime } = setup();
  const config = structuredClone(configuration);
  config.catalog.devices[0].bindings.entityId = 'binary_sensor.synthetic_leak';
  feed.configure(config);
  hass.states['binary_sensor.synthetic_leak'] = { state: 'on', attributes: { device_class: 'moisture' } };
  feed.update(hass, runtime, new Set(), at);
  assert.equal(feed.alerts.length, 1);
  hass.states['binary_sensor.synthetic_leak'] = { state: 'off', attributes: { device_class: 'moisture' } };
  feed.update(hass, runtime, new Set(), at + 1);
  assert.equal(feed.alerts.length, 0);
  assert.ok(log.entries.some(entry => entry.type === 'resolved'));
  assert.equal(
    log.entries.some(entry => entry.status === 'confirmed'),
    false,
  );
});

test('changing readings retain duration and all surfaces use the same observed condition', () => {
  const { log, feed, hass, runtime } = setup();
  const config = structuredClone(configuration),
    d = config.catalog.devices[0];
  d.bindings.entityId = 'sensor.soil';
  d.display.category = 'plant';
  d.display.alerts = [{ reading: 'sensor.soil', below: 20, forMinutes: 3, level: 'warning' }];
  feed.configure(config);
  const reading = value => ({ state: value, attributes: { friendly_name: 'Soil moisture', unit_of_measurement: '%' } });
  hass.states['sensor.soil'] = reading('19');
  feed.update(hass, runtime, new Set(), at);
  assert.equal(feed.alerts.length, 0);
  hass.states['sensor.soil'] = reading('18');
  feed.update(hass, runtime, new Set(), at + 180000);
  assert.equal(feed.alerts.length, 1);
  assert.equal(symbolSpec(d, hass, at + 180000, undefined, feed.alertContext).badge.level, 'warning');
  assert.equal(deviceScreen(d, hass, config.rooms, at + 180000, [], {}, feed.alertContext).alerts.length, 1);
  const sections = nowSections([d], config.rooms, hass, at + 180000, null, {}, feed.alertContext);
  assert.equal(sections[0].rows[0].alert.readingLabel, 'Soil moisture');
  assert.equal(log.latest.detail, 'Soil moisture');
  hass.states['sensor.soil'] = reading('unknown');
  feed.update(hass, runtime, new Set(), at + 180001);
  assert.equal(feed.alerts.length, 0);
  assert.equal(
    log.entries.some(entry => entry.type === 'resolved'),
    false,
  );
  hass.states['sensor.soil'] = reading('22');
  feed.update(hass, runtime, new Set(), at + 180002);
  assert.equal(log.entries.filter(entry => entry.type === 'resolved').length, 1);
});

test('disconnect and removed association never claim recovery; severity edits propagate', () => {
  const { log, feed, hass, runtime } = setup();
  const config = structuredClone(configuration),
    d = config.catalog.devices[0];
  d.bindings.entityId = 'binary_sensor.door';
  d.display.category = 'presence';
  d.display.highlight = true;
  d.display.alerts = [{ reading: 'binary_sensor.door', level: 'warning' }];
  feed.configure(config);
  hass.states['binary_sensor.door'] = { state: 'on', attributes: {} };
  feed.update(hass, runtime, new Set(), at);
  assert.equal(symbolSpec(d, hass, at).highlight, true);
  assert.equal(symbolSpec(d, hass, at).ring, null);
  d.display.alerts[0].level = 'alert';
  feed.update(hass, runtime, new Set(), at + 1);
  assert.equal(log.latest.tone, 'alert');
  hass.connection = { connected: false };
  feed.update(hass, runtime, new Set(), at + 2);
  assert.equal(feed.alerts.length, 0);
  assert.deepEqual(feed.alertContext, {});
  assert.equal(
    log.entries.some(entry => entry.type === 'resolved'),
    false,
  );
  assert.equal(symbolSpec(d, hass, at).highlight, false);
});

test('a meter updating every few seconds writes nothing; a discrete change writes its formatted value', () => {
  const log = new ActivityLog(),
    feed = new RuntimeFeed(log);
  const meter = {
    id: 'meter',
    roomId: 'studio',
    kind: 'energy',
    display: { label: 'Test meter', icon: 'mdi:flash' },
    bindings: { entityId: 'sensor.synthetic_current' },
  };
  feed.configure({ ...configuration, catalog: { devices: [device, meter] }, stateSources: {} });
  const state = (lamp, current) => ({
    formatEntityState: entity => (entity.state === 'on' ? 'Encendida' : entity.state),
    states: {
      'light.synthetic': { state: lamp, last_updated: new Date(at).toISOString(), attributes: {} },
      'sensor.synthetic_current': {
        state: current,
        last_updated: new Date(at).toISOString(),
        attributes: { unit_of_measurement: 'A' },
      },
    },
  });
  const runtime = { states: {} };
  feed.update(state('off', '3.19994068145752'), runtime, new Set(), at);
  feed.update(state('off', '3.26295804977417'), runtime, new Set(), at + 5000);
  feed.update(state('off', '2.89073395729065'), runtime, new Set(), at + 10000);
  assert.equal(log.entries.length, 0);
  feed.update(state('on', '2.89073395729065'), runtime, new Set(), at + 15000);
  assert.equal(log.entries.length, 1);
  assert.equal(log.latest.deviceLabel, 'Test lamp');
  assert.equal(log.latest.value, 'Encendida');
});
