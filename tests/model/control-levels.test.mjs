import test from 'node:test';
import assert from 'node:assert/strict';
import { formsFor, levelSends, stepLevel } from '../../.work/model/control-layout.js';

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

test('level forms are offered only to pieces that have levels to show', () => {
  const plain = { type: 'updown', buttons: ['down', 'up'], w: 1, h: 4 };
  assert.deepEqual(formsFor(plain), ['pair']);
  assert.deepEqual(formsFor({ ...plain, values: { min: 1, max: 6, step: 1 } }), ['pair', 'bars']);
  assert.deepEqual(formsFor({ type: 'slider', buttons: ['a', 'b'] }), ['fader', 'bars', 'thermo', 'window']);
  assert.deepEqual(formsFor({ type: 'slider', buttons: ['down', 'up'], sendBy: 'updown' }), ['fader']);
  assert.deepEqual(formsFor({ type: 'steps', buttons: ['a', 'b', 'c'] }), ['bars']);
  assert.deepEqual(formsFor({ type: 'modes', buttons: ['a', 'b'] }), ['segment', 'bars']);
  assert.deepEqual(formsFor({ type: 'button', buttons: ['a'] }), ['round', 'square', 'pill', 'icon']);
});
