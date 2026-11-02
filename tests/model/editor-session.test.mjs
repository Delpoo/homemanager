import test from 'node:test';
import assert from 'node:assert/strict';
import { cameraForEditedDevice, restoreEditedDevice } from '../../.work/model/editor-session.js';

test('centres the selected point with a nonzero SVG origin and a mobile sheet, preserving zoom', () => {
  const camera = cameraForEditedDevice(
    { x: 99, y: 88, scale: 2 },
    { x: 10, y: 20, width: 1000, height: 700 },
    { x: 0.3, y: 0.6 },
    { width: 390, height: 700, coveredBottom: 385 },
  );
  assert.equal((10 + 0.3 * 1000) * camera.scale + camera.x, 195);
  assert.equal((20 + 0.6 * 700) * camera.scale + camera.y, 157.5);
  assert.equal(camera.scale, 2);
});

test('undo in the sheet restores only that device and its reading source', () => {
  const opened = {
    catalog: {
      devices: [
        { id: 'a', display: { label: 'Original' } },
        { id: 'b', display: { label: 'Other' } },
      ],
    },
    stateSources: { a: { entityId: 'sensor.synthetic_original' } },
    actions: { original: {} },
  };
  const current = structuredClone(opened);
  current.catalog.devices[0].display.label = 'Draft';
  current.catalog.devices[1].display.label = 'Other draft';
  current.stateSources.a = { entityId: 'sensor.synthetic_draft' };
  current.stateSources.b = { entityId: 'sensor.synthetic_other' };
  current.actions.added = { domain: 'light', service: 'toggle' };
  const reverted = restoreEditedDevice(current, opened, 'a');
  assert.deepEqual(reverted.catalog.devices[0], opened.catalog.devices[0]);
  assert.deepEqual(reverted.stateSources.a, opened.stateSources.a);
  assert.deepEqual(reverted.catalog.devices[1], current.catalog.devices[1]);
  assert.deepEqual(reverted.stateSources.b, current.stateSources.b);
  assert.deepEqual(reverted.actions, current.actions);
  assert.equal(current.catalog.devices[0].display.label, 'Draft');
});
