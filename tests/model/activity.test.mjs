import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ActivityLog,
  COMMAND_TEXT,
  reduceActivity,
  latestActivity,
  activityIsRecent,
} from '../../.work/model/activity.js';
import { now } from './fixtures.mjs';
const command = (status, at = now, extra = {}) => ({
  type: 'command',
  commandId: 'test-command',
  deviceId: 'test-device',
  deviceLabel: 'Test light',
  actionLabel: 'Turn on',
  status,
  at,
  ...extra,
});
const evidence = {
  feedback: 'measured',
  verified: true,
  observedAt: new Date(now + 200).toISOString(),
  baselineLastUpdated: new Date(now - 100).toISOString(),
};

test('activity uses the exact product vocabulary without substitute status words', () => {
  assert.deepEqual(COMMAND_TEXT, {
    sent: 'Enviado',
    on_air: 'en el aire',
    confirmed: 'confirmado',
    error: 'No se pudo enviar',
  });
});

test('a command updates its original history row and cannot regress after confirmation', () => {
  let entries = reduceActivity([], command('sent'));
  entries = reduceActivity(entries, { type: 'saved', id: 'test-save', at: now + 1 });
  entries = reduceActivity(entries, command('on_air', now + 100));
  assert.equal(entries.length, 2);
  assert.equal(entries[0].message, 'en el aire');
  assert.equal(entries[0].at, now);
  assert.equal(latestActivity(entries).id, entries[0].id);
  entries = reduceActivity(entries, command('confirmed', now + 200, { evidence }));
  assert.equal(entries[0].message, 'confirmado');
  assert.equal(entries[0].tone, 'ok');
  const after = reduceActivity(entries, command('on_air', now + 300));
  assert.deepEqual(after, entries);
});

test('RF, optimistic, stale, future or unverified feedback cannot confirm a command', () => {
  const entries = reduceActivity([], command('sent'));
  for (const proof of [
    undefined,
    { ...evidence, feedback: 'transmitter' },
    { ...evidence, feedback: 'optimistic' },
    { ...evidence, verified: false },
    { ...evidence, observedAt: new Date(now).toISOString() },
    { ...evidence, observedAt: new Date(now + 1000).toISOString() },
    { ...evidence, observedAt: 'invalid' },
    { ...evidence, baselineLastUpdated: new Date(now + 500).toISOString() },
  ]) {
    assert.deepEqual(reduceActivity(entries, command('confirmed', now + 300, { evidence: proof })), entries);
  }
  assert.deepEqual(reduceActivity([], command('confirmed', now + 300, { evidence })), []);
  assert.deepEqual(reduceActivity([], command('on_air')), []);
});

test('TTL leaves an unconfirmed send as Enviado, and a service error is terminal', () => {
  let entries = reduceActivity([], command('sent'));
  entries = reduceActivity(entries, {
    type: 'expired',
    commandId: 'test-command',
    deviceId: 'test-device',
    at: now + 1000,
  });
  assert.equal(entries[0].expired, true);
  assert.equal(entries[0].message, 'Enviado');
  assert.deepEqual(reduceActivity(entries, command('confirmed', now + 1200, { evidence })), entries);
  entries = reduceActivity([], command('error', now, { detail: 'test failure' }));
  assert.equal(entries[0].message, 'No se pudo enviar');
  assert.equal(entries[0].tone, 'alert');
  assert.deepEqual(reduceActivity(entries, command('confirmed', now + 200, { evidence })), entries);
});

test('state observations, alerts, resolutions and saves remain separate from confirmation', () => {
  const log = new ActivityLog();
  log.record({ type: 'state', entityId: 'sensor.test_value', value: '42', at: now });
  log.record({ type: 'alert', alertId: 'test-leak', message: 'Fuga detectada', level: 'critical', at: now + 1 });
  log.record({ type: 'resolved', alertId: 'test-leak', message: 'Fuga resuelta', at: now + 2 });
  log.record({ type: 'saved', id: 'test-save', at: now + 3 });
  assert.equal(log.entries.length, 4);
  assert.equal(log.entries[0].status, undefined);
  assert.equal(log.entries[1].tone, 'alert');
  assert.equal(log.entries[2].tone, 'ok');
  assert.equal(log.latest.message, 'Plano guardado');
});

test('history bounds at fifty, older entries drop, and subscriptions cannot mutate log state', () => {
  const log = new ActivityLog();
  let delivered = 0;
  const stop = log.subscribe(entries => {
    delivered++;
    if (entries[0]) entries[0].message = 'changed by view';
  });
  for (let i = 0; i < 55; i++) log.record(command('sent', now + i, { commandId: `test-command-${i}` }));
  assert.equal(log.entries.length, 50);
  assert.equal(log.entries[0].id, 'command:test-device:test-command-5');
  assert.equal(log.entries[0].message, 'Enviado');
  assert.equal(delivered, 56);
  stop();
  log.record({ type: 'saved', id: 'unobserved', at: now + 100 });
  assert.equal(delivered, 56);
});

test('six-second presentation is deterministic and reducers never mutate their input', () => {
  const event = command('sent');
  const entries = reduceActivity([], event);
  const before = structuredClone(entries);
  reduceActivity(entries, command('on_air', now + 100));
  assert.deepEqual(entries, before);
  assert.equal(activityIsRecent(entries[0], now + 5999), true);
  assert.equal(activityIsRecent(entries[0], now + 6000), false);
  assert.equal(activityIsRecent(entries[0], now - 1), false);
});
