import test from 'node:test';
import assert from 'node:assert/strict';
import {
  unionAll,
  subtract,
  intersect,
  cutGeom,
  strokeCrosses,
  geomOfRects,
  fitGeom,
  labelPoint,
  geomContains,
  areaOf,
  rectGeom,
  tidyRing,
} from '../../.work/model/polygon.js';

const close = (a, b) => Math.abs(a - b) < 1e-6;

test('unir dos rectángulos que se tocan deja un solo contorno, sin la línea de adentro', () => {
  const living = unionAll([rectGeom(0, 0, 0.5, 0.4), rectGeom(0, 0.4, 0.3, 0.3)]);
  assert.equal(living.length, 1);
  assert.equal(living[0].length, 6); // una L tiene seis esquinas
  assert.ok(close(areaOf(living), 0.5 * 0.4 + 0.3 * 0.3));
});

test('unir formas separadas rellena el hueco entre los lados que se enfrentan', () => {
  // Baño y balcón con una pared de 0,02 entre medio; el balcón empieza más abajo.
  const bath = rectGeom(0.5, 0.58, 0.2, 0.36);
  const balcony = rectGeom(0.72, 0.62, 0.22, 0.32);
  const joined = unionAll([bath, balcony]);
  assert.equal(joined.length, 1, 'una sola forma, sin huecos');
  assert.ok(geomContains(joined, [0.71, 0.8]), 'el hueco de la pared queda adentro');
  assert.ok(!geomContains(joined, [0.71, 0.6]), 'por encima del balcón no se inventa superficie');
  assert.ok(close(areaOf(joined), 0.2 * 0.36 + 0.22 * 0.32 + 0.02 * 0.32));
});

test('restar, intersecar y cortar con un trazo', () => {
  const room = rectGeom(0.2, 0.2, 0.6, 0.4);
  const closet = rectGeom(0.6, 0.4, 0.2, 0.2);
  const [rest] = subtract(room, [closet]);
  assert.ok(close(areaOf(rest), 0.6 * 0.4 - 0.2 * 0.2));
  assert.ok(!geomContains(rest, [0.7, 0.5]));
  assert.ok(close(areaOf(intersect([room, closet])), 0.04));
  assert.equal(intersect([rectGeom(0, 0, 0.1, 0.1), rectGeom(0.5, 0.5, 0.1, 0.1)]), null);
  assert.ok(strokeCrosses(room, [0.4, 0.1], [0.4, 0.7]));
  const pieces = cutGeom(room, [0.4, 0.1], [0.4, 0.7]);
  assert.equal(pieces.length, 2);
  assert.ok(close(areaOf(pieces[0]) + areaOf(pieces[1]), 0.24));
  assert.equal(cutGeom(room, [0.9, 0.1], [0.9, 0.7]).length, 1, 'un trazo afuera no corta');
});

test('las formas guardadas antes de 0.13 pasan a un contorno; todo queda dentro del plano', () => {
  const l = geomOfRects([
    { x: 0, y: 0, width: 0.4, height: 0.2 },
    { x: 0, y: 0.2, width: 0.2, height: 0.2 },
  ]);
  assert.equal(l[0].length, 6);
  const fitted = fitGeom(rectGeom(0.9, 0.9, 0.3, 0.3));
  assert.ok(close(areaOf(fitted), 0.01));
  assert.equal(fitGeom(rectGeom(1.2, 1.2, 0.1, 0.1)), null);
  const p = labelPoint(l);
  assert.ok(geomContains(l, p));
  assert.deepEqual(
    tidyRing([
      [0, 0],
      [0.5, 0],
      [1, 0],
      [1, 1],
      [0, 1],
      [0, 0],
    ]),
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ],
  );
});
