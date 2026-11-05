import test from 'node:test';
import assert from 'node:assert/strict';
import { snapToStep, keyStep, unsavedCount, validStep } from '../../.work/model/move-grid.js';

test('moving lands on the grid, Alt or no grid moves freely (#90)', () => {
  assert.equal(snapToStep(0.2537, 0.01), 0.25);
  assert.equal(snapToStep(0.2537, 0.01, true), 0.2537);
  assert.equal(snapToStep(0.2537, 0), 0.2537);
  assert.equal(snapToStep(0.0126, 0.025), 0.025);
  assert.equal(keyStep(0.01, false), 0.01);
  assert.equal(keyStep(0.01, true), 0.05);
  assert.equal(keyStep(0, false), 0.002);
  assert.equal(validStep('0.5'), 0.01);
  assert.equal(validStep('0.025'), 0.025);
  assert.equal(unsavedCount(0, true), 1);
  assert.equal(unsavedCount(3, false), 0);
});

