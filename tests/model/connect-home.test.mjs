import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CREATE_AREA,
  NO_AREA,
  areaProposals,
  isLooseEntity,
  looseEntities,
  sharedAreas,
  spreadInRoom,
  suggestAreas,
  withAreaLinks,
} from '../../.work/model/connect-home.js';

const room = (id, label, areaId) => ({ id, label, ...(areaId ? { areaId } : {}) });

test('an area is suggested by the link it has, then its very name, then the same place in another language', () => {
  const areas = { a: { name: 'Cocina' }, b: { name: 'Living room' }, c: { name: 'Kitchen' }, d: { name: 'Garage' } };
  assert.deepEqual(
    suggestAreas(
      [room('one', 'Otro nombre', 'd'), room('two', 'cocina'), room('three', 'Sala'), room('four', 'Balcón')],
      areas,
    ),
    { one: 'd', two: 'a', three: 'b', four: CREATE_AREA },
  );
  // A link to an area that is gone is not kept.
  assert.deepEqual(suggestAreas([room('one', 'Desván', 'gone')], areas), { one: CREATE_AREA });
});

test('two bathrooms and one bathroom area stay undecided: each is offered its own', () => {
  const areas = { bath: { name: 'Bathroom' } };
  assert.deepEqual(suggestAreas([room('north', 'Baño Norte'), room('south', 'Baño Sur')], areas), {
    north: CREATE_AREA,
    south: CREATE_AREA,
  });
  // One bathroom takes it.
  assert.deepEqual(suggestAreas([room('north', 'Baño Norte')], areas), { north: 'bath' });
  // The exact name wins, and the other one is left alone.
  assert.deepEqual(suggestAreas([room('north', 'Bathroom'), room('south', 'Baño Sur')], areas), {
    north: 'bath',
    south: CREATE_AREA,
  });
});

test('sharing an area is detected; creating or choosing none never counts', () => {
  assert.deepEqual(sharedAreas({ a: 'x', b: 'x', c: 'y', d: CREATE_AREA, e: CREATE_AREA, f: NO_AREA, g: NO_AREA }), [
    'x',
  ]);
  assert.deepEqual(sharedAreas({ a: 'x', b: 'y' }), []);
});

test('links are written and taken away; a space not mentioned keeps its own and nothing mutates', () => {
  const configuration = { rooms: [room('a', 'A', 'old'), room('b', 'B', 'keep'), room('c', 'C')], other: 1 };
  const snapshot = structuredClone(configuration);
  const next = withAreaLinks(configuration, { a: null, c: 'new' });
  assert.deepEqual(next.rooms, [room('a', 'A'), room('b', 'B', 'keep'), room('c', 'C', 'new')]);
  assert.equal(next.other, 1);
  assert.deepEqual(configuration, snapshot);
});

test('only the unplaced devices of a linked area are proposed', () => {
  const device = (deviceId, areaId, inPlan = false, name = deviceId) => ({ deviceId, areaId, inPlan, name });
  const catalog = [
    device('z', 'one'),
    device('a', 'one'),
    device('placed', 'one', true),
    device('other', 'two'),
    device('none', null),
  ];
  const proposals = areaProposals([room('r', 'R', 'one'), room('s', 'S'), room('t', 'T', 'empty')], catalog);
  assert.equal(proposals.length, 1);
  assert.equal(proposals[0].roomId, 'r');
  assert.deepEqual(
    proposals[0].devices.map(item => item.deviceId),
    ['a', 'z'],
  );
});

test('new devices spread over the largest rectangle, inside it, on the fine grid', () => {
  const small = { x: 0, y: 0, width: 0.1, height: 0.1 };
  const large = { x: 0.2, y: 0.2, width: 0.4, height: 0.2 };
  const spots = spreadInRoom([small, large], 5);
  assert.equal(new Set(spots.map(spot => `${spot.x},${spot.y}`)).size, 5);
  for (const spot of spots) {
    assert.ok(spot.x > large.x && spot.x < large.x + large.width);
    assert.ok(spot.y > large.y && spot.y < large.y + large.height);
    assert.equal(Math.round(spot.x * 1e6) / 1e6, spot.x);
  }
  assert.deepEqual(spreadInRoom([large], 1), [{ x: 0.4, y: 0.3 }]);
  assert.deepEqual(spreadInRoom([], 0), []);
  assert.equal(spreadInRoom([], 1).length, 1);
});

test('an entity placed in an area with no device is offered too, but not one that is hidden or already placed', () => {
  const state = name => ({ state: 'off', attributes: { friendly_name: name } });
  const hass = {
    states: {
      'light.template': state('Luz de plantilla'),
      'light.owned': state('Con dispositivo'),
      'light.nowhere': state('Sin área'),
      'light.hidden': state('Oculta'),
      'light.placed': state('Ya está'),
    },
    entities: {
      'light.template': { area_id: 'one' },
      'light.owned': { area_id: 'one', device_id: 'd' },
      'light.nowhere': {},
      'light.hidden': { area_id: 'one', hidden: true },
      'light.placed': { area_id: 'one' },
    },
  };
  const loose = looseEntities(hass, [{ bindings: { entityId: 'light.placed' } }]);
  assert.deepEqual(
    loose.map(item => [item.primaryEntityId, item.name, item.areaId, item.inPlan]),
    [
      ['light.template', 'Luz de plantilla', 'one', false],
      ['light.placed', 'Ya está', 'one', true],
    ],
  );
  assert.equal(isLooseEntity(loose[0].deviceId), true);
  assert.equal(isLooseEntity('some-device'), false);
  const proposals = areaProposals([room('r', 'R', 'one')], loose);
  assert.deepEqual(
    proposals[0].devices.map(item => item.primaryEntityId),
    ['light.template'],
  );
  assert.deepEqual(looseEntities(undefined, []), []);
});
