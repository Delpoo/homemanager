import test from 'node:test';
import assert from 'node:assert/strict';
import {
  angleGap,
  exitPoint,
  navTargets,
  pullOf,
  roomInView,
  sharesWall,
  swipeTarget,
  targetToward,
} from '../../.work/model/room-nav.js';

// The invented plan of the mockup, in plan coordinates.
const rect = (x1, y1, x2, y2) => ({ x: x1, y: y1, width: x2 - x1, height: y2 - y1 });
const rooms = [
  { id: 'living', bounds: rect(20, 20, 290, 380) },
  { id: 'kitchen', bounds: rect(290, 20, 440, 170) },
  { id: 'bedroom', bounds: rect(440, 20, 580, 230) },
  { id: 'bath', bounds: rect(290, 170, 440, 280) },
  { id: 'laundry', bounds: rect(440, 230, 580, 310) },
  { id: 'office', bounds: rect(290, 280, 440, 380) },
  { id: 'balcony', bounds: rect(440, 310, 580, 380) },
];
const room = id => rooms.find(item => item.id === id);
const deg = radians => Math.round((radians * 180) / Math.PI);

test('from the kitchen: one arrow per reachable room, the nearer wins within 20°, diagonals included', () => {
  const targets = navTargets(room('kitchen'), rooms);
  assert.deepEqual(
    targets.map(target => target.id),
    ['bath', 'bedroom', 'laundry', 'living'],
  );
  // Office is behind bath and balcony behind laundry: reached past them, not drawn.
  const bath = targets.find(target => target.id === 'bath');
  assert.equal(deg(bath.angle), 90);
  assert.equal(bath.sharesWall, true);
  assert.equal(targets.find(target => target.id === 'laundry').sharesWall, false);
  // Nearest at full size, farthest at 70 % and half opacity.
  assert.equal(targets[0].scale, 1);
  assert.equal(targets[0].opacity, 1);
  assert.equal(targets.at(-1).scale, 0.7);
  assert.equal(targets.at(-1).opacity, 0.5);
  assert.ok(targets.every(target => target.scale >= 0.7 && target.scale <= 1));
});

test('skipped and hidden rooms get no arrow, and a room behind them shows up', () => {
  const skipped = rooms.map(item => (item.id === 'bath' ? { ...item, skip: true } : item));
  const ids = navTargets(room('kitchen'), skipped).map(target => target.id);
  assert.ok(!ids.includes('bath'));
  assert.ok(ids.includes('office'));
  assert.ok(!navTargets(room('kitchen'), rooms, ['living']).some(target => target.id === 'living'));
  assert.ok(navTargets(room('kitchen'), rooms).length <= 8);
});

test('the arrow sits just outside the edge, on the ray to the target centre', () => {
  const kitchen = room('kitchen').bounds;
  assert.deepEqual(exitPoint(kitchen, Math.PI / 2, 10), { x: 365, y: 180 });
  const right = exitPoint(kitchen, 0, 10);
  assert.equal(right.x, 450);
  const diagonal = exitPoint(kitchen, Math.PI / 4, 0);
  assert.ok(Math.abs(diagonal.x - 440) < 1e-9 && Math.abs(diagonal.y - 170) < 1e-9);
});

test('a swipe pushes the plan: the finger going up travels down', () => {
  const targets = navTargets(room('kitchen'), rooms);
  assert.equal(swipeTarget(targets, { x: 0, y: -80 }), 'bath');
  assert.equal(swipeTarget(targets, { x: -80, y: 0 }), 'bedroom');
  // Nothing within 35° up: the plan bounces.
  assert.equal(swipeTarget(targets, { x: 0, y: 80 }), null);
  assert.equal(targetToward(targets, { x: 0, y: 0 }), null);
});

test('pulling an arrow back past 40 px travels; a tap or a sideways drag does not', () => {
  const down = Math.PI / 2;
  assert.deepEqual(pullOf(down, { x: 0, y: -50 }), { distance: 50, travels: true });
  assert.equal(pullOf(down, { x: 0, y: -20 }).travels, false);
  assert.equal(pullOf(down, { x: 0, y: 0 }).travels, false);
  assert.equal(pullOf(down, { x: 0, y: 60 }).travels, false);
  assert.equal(pullOf(down, { x: 60, y: -41 }).travels, false);
});

test('the room in view is the one around the centre, else the nearest', () => {
  assert.equal(roomInView(rooms, { x: 360, y: 90 }).id, 'kitchen');
  assert.equal(roomInView(rooms, { x: 600, y: 395 }).id, 'balcony');
  assert.equal(roomInView([], { x: 0, y: 0 }), null);
  assert.equal(sharesWall(room('kitchen').bounds, room('bedroom').bounds), true);
  assert.equal(sharesWall(room('kitchen').bounds, room('laundry').bounds), false);
  assert.equal(Math.round(angleGap(0.1, 2 * Math.PI - 0.1) * 100) / 100, 0.2);
});
