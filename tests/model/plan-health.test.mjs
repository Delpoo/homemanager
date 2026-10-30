import test from 'node:test';
import assert from 'node:assert/strict';
import { applyFixes, canFix, isSafeFix, planFingerprint, planHealth } from '../../.work/model/plan-health.js';

const device = (id, roomId, entityId = null) => ({
  id,
  roomId,
  display: { label: `Dispositivo ${id}` },
  bindings: { entityId },
});
const configuration = () => ({
  rooms: [
    { id: 'living', label: 'Living' },
    { id: 'kitchen', label: 'Cocina' },
    { id: 'hall', label: 'Pasillo' },
    { id: 'old', label: 'Comedor' },
    { id: 'drawn', label: 'Estudio', shape: { x: 0, y: 0, width: 0.1, height: 0.1 } },
  ],
  catalog: {
    devices: [
      device('good', 'living', 'light.good'),
      device('wrong', 'living', 'light.wrong'),
      device('loose', null),
      device('away', 'kitchen'),
      device('stale', 'old', 'sensor.gone'),
    ],
  },
  architecture: { content: '<svg/>' },
});
const input = {
  zones: [
    { id: 'living', label: 'Living' },
    { id: 'kitchen', label: 'Cocina' },
    { id: 'office', label: ' Oficina ' },
  ],
  drawnIn: { good: 'living', wrong: 'kitchen', loose: 'living', away: null, stale: 'living' },
  title: ' Plano 2.5 ',
  entities: new Set(['light.good', 'light.wrong']),
};
const kinds = health => health.issues.map(issue => issue.kind);

test('it says which plan is saved and finds every kind of problem', () => {
  const health = planHealth(configuration(), input);
  assert.deepEqual(health.plan, {
    title: 'Plano 2.5',
    fingerprint: planFingerprint('<svg/>'),
    zones: 3,
    spaces: 5,
    devices: 5,
  });
  // The drawn space has a shape, so it is fine without a zone.
  assert.deepEqual(
    health.issues.filter(issue => issue.kind === 'no-geometry').map(issue => [issue.roomId, issue.devices]),
    [
      ['hall', 0],
      ['old', 1],
    ],
  );
  assert.deepEqual(
    health.issues.filter(issue => issue.kind === 'unused-zone'),
    [{ kind: 'unused-zone', zoneId: 'office', label: 'Oficina' }],
  );
  assert.deepEqual(
    health.issues.filter(issue => issue.kind === 'misplaced').map(issue => [issue.deviceId, issue.from, issue.to]),
    [
      ['wrong', 'living', 'kitchen'],
      ['loose', null, 'living'],
      ['stale', 'old', 'living'],
    ],
  );
  assert.deepEqual(
    health.issues.filter(issue => issue.kind === 'outside').map(issue => issue.deviceId),
    ['away'],
  );
  assert.deepEqual(
    health.issues.filter(issue => issue.kind === 'missing-entity').map(issue => issue.deviceId),
    ['stale'],
  );
});

test('a healthy plan has no issues; without a session, bindings are not judged', () => {
  const healthy = {
    ...configuration(),
    rooms: [{ id: 'living', label: 'Living' }],
    catalog: { devices: [device('good', 'living', 'light.good')] },
  };
  const zones = [{ id: 'living', label: 'Living' }];
  assert.deepEqual(planHealth(healthy, { zones, drawnIn: { good: 'living' }, title: null }).issues, []);
  const session = planHealth(healthy, { zones, drawnIn: { good: 'living' }, title: null, entities: new Set() });
  assert.deepEqual(kinds(session), ['missing-entity']);
});

test('two spaces with the same name are reported, whatever their case', () => {
  const same = {
    ...configuration(),
    rooms: [
      { id: 'a', label: 'Baño' },
      { id: 'b', label: ' baño ' },
    ],
  };
  same.catalog.devices = [];
  const health = planHealth(same, {
    zones: [
      { id: 'a', label: null },
      { id: 'b', label: null },
    ],
    drawnIn: {},
    title: null,
  });
  assert.deepEqual(health.issues, [{ kind: 'same-name', label: 'Baño', rooms: ['a', 'b'] }]);
});

test('safe fixes move devices and drop empty spaces; a zone is added only when chosen, and no device is lost', () => {
  const before = configuration();
  const health = planHealth(before, input);
  const safe = health.issues.filter(isSafeFix);
  assert.deepEqual(safe.map(issue => issue.kind).sort(), ['misplaced', 'misplaced', 'misplaced', 'no-geometry']);
  const snapshot = structuredClone(before);
  const next = applyFixes(before, safe);
  assert.deepEqual(before, snapshot);
  // An old drawing's extra zones never come back on their own.
  assert.deepEqual(
    next.rooms.map(room => room.id),
    ['living', 'kitchen', 'old', 'drawn'],
  );
  assert.equal(next.catalog.devices.length, 5);
  assert.equal(next.catalog.devices.find(item => item.id === 'wrong').roomId, 'kitchen');
  assert.equal(next.catalog.devices.find(item => item.id === 'loose').roomId, 'living');
  // A space that held a device is the person's decision, even once that device moved.
  assert.equal(next.catalog.devices.find(item => item.id === 'stale').roomId, 'living');
  const zone = health.issues.find(issue => issue.kind === 'unused-zone');
  assert.equal(canFix(zone), true);
  assert.equal(isSafeFix(zone), false);
  assert.ok(applyFixes(before, [zone]).rooms.some(room => room.id === 'office' && room.label === 'Oficina'));
});

test('the fingerprint tells two drawings apart and is stable', () => {
  assert.equal(planFingerprint('<svg>a</svg>'), planFingerprint('<svg>a</svg>'));
  assert.notEqual(planFingerprint('<svg>a</svg>'), planFingerprint('<svg>b</svg>'));
  assert.match(planFingerprint(''), /^[0-9a-f]{8}$/);
});
