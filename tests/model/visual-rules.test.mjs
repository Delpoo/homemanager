import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateVisualRules, promoteLegacyRule } from '../../.work/model/visual-rules.js';
import { alertsOf } from '../../.work/model/alerts.js';
import { RuntimeFeed } from '../../.work/shell/runtime-feed.js';
import { ActivityLog } from '../../.work/model/activity.js';
const rule = (overrides = {}) => ({
  id: 'rule',
  name: 'Custom condition',
  enabled: true,
  sources: [{ reading: 'sensor.sample', deviceId: 'sample' }],
  symbols: [],
  level: 'warning',
  below: 27,
  ...overrides,
});
const hass = () => ({
  connection: { connected: true },
  states: { 'sensor.sample': { state: '18', attributes: {}, last_changed: '2000-01-01T00:00:00Z' } },
  entities: { 'sensor.sample': { device_id: 'sample' } },
});
test('groups match any explicit verified source and zero symbols still produce a visible result', () => {
  const r = rule(),
    h = hass(),
    before = structuredClone({ r, h });
  assert.equal(evaluateVisualRules([r], [], h, 1000).results[0].rule.name, r.name);
  assert.deepEqual({ r, h }, before);
  r.sources.push({ reading: 'sensor.other' });
  h.states['sensor.sample'].state = '50';
  h.states['sensor.other'] = { state: '10', attributes: {} };
  assert.equal(evaluateVisualRules([r], [], h, 1000).results.length, 1);
});
test('unknown, disconnected, nonnumeric and reassociated readings never fire', () => {
  const r = rule();
  for (const state of ['unknown', 'unavailable', 'oops', '']) {
    const h = hass();
    h.states['sensor.sample'].state = state;
    assert.equal(evaluateVisualRules([r], [], h, 1000).results.length, 0);
  }
  const h = hass();
  h.connection.connected = false;
  assert.equal(evaluateVisualRules([r], [], h, 1000).results.length, 0);
  h.connection.connected = true;
  h.entities['sensor.sample'].device_id = 'unrelated';
  assert.equal(evaluateVisualRules([r], [], h, 1000).results.length, 0);
});
test('duration is continuous session evidence; reload does not borrow old last_changed', () => {
  const r = rule({ forMinutes: 1 }),
    h = hass();
  const first = evaluateVisualRules([r], [], h, 1000);
  assert.equal(first.results.length, 0);
  assert.equal(evaluateVisualRules([r], [], h, 61000, first.context).results.length, 1);
  assert.equal(evaluateVisualRules([r], [], h, 61000).results.length, 0);
  h.states['sensor.sample'].state = 'unknown';
  const lost = evaluateVisualRules([r], [], h, 62000, first.context);
  assert.deepEqual(lost.context, {});
});
test('off conditions, disabled rules and indicators do not require a category', () => {
  const h = hass();
  h.states['binary_sensor.sample'] = { state: 'off', attributes: {} };
  const r = rule({
    sources: [{ reading: 'binary_sensor.sample' }],
    below: undefined,
    state: 'off',
    level: 'indicator',
  });
  assert.equal(evaluateVisualRules([r], [], h, 0).results.length, 1);
  r.enabled = false;
  assert.equal(evaluateVisualRules([r], [], h, 0).results.length, 0);
});
test('base alerts are individually disabled without removing old configured alert levels', () => {
  const d = {
    id: 'leak',
    roomId: null,
    kind: 'sensor',
    display: { label: 'Leak', icon: 'mdi:water', disabledBaseRules: ['safety'] },
    bindings: { entityId: 'binary_sensor.leak' },
  };
  const h = { states: { 'binary_sensor.leak': { state: 'on', attributes: { device_class: 'moisture' } } } };
  assert.deepEqual(alertsOf(d, h, 0), []);
  d.display.alerts = [{ reading: 'binary_sensor.leak', level: 'warning' }];
  assert.equal(alertsOf(d, h, 0)[0].level, 'warning');
  d.display.alerts[0].enabled = false;
  assert.deepEqual(alertsOf(d, h, 0), []);
});
test('a rule without symbols reaches the shared activity feed without calling any commands', () => {
  const log = new ActivityLog(),
    feed = new RuntimeFeed(log),
    h = hass();
  let calls = 0;
  h.callService = () => {
    calls++;
    throw Error('must not send');
  };
  feed.configure({
    schemaVersion: 2,
    rooms: [],
    catalog: { schemaVersion: 2, devices: [] },
    rules: [rule()],
    actions: {},
    panels: {},
    stateSources: {},
  });
  feed.update(h, { states: {} }, new Set(), 1000);
  assert.equal(feed.alerts.length, 1);
  assert.equal(log.entries.at(-1).message, 'Custom condition');
  assert.equal(calls, 0);
});

test('disconnect discards duration evidence before reconnect', () => {
  const feed = new RuntimeFeed(new ActivityLog()),
    h = hass();
  feed.configure({
    schemaVersion: 2,
    rooms: [],
    catalog: { schemaVersion: 2, devices: [] },
    rules: [rule({ forMinutes: 1 })],
    actions: {},
    panels: {},
    stateSources: {},
  });
  feed.update(h, { states: {} }, new Set(), 1000);
  h.connection.connected = false;
  feed.update(h, { states: {} }, new Set(), 2000);
  h.connection.connected = true;
  feed.update(h, { states: {} }, new Set(), 70000);
  assert.equal(feed.ruleResults.length, 0);
  feed.update(h, { states: {} }, new Set(), 130000);
  assert.equal(feed.ruleResults.length, 1);
});

test('promoting two legacy rules keeps both IDs unique and preserves binary warning override', () => {
  const legacy = { reading: 'binary_sensor.sample', level: 'warning' };
  const config = {
    schemaVersion: 2,
    rooms: [],
    catalog: {
      schemaVersion: 2,
      devices: [
        {
          id: 'sample',
          roomId: null,
          kind: 'sensor',
          display: { label: 'Sample', icon: 'mdi:shape', alerts: [legacy, structuredClone(legacy)] },
          bindings: { entityId: 'binary_sensor.sample', primaryAction: null, advancedPopupId: null },
        },
      ],
    },
    rules: [],
  };
  const original = structuredClone(config),
    r = rule({
      id: 'legacy-sample-0',
      sources: [{ reading: 'binary_sensor.sample' }],
      below: undefined,
      state: 'on',
      symbols: ['sample'],
    });
  const first = promoteLegacyRule(config, 'sample', 0, r),
    second = promoteLegacyRule(first, 'sample', 0, r);
  assert.equal(new Set(second.rules.map(r => r.id)).size, 2);
  assert.ok(second.rules.every(r => r.level === 'warning'));
  assert.deepEqual(second.catalog.devices[0].display.alerts, []);
  assert.deepEqual(second.catalog.devices[0].display.disabledBaseRules, ['safety']);
  assert.deepEqual(config, original);
});
