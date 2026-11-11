import test from 'node:test';
import assert from 'node:assert/strict';
import { mapLayout } from '../../.work/model/control-layout.js';

test('a design carried to another remote finds its buttons by name and leaves out what it cannot', () => {
  const from = [
    { id: 'a1', name: 'Encender' },
    { id: 'a2', name: 'Vol +' },
    { id: 'a3', name: 'Vol −' },
    { id: 'a4', name: 'Arriba' },
  ];
  const to = [
    { id: 'b1', name: 'encender' },
    { id: 'b2', name: 'Vol +' },
    { id: 'b4', name: 'Arriba' },
  ];
  const base = { x: 0, y: 0, w: 1, h: 1, label: null, icon: null };
  const { layout, left } = mapLayout(
    [
      { ...base, id: 'power', type: 'button', buttons: ['a1'], hold: 'other', holdButton: 'a3' },
      { ...base, id: 'vol', type: 'updown', buttons: ['a3', 'a2'] },
      { ...base, id: 'pad', type: 'dpad', buttons: ['a4', 'a3'], slots: { up: 'a4', down: 'a3' } },
      { ...base, id: 'title', type: 'title', buttons: [], label: 'TV' },
    ],
    from,
    to,
  );
  assert.equal(left, 1);
  assert.deepEqual(
    layout.map(piece => piece.id),
    ['power', 'pad', 'title'],
  );
  assert.deepEqual(layout[0].buttons, ['b1']);
  assert.equal(layout[0].hold, undefined);
  assert.deepEqual(layout[1].slots, { up: 'b4' });
  assert.deepEqual(layout[1].buttons, ['b4']);
});
