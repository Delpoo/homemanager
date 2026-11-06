import test from 'node:test';
import assert from 'node:assert/strict';
import { assertConfiguration } from '../../src/ha/validation.mjs';
import {
  addZone,
  applyDraft,
  cutZones,
  deviceMoves,
  geomOfRoom,
  intersectZones,
  newZoneId,
  removeZone,
  renameZone,
  reorderZones,
  startDraft,
  subtractZones,
  transformZones,
  unionZones,
  zoneAt,
} from '../../.work/model/zone-edit.js';
import { areaOf, rectGeom } from '../../.work/model/polygon.js';

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
const zone = (draft, id) => draft.zones.find(item => item.id === id);
const close = (a, b) => Math.abs(a - b) < 1e-6;

test('el borrador muestra cada espacio como forma: la propia, si no la de su zona; sin ninguna, vacío', () => {
  const draft = startDraft(plan().rooms, {
    kitchen: right,
    office: { ...corner, rects: [corner, right] },
    living: right,
  });
  // Una forma hecha en la app gana a la zona con su nombre.
  assert.ok(close(areaOf(zone(draft, 'living').geom), 0.5));
  assert.equal(zone(draft, 'kitchen').geom[0].length, 4);
  // Varios rectángulos de una zona del dibujo pasan a un solo contorno.
  assert.equal(zone(draft, 'office').geom.length, 1);
  assert.ok(close(areaOf(zone(draft, 'office').geom), 0.5));
  assert.deepEqual(zone(draft, 'old').geom, []);
  assert.ok(draft.zones.every(item => !item.shapeChanged && !item.labelChanged && !item.isNew));
  // Lo guardado antes de 0.13 con rectángulos se lee como contorno.
  const l = geomOfRoom({
    shape: { x: 0, y: 0, width: 0.4, height: 0.4 },
    rects: [
      { x: 0, y: 0, width: 0.4, height: 0.2 },
      { x: 0, y: 0.2, width: 0.2, height: 0.2 },
    ],
  });
  assert.equal(l[0].length, 6);
});

test('un espacio nuevo tiene un id legible y único; los acentos no molestan', () => {
  assert.equal(newZoneId('Baño de servicio', []), 'bano-de-servicio');
  assert.equal(newZoneId('Living', ['living']), 'living-2');
  const draft = addZone(draftOf(), 'Lavadero', rectGeom(0, 0, 0.1, 0.1), ['living', 'kitchen']);
  assert.equal(draft.zones.at(-1).id, 'lavadero');
  assert.equal(draft.zones.at(-1).isNew, true);
});

test('unir deja una sola forma con el nombre del primero, y sus dispositivos lo siguen', () => {
  const draft = unionZones(draftOf(), ['kitchen', 'office']);
  assert.equal(zone(draft, 'office'), undefined);
  assert.equal(zone(draft, 'kitchen').geom.length, 1);
  assert.equal(zone(draft, 'kitchen').geom[0].length, 4, 'dos mitades forman un rectángulo sin costura');
  assert.deepEqual(draft.merged, { office: 'kitchen' });
  assert.deepEqual(draft.removed, ['office']);
  // Unir en cadena: lo que ya se había unido sigue al nuevo dueño.
  const chain = unionZones(draft, ['living', 'kitchen']);
  assert.deepEqual(chain.merged, { office: 'living', kitchen: 'living' });
  assert.equal(unionZones(draftOf(), ['kitchen']), null);
});

test('restar, intersecar y cortar con un trazo', () => {
  const draft = addZone(draftOf(), 'Placard', rectGeom(0.4, 0.4, 0.2, 0.2), []);
  const placard = draft.zones.at(-1).id;
  const sub = subtractZones(draft, ['living', placard], []);
  assert.ok(close(areaOf(zone(sub, 'living').geom), 0.5 - 0.1 * 0.2));
  assert.ok(zone(sub, placard), 'el que resta queda como estaba');
  const both = intersectZones(draft, ['living', placard]);
  assert.ok(close(areaOf(zone(both, 'living').geom), 0.1 * 0.2));
  assert.equal(intersectZones(draftOf(), ['kitchen', 'office']), null, 'sólo se tocan: no hay nada en común');
  const cut = cutZones(draftOf(), [0.25, -0.1], [0.25, 1.1], [], []);
  assert.equal(cut.pieces.length, 2);
  assert.ok(close(areaOf(zone(cut.draft, 'living').geom), 0.25));
  assert.equal(cutZones(draftOf(), [0.9, 0.9], [0.95, 0.95], ['living'], []), null);
});

test('mover, escalar y voltear nunca sacan una forma del plano; adelante y atrás cambian el orden', () => {
  const moved = transformZones(draftOf(), ['living'], ([x, y]) => [x + 0.8, y]);
  assert.ok(areaOf(zone(moved, 'living').geom) < 0.5, 'lo que sale del plano se corta');
  const gone = transformZones(draftOf(), ['living'], ([x, y]) => [x + 5, y]);
  assert.ok(close(areaOf(zone(gone, 'living').geom), 0.5), 'si quedaría afuera entero, no se mueve');
  assert.equal(reorderZones(draftOf(), ['living'], 'front').zones.at(-1).id, 'living');
});

test('un punto pertenece al espacio más chico que lo rodea', () => {
  const draft = addZone(draftOf(), 'Placard', rectGeom(0.1, 0.1, 0.1, 0.1), []);
  assert.equal(zoneAt(draft, { x: 0.15, y: 0.15 }).label, 'Placard');
  assert.equal(zoneAt(draft, { x: 0.3, y: 0.8 }).id, 'living');
  assert.equal(zoneAt(draftOf(), { x: 2, y: 2 }), null);
});

test('sólo se mueve lo que causó la edición; al aplicar se guarda el contorno y los ids nuevos salen del nombre', () => {
  const config = plan();
  let draft = unionZones(draftOf(config), ['kitchen', 'office']);
  draft = renameZone(draft, 'kitchen', 'Cocina comedor');
  draft = addZone(
    draft,
    'Galería',
    rectGeom(0.05, 0.05, 0.1, 0.1),
    config.rooms.map(room => room.id),
  );
  draft = removeZone(draft, 'old');
  const moves = deviceMoves(config.catalog.devices, draft);
  assert.deepEqual(
    moves.map(move => [move.deviceId, move.to]),
    [['desk', 'kitchen']],
  );
  const next = applyDraft(config, draft, moves);
  const kitchen = next.rooms.find(room => room.id === 'kitchen');
  assert.equal(kitchen.label, 'Cocina comedor');
  assert.equal(kitchen.shapeSource, 'app');
  assert.equal(kitchen.rects, undefined);
  assert.deepEqual(kitchen.shape, { x: 0.5, y: 0, width: 0.5, height: 1 });
  assert.equal(kitchen.outline[0].length, 4);
  assert.deepEqual(
    next.rooms.map(room => room.id),
    ['living', 'kitchen', 'galeria'],
    'el orden de la barra se mantiene; lo nuevo va al final',
  );
  assert.equal(next.catalog.devices.find(item => item.id === 'desk').roomId, 'kitchen');
  // Lo que se aplica pasa la misma validación que el plano guardado.
  assert.doesNotThrow(() =>
    assertConfiguration({
      schemaVersion: 2,
      rooms: next.rooms,
      catalog: { schemaVersion: 2, devices: [] },
      architecture: { format: 'svg', content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"></svg>' },
      actions: {},
      panels: {},
      stateSources: {},
    }),
  );
});
