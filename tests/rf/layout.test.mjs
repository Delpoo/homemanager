import test from 'node:test';
import assert from 'node:assert/strict';
import { add, defaultLayout, freeSpot, overlaps, place, rows } from '../../.work/rf/layout.js';

const button = (id, name = id) => ({ id, name, icon: null, fingerprint: '00000000' });
const widget = (id, x, y, w = 1, h = 1) => ({ id, type: 'button', x, y, w, h, buttons: [id], label: null, icon: null });

test('the default drawing puts each part first and every other button after', () => {
  const remote = {
    buttons: ['off', 'v1', 'v2', 'v3', 'dir', 'luz', 'luz-off', '1h', '4h'].map(id => button(id)),
    parts: [
      {
        id: 'fan',
        name: 'Ventilador',
        kind: 'fan',
        speeds: null,
        roles: { off: 'off', speed_1: 'v1', speed_2: 'v2', speed_3: 'v3', direction: 'dir' },
      },
      { id: 'luz', name: 'Luz', kind: 'light', speeds: null, roles: { toggle: 'luz', off: 'luz-off' } },
    ],
  };
  const layout = defaultLayout(remote);
  assert.deepEqual(
    layout.map(item => [item.type, item.buttons, item.x, item.y, item.w]),
    [
      ['button', ['off'], 0, 0, 1],
      ['steps', ['v1', 'v2', 'v3'], 0, 1, 4],
      ['button', ['dir'], 1, 0, 1],
      ['toggle', ['luz', 'luz-off'], 2, 0, 2],
      ['button', ['1h'], 0, 2, 1],
      ['button', ['4h'], 1, 2, 1],
    ],
  );
  // Every button appears once and nothing overlaps.
  assert.equal(new Set(layout.flatMap(item => item.buttons)).size, 9);
  for (const a of layout) for (const b of layout) if (a !== b) assert.equal(overlaps(a, b), false);
});

test('a fan with only faster/slower gets a minus/plus pair', () => {
  const layout = defaultLayout({
    buttons: [button('power'), button('up'), button('down')],
    parts: [
      {
        id: 'fan',
        name: 'Techo',
        kind: 'fan',
        speeds: 4,
        roles: { toggle: 'power', speed_up: 'up', speed_down: 'down' },
      },
    ],
  });
  assert.deepEqual(
    layout.map(item => [item.type, item.buttons]),
    [
      ['toggle', ['power']],
      ['updown', ['down', 'up']],
    ],
  );
});

test('placing a widget pushes the ones it covers down and keeps it in the grid', () => {
  const layout = [widget('a', 0, 0), widget('b', 1, 0), widget('c', 1, 1)];
  const moved = place(layout, 'a', { x: 1, y: 0 });
  assert.deepEqual(
    moved.map(item => [item.id, item.x, item.y]),
    [
      ['a', 1, 0],
      ['b', 1, 1],
      ['c', 1, 2],
    ],
  );
  // Resizing beyond the grid is clamped: four columns, three rows high at most.
  const wide = place(layout, 'a', { w: 9, h: 9 });
  assert.deepEqual([wide[0].w, wide[0].h], [4, 3]);
  assert.deepEqual(
    wide.slice(1).map(item => item.y),
    [3, 4],
  );
  assert.equal(rows(wide), 5);
  // Unknown ids change nothing.
  assert.equal(place(layout, 'missing', { x: 2 }), layout);
});

test('new widgets go to the first free spot that fits', () => {
  const layout = [widget('a', 0, 0, 2), widget('b', 3, 0)];
  assert.deepEqual(freeSpot(layout, 1, 1), { x: 2, y: 0 });
  assert.deepEqual(freeSpot(layout, 2, 1), { x: 0, y: 1 });
  const added = add(layout, { id: 'c', type: 'button', w: 1, h: 1, buttons: ['c'], label: null, icon: null });
  assert.deepEqual([added[2].x, added[2].y], [2, 0]);
});
