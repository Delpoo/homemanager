import test from 'node:test';
import assert from 'node:assert/strict';
import { planImportReport, mergeRoom } from '../../.work/model/plan-import.js';

const config = () => ({
  schemaVersion: 2,
  rooms: [
    { id: 'one', label: 'Uno', icon: 'mdi:sofa' },
    { id: 'two', label: 'Dos' },
    { id: 'empty', label: 'Vacío' },
  ],
  catalog: {
    schemaVersion: 2,
    devices: [
      {
        id: 'first',
        roomId: 'one',
        position: { x: 0.2, y: 0.3 },
        mobility: 'fixed',
        bindings: { entityId: 'light.synthetic' },
      },
      { id: 'second', roomId: 'one' },
      { id: 'third', roomId: 'two' },
    ],
  },
  architecture: { content: 'unchanged' },
  actions: { preserved: true },
});
const zones = [
  { id: 'joined', label: '  Estudio nuevo  ' },
  { id: 'garden', label: null },
];

test('three orphan rooms include exact device lists, empty defaults and unanimous suggestions', () => {
  const input = config(),
    before = structuredClone(input);
  const report = planImportReport(input, { first: ['joined'], second: ['joined'], third: ['garden'] }, zones);
  assert.deepEqual(report.orphans, [
    { roomId: 'one', label: 'Uno', devices: ['first', 'second'], suggestion: 'joined' },
    { roomId: 'two', label: 'Dos', devices: ['third'], suggestion: 'garden' },
    { roomId: 'empty', label: 'Vacío', devices: [], suggestion: null },
  ]);
  assert.deepEqual(report.moves, [
    { deviceId: 'first', from: 'one', to: 'joined' },
    { deviceId: 'second', from: 'one', to: 'joined' },
    { deviceId: 'third', from: 'two', to: 'garden' },
  ]);
  assert.deepEqual(report.newZones, [
    { id: 'joined', label: 'Estudio nuevo' },
    { id: 'garden', label: 'garden' },
  ]);
  assert.deepEqual(input, before);
});

test('split, ambiguous and outside devices never receive an automatic move or merge suggestion', () => {
  const report = planImportReport(config(), { first: ['joined', 'garden'], second: [], third: ['joined'] }, zones);
  assert.deepEqual(report.ambiguous, [{ deviceId: 'first', zones: ['joined', 'garden'] }]);
  assert.deepEqual(report.outside, [{ deviceId: 'second' }]);
  assert.equal(report.orphans[0].suggestion, null);
  assert.deepEqual(report.moves, [{ deviceId: 'third', from: 'two', to: 'joined' }]);
  assert.equal(
    planImportReport(config(), { first: ['joined'], second: ['garden'] }, zones).orphans[0].suggestion,
    null,
  );
});

test('existing IDs, duplicate hits and declared zones without conflicts remain stable', () => {
  const input = config();
  const report = planImportReport(input, { first: ['one', 'one'], second: ['one'], third: ['two'] }, input.rooms);
  assert.deepEqual(report, { moves: [], orphans: [], newZones: [], ambiguous: [], outside: [] });
  assert.deepEqual(
    input.catalog.devices.map(device => device.id),
    ['first', 'second', 'third'],
  );
});

test('merge is immutable, moves fixed device room only and preserves IDs, positions, bindings and unrelated data', () => {
  const input = config(),
    before = structuredClone(input);
  const next = mergeRoom(input, 'one', 'two');
  assert.deepEqual(
    next.catalog.devices.map(device => device.roomId),
    ['two', 'two', 'two'],
  );
  assert.deepEqual(next.catalog.devices[0], { ...input.catalog.devices[0], roomId: 'two' });
  assert.deepEqual(
    next.rooms.map(room => room.id),
    ['two', 'empty'],
  );
  assert.deepEqual(next.actions, input.actions);
  assert.deepEqual(input, before);
  assert.notEqual(next, input);
});

test('empty removal, explicit unassignment, same-room no-op and invalid destinations are deterministic', () => {
  assert.equal(mergeRoom(config(), 'empty', null).rooms.length, 2);
  assert.deepEqual(
    mergeRoom(config(), 'one', null).catalog.devices.map(device => device.roomId),
    [null, null, 'two'],
  );
  assert.deepEqual(mergeRoom(config(), 'one', 'one'), config());
  assert.throws(() => mergeRoom(config(), 'missing', 'two'), /unknown-source/);
  assert.throws(() => mergeRoom(config(), 'one', 'missing'), /unknown-target/);
});
