import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ownsShape,
  planToShape,
  roomAtPoint,
  shapeContains,
  shapeToPlan,
  withZoneShapes,
} from '../../.work/model/room-shapes.js';

const box = { x: 10, y: 20, width: 600, height: 400 };

test('shapes are normalized to the plan, clipped to it, and round-trip to plan coordinates', () => {
  const shape = planToShape({ x: 160, y: 120, width: 150, height: 100 }, box);
  assert.deepEqual(shape, { x: 0.25, y: 0.25, width: 0.25, height: 0.25 });
  assert.deepEqual(shapeToPlan(shape, box), { x: 160, y: 120, width: 150, height: 100 });
  // A zone reaching past the drawing is clipped, never stored outside it.
  assert.deepEqual(planToShape({ x: 0, y: 0, width: 160, height: 120 }, box), {
    x: 0,
    y: 0,
    width: 0.25,
    height: 0.25,
  });
  const edge = planToShape({ x: 400, y: 300, width: 400, height: 400 }, box);
  assert.ok(edge.x + edge.width <= 1 && edge.y + edge.height <= 1);
  assert.equal(planToShape({ x: 900, y: 900, width: 10, height: 10 }, box), null);
  assert.equal(planToShape({ x: 0, y: 0, width: NaN, height: 1 }, box), null);
});

test('a point is answered by an own shape first, then by exactly one zone', () => {
  const zoneIds = new Set(['living', 'kitchen']);
  const rooms = [
    { id: 'living' },
    { id: 'kitchen' },
    { id: 'closet', shape: { x: 0.1, y: 0.1, width: 0.1, height: 0.1 }, shapeSource: 'app' },
    { id: 'lounge', shape: { x: 0, y: 0, width: 0.5, height: 0.5 }, shapeSource: 'app' },
  ];
  // A room drawn inside another wins: it is the more specific answer.
  assert.equal(roomAtPoint(rooms, { x: 0.15, y: 0.15 }, ['living'], zoneIds), 'closet');
  assert.equal(roomAtPoint(rooms, { x: 0.4, y: 0.4 }, ['living'], zoneIds), 'lounge');
  assert.equal(roomAtPoint(rooms, { x: 0.8, y: 0.8 }, ['kitchen'], zoneIds), 'kitchen');
  // Overlapping zones stay ambiguous, as in 0.8.
  assert.equal(roomAtPoint(rooms, { x: 0.8, y: 0.8 }, ['living', 'kitchen'], zoneIds), null);
  assert.equal(roomAtPoint(rooms, { x: 0.8, y: 0.8 }, [], zoneIds), null);
  // A copied shape answers only when its zone is gone.
  const copied = [{ id: 'living', shape: { x: 0, y: 0, width: 1, height: 1 }, shapeSource: 'svg' }];
  assert.equal(roomAtPoint(copied, { x: 0.5, y: 0.5 }, [], new Set(['living'])), null);
  assert.equal(roomAtPoint(copied, { x: 0.5, y: 0.5 }, [], new Set()), 'living');
  // Two equal shapes give no answer.
  const twins = [
    { id: 'a', shape: { x: 0, y: 0, width: 0.5, height: 0.5 }, shapeSource: 'app' },
    { id: 'b', shape: { x: 0, y: 0, width: 0.5, height: 0.5 }, shapeSource: 'app' },
  ];
  assert.equal(roomAtPoint(twins, { x: 0.2, y: 0.2 }, [], new Set()), null);
  assert.ok(shapeContains({ x: 0, y: 0, width: 0.5, height: 0.5 }, { x: 0.5, y: 0.5 }));
});

test('an import copies zones into spaces that follow the SVG, and never touches an edited shape', () => {
  const rooms = [
    { id: 'living', label: 'Living' },
    { id: 'kitchen', label: 'Cocina', shape: { x: 0, y: 0, width: 0.2, height: 0.2 }, shapeSource: 'svg' },
    { id: 'office', label: 'Oficina', shape: { x: 0.6, y: 0.6, width: 0.3, height: 0.3 }, shapeSource: 'app' },
    { id: 'hall', label: 'Pasillo', shape: { x: 0.4, y: 0, width: 0.1, height: 0.5 }, shapeSource: 'svg' },
  ];
  const before = structuredClone(rooms);
  const zone = { x: 0.1, y: 0.1, width: 0.3, height: 0.3 };
  const next = withZoneShapes(rooms, { living: zone, kitchen: zone, office: zone, hall: null });
  assert.deepEqual(rooms, before);
  assert.deepEqual(next[0], { id: 'living', label: 'Living', shape: zone, shapeSource: 'svg' });
  assert.deepEqual(next[1].shape, zone);
  assert.deepEqual(next[2], before[2]);
  // A zone the new plan dropped: the space keeps the copy it had.
  assert.deepEqual(next[3], before[3]);
  assert.equal(ownsShape(next[2]), true);
  assert.equal(ownsShape(next[0]), false);
});
