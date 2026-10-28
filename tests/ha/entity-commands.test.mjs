import test from 'node:test';
import assert from 'node:assert/strict';
import { HomeAssistantAdapter } from '../../src/ha/adapter.mjs';

// Synthetic devices and entities only.
const stamp = '2026-01-01T00:00:00.000Z';
function setup(t) {
  const device = (id, entityId) => ({
    id,
    roomId: null,
    kind: 'light',
    position: { x: 0.5, y: 0.5 },
    mobility: 'editable',
    display: { label: id, icon: 'mdi:lightbulb' },
    bindings: { entityId, primaryAction: null, advancedPopupId: null },
    state: { value: 'unknown', confidence: 'unknown' },
  });
  const configuration = {
    schemaVersion: 2,
    rooms: [],
    catalog: {
      schemaVersion: 2,
      devices: [
        device('lamp', 'light.lamp'),
        device('fan', 'fan.ceiling'),
        device('blind', 'cover.blind'),
        device('rf', 'script.rf_fan'),
        device('loose', null),
      ],
    },
    architecture: { format: 'svg', content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"/>' },
    actions: {},
    panels: {},
    stateSources: {},
  };
  const hass = {
    connected: true,
    user: { id: 'u', is_admin: false },
    states: {
      'light.lamp': {
        state: 'on',
        last_updated: stamp,
        attributes: { supported_color_modes: ['brightness'], brightness: 128 },
      },
      'fan.ceiling': {
        state: 'on',
        last_updated: stamp,
        attributes: { supported_features: 1 | 16 | 32, percentage: 33, percentage_step: 33.33 },
      },
      'cover.blind': {
        state: 'open',
        last_updated: stamp,
        attributes: { supported_features: 1 | 2 | 4 | 8, current_position: 100 },
      },
      'script.rf_fan': { state: 'off', last_updated: stamp, attributes: {} },
    },
    services: {
      light: { turn_on: {}, turn_off: {} },
      fan: { set_percentage: {}, turn_on: {}, turn_off: {}, set_preset_mode: {} },
      cover: { set_cover_position: {}, open_cover: {}, close_cover: {}, stop_cover: {} },
      script: {
        turn_on: {},
        rf_fan: { fields: { speed: { required: true, selector: { select: { options: ['off', '1', '2', '3'] } } } } },
      },
    },
    calls: [],
    async callService(domain, service, data, target) {
      hass.calls.push({ domain, service, data, target });
    },
  };
  const adapter = new HomeAssistantAdapter({ configuration, now: () => Date.parse('2026-01-01T00:00:10.000Z') });
  adapter.setHass(hass);
  t.after(() => adapter.dispose());
  return { adapter, hass };
}

test('panel commands target only the bound entity and end as sent, never confirmed', async t => {
  const { adapter, hass } = setup(t);
  assert.deepEqual(await adapter.executeEntityCommand('lamp', { service: 'turn_on', data: { brightness_pct: 40 } }), {
    ok: true,
    status: 'sent',
  });
  assert.deepEqual(hass.calls.at(-1), {
    domain: 'light',
    service: 'turn_on',
    data: { brightness_pct: 40 },
    target: { entity_id: 'light.lamp' },
  });
  assert.equal(adapter.getSnapshot().states.lamp.confidence, 'sent');
  assert.deepEqual(
    await adapter.executeEntityCommand('blind', { service: 'set_cover_position', data: { position: 30 } }),
    { ok: true, status: 'sent' },
  );
  assert.deepEqual(hass.calls.at(-1).target, { entity_id: 'cover.blind' });
});

test('capabilities, ranges, targets and unbound devices are enforced before calling HA', async t => {
  const { adapter, hass } = setup(t);
  const rejected = [
    ['lamp', { service: 'turn_on', data: { brightness_pct: 140 } }],
    ['lamp', { service: 'turn_on', data: { entity_id: 'light.other' } }],
    ['lamp', { service: 'turn_on', data: { color_temp_kelvin: 3000 } }],
    ['fan', { service: 'set_preset_mode', data: { preset_mode: 'turbo' } }],
    ['fan', { service: 'oscillate', data: { oscillating: true } }],
    ['blind', { service: 'set_cover_position', data: { position: 101 } }],
    ['lamp', { service: 'reload' }],
    ['loose', { service: 'turn_on' }],
    ['missing', { service: 'turn_on' }],
  ];
  for (const [device, command] of rejected) {
    assert.equal(adapter.getEntityCommandAvailability(device, command).available, false, JSON.stringify(command));
    assert.equal((await adapter.executeEntityCommand(device, command)).ok, false);
  }
  assert.deepEqual(hass.calls, []);
});

test('script controls need the declared signature: required fields and allowed options', async t => {
  const { adapter, hass } = setup(t);
  assert.equal(adapter.getEntityCommandAvailability('rf', { service: 'turn_on' }).available, false);
  assert.equal(
    adapter.getEntityCommandAvailability('rf', { service: 'turn_on', data: { variables: { speed: '9' } } }).available,
    false,
  );
  assert.equal(
    adapter.getEntityCommandAvailability('rf', { service: 'turn_on', data: { variables: { speed: '2', extra: 1 } } })
      .available,
    false,
  );
  assert.deepEqual(
    await adapter.executeEntityCommand('rf', { service: 'turn_on', data: { variables: { speed: '2' } } }),
    { ok: true, status: 'sent' },
  );
  assert.deepEqual(hass.calls.at(-1), {
    domain: 'script',
    service: 'turn_on',
    data: { variables: { speed: '2' } },
    target: { entity_id: 'script.rf_fan' },
  });
});

test('a second command on the same device waits for the first to finish', async t => {
  const { adapter, hass } = setup(t);
  let release;
  hass.callService = () => new Promise(resolve => (release = resolve));
  const first = adapter.executeEntityCommand('lamp', { service: 'turn_off' });
  assert.equal(adapter.getEntityCommandAvailability('lamp', { service: 'turn_on' }).available, false);
  assert.equal((await adapter.executeEntityCommand('lamp', { service: 'turn_on' })).ok, false);
  release();
  assert.equal((await first).ok, true);
});
