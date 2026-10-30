import test from 'node:test';
import assert from 'node:assert/strict';
import {
  boundsOfRects,
  dragShape,
  rectsFromCells,
  rectsOf,
  roomContains,
  unionOutline,
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

test('dragging moves or resizes a shape, never outside the plan nor below a minimum size', () => {
  const shape = { x: 0.2, y: 0.2, width: 0.3, height: 0.2 };
  assert.deepEqual(dragShape(shape, 'move', 0.1, -0.1), { x: 0.3, y: 0.1, width: 0.3, height: 0.2 });
  assert.deepEqual(dragShape(shape, 'move', 0.9, 0.9), { x: 0.7, y: 0.8, width: 0.3, height: 0.2 });
  assert.deepEqual(dragShape(shape, 'se', 0.1, 0.1), { x: 0.2, y: 0.2, width: 0.4, height: 0.3 });
  assert.deepEqual(dragShape(shape, 'nw', -0.5, -0.5), { x: 0, y: 0, width: 0.5, height: 0.4 });
  assert.deepEqual(dragShape(shape, 'e', -1, 0), { x: 0.2, y: 0.2, width: 0.02, height: 0.2 });
  assert.deepEqual(dragShape(shape, 'n', 0, 0.5), { x: 0.2, y: 0.38, width: 0.3, height: 0.02 });
  assert.deepEqual(shape, { x: 0.2, y: 0.2, width: 0.3, height: 0.2 });
});

// An L: a wide top and a narrow leg, as two merged rectangles.
const top = { x: 0.1, y: 0.1, width: 0.4, height: 0.2 };
const leg = { x: 0.1, y: 0.3, width: 0.2, height: 0.3 };

test('a zone of merged rectangles answers by its parts, not by the box around them', () => {
  const room = { id: 'living', shape: boundsOfRects([top, leg]), rects: [top, leg], shapeSource: 'app' };
  assert.deepEqual(room.shape, { x: 0.1, y: 0.1, width: 0.4, height: 0.5 });
  assert.deepEqual(rectsOf(room), [top, leg]);
  assert.deepEqual(rectsOf({ id: 'plain', shape: top }), [top]);
  assert.deepEqual(rectsOf({ id: 'none' }), []);
  assert.equal(roomContains(room, { x: 0.45, y: 0.2 }), true);
  assert.equal(roomContains(room, { x: 0.2, y: 0.5 }), true);
  // In the box, but in the hole of the L: that belongs to whoever is next door.
  assert.equal(roomContains(room, { x: 0.45, y: 0.5 }), false);
  assert.equal(roomAtPoint([room], { x: 0.45, y: 0.5 }, [], new Set()), null);
  assert.equal(roomAtPoint([room], { x: 0.2, y: 0.5 }, [], new Set()), 'living');
  // The area that decides between overlapping spaces is the real one.
  const box = { id: 'box', shape: { x: 0.1, y: 0.1, width: 0.4, height: 0.5 }, shapeSource: 'app' };
  assert.equal(roomAtPoint([box, room], { x: 0.2, y: 0.2 }, [], new Set()), 'living');
});

test('the outline of an L has no seam between its rectangles', () => {
  const segments = unionOutline([top, leg]);
  const inside = segments.filter(([a, b]) => {
    const middle = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    return Math.abs(middle.y - 0.3) < 1e-9 && middle.x > 0.1 && middle.x < 0.3;
  });
  assert.deepEqual(inside, []);
  // The exposed part of that same line, under the top's overhang, is still there.
  assert.ok(segments.some(([a, b]) => Math.abs(a.y - 0.3) < 1e-9 && Math.abs(b.y - 0.3) < 1e-9 && a.x >= 0.3 - 1e-9));
  assert.deepEqual(unionOutline([]), []);
  assert.equal(unionOutline([{ x: 0, y: 0, width: 1, height: 1 }]).length, 4);
});

test('filled cells become as few rectangles as their rows allow', () => {
  const X = true,
    _ = false;
  assert.deepEqual(
    rectsFromCells([
      [X, X, X, X],
      [X, X, X, X],
      [X, X, _, _],
      [X, X, _, _],
    ]),
    [
      { x: 0, y: 0, width: 4, height: 2 },
      { x: 0, y: 2, width: 2, height: 2 },
    ],
  );
  assert.deepEqual(
    rectsFromCells([
      [X, X],
      [X, X],
    ]),
    [{ x: 0, y: 0, width: 2, height: 2 }],
  );
  assert.deepEqual(rectsFromCells([[_, _]]), []);
  // Two runs on one row stay apart.
  assert.equal(rectsFromCells([[X, _, X]]).length, 2);
});

test('an import copies a zone with its parts, and a plain zone drops the parts it had', () => {
  const zone = { ...boundsOfRects([top, leg]), rects: [top, leg] };
  const [copied] = withZoneShapes([{ id: 'living', label: 'Living' }], { living: zone });
  assert.deepEqual(copied.shape, { x: 0.1, y: 0.1, width: 0.4, height: 0.5 });
  assert.deepEqual(copied.rects, [top, leg]);
  assert.equal(copied.shapeSource, 'svg');
  const [plain] = withZoneShapes([copied], { living: { x: 0, y: 0, width: 0.5, height: 0.5 } });
  assert.equal('rects' in plain, false);
  // A zone drawn in the app keeps its parts.
  const drawn = { id: 'living', shape: zone, rects: [top, leg], shapeSource: 'app' };
  assert.deepEqual(withZoneShapes([drawn], { living: { x: 0, y: 0, width: 1, height: 1 } })[0], drawn);
});
