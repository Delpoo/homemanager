import test from 'node:test';
import assert from 'node:assert/strict';
import { layoutFromControls, readingValue, PIECE_INPUTS } from '../../.work/model/control-layout.js';
import { place, overlaps } from '../../.work/rf/layout.js';

test('reading migration retains control references and never rewrites legacy controls', () => {
  const controls = [{ id: 'speed', type: 'slider', label: 'Speed', steps: [{ actionId: 'one' }, { actionId: 'two' }] }];
  const before = structuredClone(controls);
  assert.deepEqual(layoutFromControls(controls)[0].buttons, ['speed']);
  assert.deepEqual(controls, before);
  assert.deepEqual(PIECE_INPUTS.indicator, [0, 0]);
  assert.equal(
    readingValue(
      { reading: 'sensor.test', attribute: 'percentage' },
      { 'sensor.test': { state: 'on', attributes: { percentage: 33 } } },
    ),
    '33',
  );
  assert.equal(readingValue({ reading: 'sensor.missing' }), '—');
});

test('a move that would push a full canvas beyond its bounds preserves the original layout', () => {
  const layout = Array.from({ length: 40 }, (_, y) => ({
    id: 'p-' + y,
    type: 'title',
    x: 0,
    y,
    w: 4,
    h: 1,
    buttons: [],
    label: null,
    icon: null,
  }));
  const moved = place(layout, 'p-39', { y: 0 });
  assert.equal(moved.length, layout.length);
  assert.ok(moved.every(p => p.y + p.h <= 40));
  assert.ok(moved.every((p, i) => moved.every((other, j) => i === j || !overlaps(p, other))));
  assert.deepEqual(place([...layout, { ...layout[0], id: 'overflow' }], 'p-39', { y: 0 }), [
    ...layout,
    { ...layout[0], id: 'overflow' },
  ]);
});
