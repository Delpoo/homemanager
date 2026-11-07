import test from 'node:test';
import assert from 'node:assert/strict';
import { levelSends, stepLevel } from '../../.work/model/control-layout.js';

test('wrapped level keys keep their send direction; direct selection sends every required step', () => {
  for (const count of [2, 3, 5]) {
    const piece = {
      type: 'updown',
      buttons: ['down', 'up'],
      values: { min: 1, max: count, step: 1 },
      wrap: true,
    };
    assert.deepEqual(levelSends(piece, count - 1, stepLevel(piece, count - 1, 1), 1), ['up']);
    assert.deepEqual(levelSends(piece, 0, stepLevel(piece, 0, -1), -1), ['down']);
    assert.deepEqual(levelSends(piece, 0, count - 1), Array(count - 1).fill('up'));
    assert.deepEqual(levelSends(piece, count - 1, 0), Array(count - 1).fill('down'));
  }
});
