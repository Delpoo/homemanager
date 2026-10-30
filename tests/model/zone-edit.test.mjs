import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_ROOM_RECTS } from '../../src/ha/validation.mjs';
import {
  MAX_RECTS,
  addRect,
  addZone,
  applyDraft,
  deviceMoves,
  mergeZones,
  newZoneId,
  removeRect,
  removeZone,
  renameZone,
  snapRect,
  startDraft,
  updateRect,
  zoneAt,
} from '../../.work/model/zone-edit.js';

const left = { x: 0, y: 0, width: 0.5, height: 1 };
const right = { x: 0.5, y: 0, width: 0.5, height: 0.5 };
const corner = { x: 0.5, y: 0.5, width: 0.5, height: 0.5 };
const device = (id, roomId, x, y) => ({ id, roomId, position: { x, y }, display: { label: `Dispositivo ${id}` } });
const plan = () => ({
  rooms: [
    { id: 'living', label: 'Living', shape: left, shapeSource: 'app' },
    { id: 'kitchen', label: 'Cocina', icon: 'mdi:pot-steam' },
    { id: 'office', label: 'Oficina', shape: corner, shapeSource: 'svg' },
    { id: 'old', label: 'Pasillo' },
  ],
  catalog: {
    devices: [
      device('sofa', 'living', 0.2, 0.2),
      device('oven', 'kitchen', 0.7, 0.2),
      device('desk', 'office', 0.7, 0.7),
    ],
  },
});
const draftOf = (config = plan()) => startDraft(config.rooms, { kitchen: right, office: corner, living: right });

test('the draft shows every space as rectangles: its own, else its zone; without either it has none yet', () => {
  const draft = startDraft(plan().rooms, {
    kitchen: right,
    office: { ...corner, rects: [corner, right] },
    living: right,
  });
  // A shape drawn in the app wins over the zone with its name.
  assert.deepEqual(draft.zones.find(zone => zone.id === 'living').rects, [left]);
  assert.deepEqual(draft.zones.find(zone => zone.id === 'kitchen').rects, [right]);
  assert.deepEqual(draft.zones.find(zone => zone.id === 'office').rects, [corner, right]);
  assert.deepEqual(draft.zones.find(zone => zone.id === 'old').rects, []);
  assert.equal(
    draft.zones.every(zone => !zone.shapeChanged && !zone.labelChanged && !zone.isNew),
    true,
  );
  assert.equal(MAX_RECTS, MAX_ROOM_RECTS);
});

test('a new zone gets a readable, unique id; names with accents are fine', () => {
  assert.equal(newZoneId('Baño Eze', []), 'bano-eze');
  assert.equal(newZoneId('Living', ['living']), 'living-2');
  assert.equal(newZoneId('   ', []), 'espacio');
  const draft = addZone(draftOf(), 'Living', right, ['living']);
  const zone = draft.zones.at(-1);
  assert.equal(zone.id, 'living-2');
  assert.equal(zone.isNew, true);
  assert.deepEqual(zone.rects, [right]);
});

test('adding merges into one zone, up to the limit; rectangles move and go; nothing mutates', () => {
  const start = draftOf();
  const snapshot = structuredClone(start);
  const two = addRect(start, 'living', right);
  assert.deepEqual(two.zones.find(zone => zone.id === 'living').rects, [left, right]);
  assert.equal(two.zones.find(zone => zone.id === 'living').shapeChanged, true);
  assert.deepEqual(start, snapshot);
  const moved = updateRect(two, 'living', 1, corner);
  assert.deepEqual(moved.zones.find(zone => zone.id === 'living').rects, [left, corner]);
  assert.deepEqual(removeRect(moved, 'living', 0).zones.find(zone => zone.id === 'living').rects, [corner]);
  let full = start;
  for (let i = 0; i < MAX_RECTS + 3; i++) full = addRect(full, 'old', right);
  assert.equal(full.zones.find(zone => zone.id === 'old').rects.length, MAX_RECTS);
  const renamed = renameZone(start, 'kitchen', 'Cocina nueva');
  assert.equal(renamed.zones.find(zone => zone.id === 'kitchen').label, 'Cocina nueva');
  assert.equal(renamed.zones.find(zone => zone.id === 'kitchen').shapeChanged, false);
});

test('merging makes one room of two, and its devices follow; merging in a chain still lands right', () => {
  const merged = mergeZones(draftOf(), 'kitchen', 'living');
  assert.deepEqual(merged.zones.find(zone => zone.id === 'living').rects, [left, right]);
  assert.equal(
    merged.zones.some(zone => zone.id === 'kitchen'),
    false,
  );
  assert.deepEqual(merged.merged, { kitchen: 'living' });
  assert.deepEqual(merged.removed, ['kitchen']);
  const chain = mergeZones(merged, 'living', 'office');
  assert.deepEqual(chain.merged, { kitchen: 'office', living: 'office' });
  assert.equal(mergeZones(draftOf(), 'kitchen', 'kitchen'), null);
  assert.equal(mergeZones(draftOf(), 'kitchen', 'nowhere'), null);
  let full = draftOf();
  for (let i = 0; i < MAX_RECTS - 2; i++) full = addRect(full, 'living', right);
  assert.equal(mergeZones(full, 'kitchen', 'living').zones[0].rects.length, MAX_RECTS);
  assert.equal(mergeZones(addRect(full, 'living', right), 'kitchen', 'living'), null);
});

test('edges catch nearby edges; far ones stay; moving keeps the size', () => {
  const others = [left];
  // The left edge catches the wall at 0.5, within the tolerance.
  assert.deepEqual(snapRect({ x: 0.503, y: 0.2, width: 0.2, height: 0.2 }, others, 'w'), {
    x: 0.5,
    y: 0.2,
    width: 0.203,
    height: 0.2,
  });
  assert.deepEqual(snapRect({ x: 0.503, y: 0.2, width: 0.2, height: 0.2 }, others, 'move'), {
    x: 0.5,
    y: 0.2,
    width: 0.2,
    height: 0.2,
  });
  const far = { x: 0.6, y: 0.2, width: 0.2, height: 0.2 };
  assert.deepEqual(snapRect(far, others, 'move'), far);
  assert.deepEqual(snapRect(far, [], 'se'), far);
});

test('a point belongs to the smallest zone around it', () => {
  const draft = addRect(draftOf(), 'old', { x: 0.1, y: 0.1, width: 0.1, height: 0.1 });
  assert.equal(zoneAt(draft, { x: 0.15, y: 0.15 }).id, 'old');
  assert.equal(zoneAt(draft, { x: 0.3, y: 0.3 }).id, 'living');
  assert.equal(zoneAt(startDraft([], {}), { x: 0.3, y: 0.3 }), null);
});

test('only what the edit caused moves: resized, merged and removed zones, not old mismatches', () => {
  const config = plan();
  const devices = config.catalog.devices;
  assert.deepEqual(deviceMoves(devices, draftOf(config)), []);
  // A mismatch that was already there is the diagnosis's business.
  const stale = [...devices, device('lamp', 'kitchen', 0.2, 0.8)];
  assert.deepEqual(deviceMoves(stale, draftOf(config)), []);
  // Living grows over everything and the office shrinks away from the desk. The oven stays: the
  // kitchen around it is still the smaller, more specific zone.
  const grown = updateRect(draftOf(config), 'living', 0, { x: 0, y: 0, width: 1, height: 1 });
  const moves = deviceMoves(devices, updateRect(grown, 'office', 0, { x: 0.9, y: 0.9, width: 0.1, height: 0.1 }));
  assert.deepEqual(
    moves.map(move => [move.deviceId, move.from, move.to]),
    [['desk', 'office', 'living']],
  );
  // Merged: the oven follows, though it sits in the merged rectangle anyway.
  const merged = mergeZones(draftOf(config), 'kitchen', 'living');
  assert.deepEqual(deviceMoves(devices, merged), [
    { deviceId: 'oven', label: 'Dispositivo oven', from: 'kitchen', to: 'living' },
  ]);
  // Removed: its device stays without a space, and says so.
  assert.deepEqual(deviceMoves(devices, removeZone(draftOf(config), 'office')), [
    { deviceId: 'desk', label: 'Dispositivo desk', from: 'office', to: null },
  ]);
});

test('applying writes what changed and nothing else, and no device keeps a space that is gone', () => {
  const config = plan();
  const snapshot = structuredClone(config);
  const part = { x: 0, y: 0, width: 0.2, height: 0.2 };
  let draft = addRect(draftOf(config), 'living', part);
  draft = renameZone(draft, 'kitchen', 'Cocina nueva');
  draft = addZone(
    draft,
    'Baño Eze',
    corner,
    config.rooms.map(room => room.id),
  );
  draft = removeZone(draft, 'old');
  draft = removeZone(draft, 'office');
  const next = applyDraft(config, draft, []);
  assert.deepEqual(config, snapshot);
  assert.deepEqual(
    next.rooms.map(room => room.id),
    ['living', 'kitchen', 'bano-eze'],
  );
  const living = next.rooms[0];
  assert.deepEqual(living.rects, [left, part]);
  assert.deepEqual(living.shape, left);
  assert.equal(living.shapeSource, 'app');
  // A rename alone does not make a zone stop following the SVG, nor invent a shape.
  assert.deepEqual(next.rooms[1], { id: 'kitchen', label: 'Cocina nueva', icon: 'mdi:pot-steam' });
  assert.equal(next.rooms[2].id, 'bano-eze');
  assert.equal(next.rooms[2].label, 'Baño Eze');
  assert.deepEqual(next.rooms[2].shape, corner);
  assert.equal(next.rooms[2].shapeSource, 'app');
  assert.equal(typeof next.rooms[2].icon, 'string');
  // Its space is gone, even without a chosen move.
  assert.equal(next.catalog.devices.find(item => item.id === 'desk').roomId, null);
  assert.equal(next.catalog.devices.length, 3);
});

test('moves apply as chosen; a zone left with no rectangles goes back to having no shape', () => {
  const config = plan();
  const merged = mergeZones(draftOf(config), 'kitchen', 'living');
  const next = applyDraft(config, merged, []);
  // Not chosen, but its space merged: it follows.
  assert.equal(next.catalog.devices.find(item => item.id === 'oven').roomId, 'living');
  const moved = applyDraft(config, draftOf(config), [{ deviceId: 'sofa', label: '', from: 'living', to: 'office' }]);
  assert.equal(moved.catalog.devices.find(item => item.id === 'sofa').roomId, 'office');
  const empty = applyDraft(config, removeRect(draftOf(config), 'living', 0), []);
  assert.deepEqual(empty.rooms[0], { id: 'living', label: 'Living' });
});

test('a new zone takes its ID from its final name, and devices follow it', () => {
  const config = plan();
  let draft = addZone(draftOf(config), 'Zona 5', { x: 0.1, y: 0.1, width: 0.2, height: 0.2 }, ['living']);
  const provisional = draft.zones.at(-1).id;
  draft = renameZone(draft, provisional, '  Baño Linda ');
  const moves = deviceMoves(config.catalog.devices, draft);
  assert.deepEqual(
    moves.map(move => [move.deviceId, move.from, move.to]),
    [['sofa', 'living', provisional]],
  );
  const next = applyDraft(config, draft, moves);
  assert.equal(next.rooms.at(-1).id, 'bano-linda');
  assert.equal(next.rooms.at(-1).label, 'Baño Linda');
  assert.equal(next.catalog.devices.find(item => item.id === 'sofa').roomId, 'bano-linda');
  // A removed space's ID is not reused: its devices must not silently adopt the new zone.
  const again = renameZone(addZone(removeZone(draftOf(config), 'office'), 'Zona', corner, []), 'zona', 'Oficina');
  const reused = applyDraft(config, again, []);
  assert.equal(reused.rooms.at(-1).id.startsWith('oficina'), true);
  const named = renameZone(addZone(removeZone(draftOf(config), 'office'), 'Zona', corner, []), 'zona', 'Office');
  assert.equal(applyDraft(config, named, []).rooms.at(-1).id, 'office-2');
  assert.equal(applyDraft(config, named, []).catalog.devices.find(item => item.id === 'desk').roomId, null);
});

test('a snap never leaves a rectangle below the minimum nor past the plan', () => {
  const thin = { x: 0.5, y: 0.1, width: 0.021, height: 0.2 };
  assert.deepEqual(snapRect(thin, [{ x: 0.505, y: 0, width: 0.1, height: 0.1 }], 'w'), thin);
  const rect = snapRect({ x: 0.3333335, y: 0, width: 0.6666665, height: 0.5 }, [], 'move');
  assert.equal(rect.x + rect.width <= 1, true);
});
