import test from 'node:test';
import assert from 'node:assert/strict';
import { historyPoints, downsample, rowNumbers } from '../../.work/integration/history.js';

test('a chart reads the numbers of its reading, its attribute, and at most sixty points', async () => {
  assert.deepEqual(rowNumbers([{ s: '21.5' }, { s: 'unavailable' }, { s: 22 }]), [21.5, 22]);
  assert.deepEqual(rowNumbers([{ a: { power: 10 } }, { a: {} }], 'power'), [10]);
  const long = Array.from({ length: 600 }, (_, i) => i);
  const short = downsample(long);
  assert.equal(short.length, 60);
  assert.ok(short[0] < short[59]);
  const asked = [];
  const hass = {
    callWS: async message => {
      asked.push(message);
      return { 'sensor.synthetic_power': [{ s: '1' }, { s: '2' }] };
    },
  };
  assert.deepEqual(await historyPoints(hass, 'sensor.synthetic_power', '7d'), [1, 2]);
  assert.equal(asked[0].type, 'history/history_during_period');
  assert.deepEqual(asked[0].entity_ids, ['sensor.synthetic_power']);
  // Asked again within a minute: the same answer, no second request.
  await historyPoints(hass, 'sensor.synthetic_power', '7d');
  assert.equal(asked.length, 1);
  assert.deepEqual(await historyPoints(undefined, 'sensor.synthetic_power'), []);
});
