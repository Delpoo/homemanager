import test from 'node:test';
import assert from 'node:assert/strict';
import { configuredNow, panelBlocks } from '../../.work/model/now-panel.js';
import { choosePlanImage, alignedBox } from '../../.work/model/plan-views.js';
const base = () => ({ catalog: { devices: [] }, rooms: [] });
test('automatic panels stay untouched and a wall override does not replace home defaults', () => {
  assert.equal(configuredNow(base(), undefined, []), undefined);
  const config = { ...base(), nowPanels: { wall: [{ id: 'one', type: 'reading', readings: ['sensor.sample'] }] } };
  assert.equal(panelBlocks(config, false), undefined);
  assert.equal(panelBlocks(config, true).length, 1);
});
test('missing devices and readings remain explicit without breaking blocks or claiming confirmation', () => {
  const config = {
    ...base(),
    nowPanels: {
      home: [
        { id: 'one', type: 'readings', readings: ['sensor.sample', 'sensor.gone'] },
        { id: 'two', type: 'shortcut', deviceId: 'gone' },
      ],
    },
  };
  const sections = configuredNow(
    config,
    {
      states: {
        'sensor.sample': {
          state: '23',
          attributes: { friendly_name: 'Example', unit_of_measurement: '°C', assumed_state: true },
        },
      },
    },
    [],
  );
  assert.equal(sections[0].rows[0].value, '23 °C');
  assert.equal(sections[0].rows[0].estimated, true);
  assert.equal(sections[0].missing, true);
  assert.equal(sections[1].missing, true);
});
test('alternative fallback keeps the original box and signals the missing mode', () => {
  const image = { box: [0, 0, 100, 80] };
  assert.equal(choosePlanImage({ light: image }, true).image, image);
  assert.equal(choosePlanImage({ light: image }, true).fallback, true);
  assert.equal(alignedBox([0, 0, 100, 80], image.box), true);
  assert.equal(alignedBox([0, 0, 80, 100], image.box), false);
});
