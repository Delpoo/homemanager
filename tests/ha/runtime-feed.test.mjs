import test from 'node:test';
import assert from 'node:assert/strict';
import { RuntimeFeed } from '../../.work/shell/runtime-feed.js';
import { ActivityLog } from '../../.work/model/activity.js';
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
