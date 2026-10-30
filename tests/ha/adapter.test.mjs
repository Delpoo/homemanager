import test from 'node:test';
import assert from 'node:assert/strict';
import { HomeAssistantAdapter } from '../../src/ha/adapter.mjs';
import { validateFoundation } from '../../scripts/validate-foundation.mjs';

// Entirely synthetic records. They do not describe a configured installation.
function setup(t, { feedback = 'measured', verified = true, ttl = 1, attribute = null } = {}) {
  const configuration = {
    schemaVersion: 1,
    catalog: {
      schemaVersion: 1,
      devices: [
        {
          id: 'contract-device',
          roomId: 'living',
          kind: 'switch',
          position: { x: 0.5, y: 0.5 },
          mobility: 'editable',
          display: { label: 'Contract device', icon: 'mdi:power' },
          bindings: {
            entityId: 'switch.contract_target',
            primaryAction: 'contract-on',
            advancedPopupId: 'contract-panel',
          },
          state: { value: 'unknown', confidence: 'unknown' },
        },
      ],
    },
    architecture: { format: 'svg', content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"></svg>' },
    actions: {
      'contract-on': { domain: 'switch', service: 'turn_on', target: { entity_id: 'switch.contract_target' } },
      'contract-off': { domain: 'switch', service: 'turn_off', target: { entity_id: 'switch.contract_target' } },
    },
    panels: {
      'contract-panel': {
        kind: 'device-controls',
        title: 'Contract controls',
        controls: [{ id: 'off', label: 'Off', actionId: 'contract-off' }],
      },
    },
    stateSources: { 'contract-device': { entityId: 'sensor.contract_feedback', attribute, feedback } },
    commandTtlSeconds: ttl,
  };
  let now = Date.parse('2026-01-01T00:00:30.000Z');
  const events = new EventTarget();
  const hass = {
    connected: true,
    user: { id: 'contract-user', is_admin: true },
    states: {
      'switch.contract_target': { state: 'off', last_updated: '2026-01-01T00:00:00.000Z', attributes: {} },
      'sensor.contract_feedback': {
        state: '11',
        last_updated: '2026-01-01T00:00:00.000Z',
        attributes: { reading: 11 },
      },
    },
    services: {
      switch: { turn_on: { fields: {} }, turn_off: { fields: {} } },
      script: { turn_on: { fields: {} }, contract_script: { fields: {} } },
    },
    connection: {
      addEventListener: events.addEventListener.bind(events),
      removeEventListener: events.removeEventListener.bind(events),
    },
    calls: [],
    async callService(domain, service, data, target) {
      hass.calls.push({ domain, service, data: structuredClone(data), target: structuredClone(target) });
    },
  };
  const adapter = new HomeAssistantAdapter({
    configuration,
    verifiedFeedbackEntities: verified ? ['sensor.contract_feedback'] : [],
    now: () => now,
  });
  t.after(() => adapter.dispose());
  return {
    configuration,
    hass,
    adapter,
    events,
    advance: ms => {
      now += ms;
    },
    time: () => now,
  };
}
const state = adapter => adapter.getSnapshot().states['contract-device'];

test('additional reading and registry changes republish without confirming a sent command', async t => {
  const { adapter, hass } = setup(t);
  const configuration = adapter.configuration;
  Object.assign(configuration.catalog.devices[0].bindings, { deviceId: 'registry-device', readings: ['sensor.extra'] });
  adapter.configure(configuration);
  hass.states['sensor.extra'] = { state: '52', attributes: {} };
  hass.entities = {
    'sensor.extra': { device_id: 'registry-device' },
    'switch.contract_target': { device_id: 'registry-device' },
  };
  adapter.setHass(hass);
  const published = [];
  adapter.subscribe(snapshot => published.push(snapshot));
  await adapter.executeAction('contract-on');
  const baseline = published.length;
  hass.states['sensor.extra'] = { state: '55', attributes: {} };
  adapter.setHass({ ...hass });
  assert.equal(published.length, baseline + 1);
  assert.equal(state(adapter).confidence, 'sent');
  hass.entities['sensor.extra'].device_id = 'another-device';
  adapter.setHass({ ...hass });
  assert.equal(published.length, baseline + 2);
  assert.equal(state(adapter).confidence, 'sent');
});

test('runtime schema is separate from persistent configuration and starts unknown', t => {
  const { adapter, hass, configuration } = setup(t);
  const before = structuredClone(configuration);
  assert.deepEqual(state(adapter), {
    value: 'unknown',
    confidence: 'unknown',
    observedAt: null,
    sourceEntityId: 'sensor.contract_feedback',
    command: null,
  });
  adapter.setHass(hass);
  assert.equal(state(adapter).confidence, 'confirmed');
  assert.deepEqual(validateFoundation('runtime-state', adapter.getSnapshot()), { valid: true, errors: [] });
  assert.deepEqual(configuration, before);
  const snapshot = adapter.getSnapshot();
  snapshot.states['contract-device'].value = 'changed';
  assert.equal(state(adapter).value, '11');
});

test('measured declaration requires independent verification and assumed state demotes', t => {
  const unverified = setup(t, { verified: false });
  unverified.adapter.setHass(unverified.hass);
  assert.equal(state(unverified.adapter).confidence, 'estimated');
  const assumed = setup(t);
  assumed.hass.states['sensor.contract_feedback'].attributes.assumed_state = true;
  assumed.adapter.setHass(assumed.hass);
  assert.equal(state(assumed.adapter).confidence, 'estimated');
  const transmitter = setup(t, { feedback: 'transmitter' });
  transmitter.adapter.setHass(transmitter.hass);
  assert.equal(state(transmitter.adapter).confidence, 'unknown');
});

test('missing, unavailable, malformed, future and oversized readings fail closed', t => {
  for (const mutate of [
    h => {
      delete h.states['sensor.contract_feedback'];
    },
    h => {
      h.states['sensor.contract_feedback'].state = 'unavailable';
    },
    h => {
      h.states['sensor.contract_feedback'].state = 'unknown';
    },
    h => {
      h.states['sensor.contract_feedback'].state = '  ';
    },
    h => {
      h.states['sensor.contract_feedback'].state = 'a'.repeat(241);
    },
    h => {
      h.states['sensor.contract_feedback'].last_updated = 'not-a-date';
    },
    h => {
      h.states['sensor.contract_feedback'].last_updated = '2026-02-30T00:00:00Z';
    },
    h => {
      h.states['sensor.contract_feedback'].last_updated = '2027-01-01T00:00:00Z';
    },
  ]) {
    const { adapter, hass } = setup(t);
    mutate(hass);
    adapter.setHass(hass);
    assert.equal(state(adapter).confidence, 'unknown');
    assert.equal(validateFoundation('runtime-state', adapter.getSnapshot()).valid, true);
  }
});

test('attribute values are typed and prototype properties cannot become readings', t => {
  for (const value of [null, NaN, Infinity, {}, [], 'unavailable', '']) {
    const { adapter, hass } = setup(t, { attribute: 'reading' });
    hass.states['sensor.contract_feedback'].attributes.reading = value;
    adapter.setHass(hass);
    assert.equal(state(adapter).confidence, 'unknown');
  }
  const { adapter, hass } = setup(t, { attribute: 'reading' });
  hass.states['sensor.contract_feedback'].attributes = Object.create({ reading: 12 });
  adapter.setHass(hass);
  assert.equal(state(adapter).confidence, 'unknown');
});

test('accepted service is sent only and stale feedback never revives after TTL', async t => {
  const { adapter, hass, advance } = setup(t);
  adapter.setHass(hass);
  assert.deepEqual(await adapter.executePrimary('contract-device'), { ok: true, status: 'sent' });
  const sent = state(adapter);
  assert.equal(sent.confidence, 'sent');
  assert.equal(sent.value, 'unknown');
  assert.deepEqual(sent.command, {
    id: 'command-1',
    actionId: 'contract-on',
    issuedAt: '2026-01-01T00:00:30.000Z',
    expiresAt: '2026-01-01T00:00:31.000Z',
    baselineLastUpdated: '2026-01-01T00:00:00.000Z',
    status: 'sent',
  });
  assert.deepEqual(hass.calls, [
    { domain: 'switch', service: 'turn_on', data: {}, target: { entity_id: 'switch.contract_target' } },
  ]);
  advance(1000);
  assert.equal(state(adapter).confidence, 'unknown');
  assert.equal(state(adapter).command, null);
  adapter.setHass({ ...hass, states: { ...hass.states } });
  assert.equal(state(adapter).confidence, 'unknown');
  assert.equal(validateFoundation('runtime-state', adapter.getSnapshot()).valid, true);
});

test('only later verified measured feedback clears sent and transmitter cannot confirm', async t => {
  const { adapter, hass, advance, time } = setup(t);
  adapter.setHass(hass);
  await adapter.executePrimary('contract-device');
  hass.states['sensor.contract_feedback'].last_updated = '2026-01-01T00:00:30.000Z';
  adapter.setHass(hass);
  assert.equal(state(adapter).confidence, 'sent');
  advance(1);
  hass.states['sensor.contract_feedback'].last_updated = new Date(time()).toISOString();
  adapter.setHass(hass);
  assert.equal(state(adapter).confidence, 'confirmed');
  assert.equal(state(adapter).command, null);
  const transmitter = setup(t, { feedback: 'transmitter' });
  transmitter.adapter.setHass(transmitter.hass);
  await transmitter.adapter.executePrimary('contract-device');
  transmitter.advance(1);
  transmitter.hass.states['sensor.contract_feedback'].last_updated = new Date(transmitter.time()).toISOString();
  transmitter.adapter.setHass(transmitter.hass);
  assert.equal(state(transmitter.adapter).confidence, 'sent');
  transmitter.advance(1000);
  assert.equal(state(transmitter.adapter).confidence, 'unknown');
});

test('service rejection produces bounded error status without retaining HA error text', async t => {
  const { adapter, hass, advance } = setup(t);
  hass.callService = async () => {
    throw new Error('detail from service');
  };
  adapter.setHass(hass);
  const result = await adapter.executePrimary('contract-device');
  assert.equal(result.ok, false);
  assert(!JSON.stringify(result).includes('detail from service'));
  assert.equal(state(adapter).confidence, 'error');
  assert.equal(state(adapter).command.status, 'error');
  advance(1000);
  assert.equal(state(adapter).confidence, 'unknown');
  assert.equal(state(adapter).command, null);
});

test('normal fresh hass wrappers preserve an in-flight call but new connection invalidates it', async t => {
  const normal = setup(t);
  normal.adapter.setHass(normal.hass);
  let release;
  normal.hass.callService = () =>
    new Promise(resolve => {
      release = resolve;
    });
  const pending = normal.adapter.executePrimary('contract-device');
  normal.adapter.setHass({ ...normal.hass, states: { ...normal.hass.states } });
  release();
  assert.equal((await pending).ok, true);
  const changed = setup(t);
  changed.adapter.setHass(changed.hass);
  let oldRelease;
  changed.hass.callService = () =>
    new Promise(resolve => {
      oldRelease = resolve;
    });
  const oldPending = changed.adapter.executePrimary('contract-device');
  changed.adapter.setHass({ ...changed.hass, connection: {} });
  oldRelease();
  assert.deepEqual(await oldPending, { ok: false, reason: 'stale-context' });
  assert.equal(state(changed.adapter).command, null);
});

test('disconnect, reconnect, user change and configure clear acknowledgements', async t => {
  const { adapter, hass, events, configuration } = setup(t);
  adapter.setHass(hass);
  await adapter.executePrimary('contract-device');
  events.dispatchEvent(new Event('disconnected'));
  assert.equal(state(adapter).confidence, 'unknown');
  assert.equal(state(adapter).command, null);
  events.dispatchEvent(new Event('ready'));
  assert.equal(state(adapter).confidence, 'unknown');
  adapter.setHass({ ...hass });
  assert.equal(state(adapter).confidence, 'confirmed');
  await adapter.executePrimary('contract-device');
  adapter.setHass({ ...hass, user: { id: 'another-contract-user' } });
  assert.equal(state(adapter).command, null);
  await adapter.executePrimary('contract-device');
  adapter.configure(configuration);
  assert.equal(state(adapter).command, null);
});

test('unbound, unavailable, unrelated and busy actions never execute', async t => {
  const { adapter, hass } = setup(t);
  assert.equal((await adapter.executePrimary('contract-device')).reason, 'ha-unavailable');
  adapter.setHass(hass);
  assert.equal((await adapter.executeAction('absent')).reason, 'unbound-action');
  assert.equal((await adapter.executeAction('contract-on', 'absent')).reason, 'unknown-device');
  let release;
  hass.callService = () =>
    new Promise(resolve => {
      release = resolve;
    });
  const pending = adapter.executePrimary('contract-device');
  assert.equal((await adapter.executePrimary('contract-device')).reason, 'action-in-flight');
  assert.equal((await adapter.executeAction('contract-off', 'contract-device')).reason, 'device-busy');
  release();
  await pending;
});

test('native panel action resolves through guarded HA service only', async t => {
  const { adapter, hass } = setup(t);
  adapter.setHass(hass);
  assert.deepEqual(await adapter.executeAction('contract-off', 'contract-device'), { ok: true, status: 'sent' });
  assert.equal(hass.calls[0].service, 'turn_off');
});

test('script discovery is used and script registry changes disable stale proof', async t => {
  const { adapter, hass, configuration } = setup(t);
  configuration.actions['contract-on'] = {
    domain: 'script',
    service: 'turn_on',
    target: { entity_id: 'script.contract_script' },
  };
  hass.states['script.contract_script'] = { state: 'off', attributes: {}, last_updated: '2026-01-01T00:00:00Z' };
  adapter.configure(configuration);
  adapter.setHass(hass);
  assert.equal(adapter.getActionAvailability('contract-on').available, true);
  assert.equal((await adapter.executePrimary('contract-device')).ok, true);
  delete hass.services.script.contract_script;
  adapter.setHass({ ...hass });
  assert.equal(adapter.getActionAvailability('contract-on').available, false);
});

test('observer failures and mutation cannot turn an accepted service into failure', async t => {
  const { adapter, hass } = setup(t);
  adapter.setHass(hass);
  let delivered = 0;
  const stop = adapter.subscribe(() => {
    throw new Error('render failed');
  });
  adapter.subscribe(snapshot => {
    delivered++;
    snapshot.states['contract-device'].confidence = 'error';
  });
  assert.deepEqual(await adapter.executePrimary('contract-device'), { ok: true, status: 'sent' });
  assert.equal(delivered, 2);
  assert.equal(state(adapter).confidence, 'sent');
  assert.equal(adapter.lastObserverError, 'render failed');
  stop();
});

test('completion subscribers see actions unlocked once for accepted and rejected calls', async t => {
  for (const rejected of [false, true]) {
    const { adapter, hass } = setup(t);
    if (rejected)
      hass.callService = async () => {
        throw new Error('service rejected');
      };
    adapter.setHass(hass);
    const seen = [];
    adapter.subscribe(snapshot => {
      seen.push({
        confidence: snapshot.states['contract-device'].confidence,
        availability: adapter.getActionAvailability('contract-on'),
      });
    });
    const result = await adapter.executePrimary('contract-device');
    assert.equal(result.ok, !rejected);
    assert.equal(seen.length, 2, 'initial snapshot and one completion notification');
    assert.deepEqual(seen[1], {
      confidence: rejected ? 'error' : 'sent',
      availability: { available: true },
    });
  }
});

test('dispose clears commands, event listeners and ignores delayed service response', async t => {
  const { adapter, hass, events } = setup(t);
  adapter.setHass(hass);
  let release;
  hass.callService = () =>
    new Promise(resolve => {
      release = resolve;
    });
  const pending = adapter.executePrimary('contract-device');
  adapter.dispose();
  events.dispatchEvent(new Event('ready'));
  release();
  assert.deepEqual(await pending, { ok: false, reason: 'stale-context' });
  assert.equal((await adapter.executePrimary('contract-device')).reason, 'adapter-disposed');
  assert.throws(() => adapter.setHass(hass), /disposed/);
  assert.equal(state(adapter).command, null);
});

test('unrelated HA churn does not republish; relevant changes and reconnects do', t => {
  const { adapter, hass, events } = setup(t);
  const published = [];
  adapter.subscribe(snapshot => published.push(snapshot));
  adapter.setHass(hass);
  const baseline = published.length;
  // HA hands out a new hass object for every state change anywhere in the installation.
  for (let i = 0; i < 50; i++)
    adapter.setHass({
      ...hass,
      states: {
        ...hass.states,
        [`sensor.unrelated_${i}`]: { state: String(i), attributes: {}, last_updated: '2026-01-01T00:00:01.000Z' },
      },
    });
  assert.equal(published.length, baseline);
  const changed = {
    ...hass,
    states: {
      ...hass.states,
      'sensor.contract_feedback': { state: '12', last_updated: '2026-01-01T00:00:10.000Z', attributes: {} },
    },
  };
  adapter.setHass(changed);
  assert.equal(published.length, baseline + 1);
  assert.equal(published.at(-1).states['contract-device'].value, '12');
  // A connection reset clears the runtime; the next identical hass must still republish fresh state.
  events.dispatchEvent(new Event('ready'));
  assert.equal(published.at(-1).states['contract-device'].confidence, 'unknown');
  adapter.setHass(changed);
  assert.equal(published.at(-1).states['contract-device'].value, '12');
  assert.equal(adapter.getActionAvailability('contract-on').available, true);
});
