import test from 'node:test';
import assert from 'node:assert/strict';
import { readingInfo, indicatorColor, effectsOf, defaultColors } from '../../.work/model/indicator.js';

// Entirely fictional readings.
const hass = {
  states: {
    'cover.sample': { state: 'open', attributes: { current_position: 75 } },
    'sensor.sample_temperature': {
      state: '27',
      attributes: { device_class: 'temperature', unit_of_measurement: '°C', state_class: 'measurement' },
    },
    'binary_sensor.sample': { state: 'off', attributes: {} },
    'climate.sample': { state: 'cool', attributes: { hvac_modes: ['off', 'cool', 'heat'] } },
    'sensor.sample_missing': { state: 'unavailable', attributes: { unit_of_measurement: 'W' } },
  },
};

test('the kind of a reading comes from Home Assistant: number, yes/no, states or text', () => {
  assert.deepEqual(
    (({ kind, value, min, max }) => ({ kind, value, min, max }))(readingInfo(hass, 'cover.sample', 'current_position')),
    { kind: 'number', value: 75, min: 0, max: 100 },
  );
  assert.equal(readingInfo(hass, 'cover.sample').kind, 'enum');
  assert.equal(readingInfo(hass, 'binary_sensor.sample').kind, 'binary');
  assert.deepEqual(readingInfo(hass, 'climate.sample').options, ['off', 'cool', 'heat']);
  const temperature = readingInfo(hass, 'sensor.sample_temperature');
  assert.deepEqual([temperature.kind, temperature.unit, temperature.min, temperature.max], ['number', '°C', -10, 50]);
  assert.equal(readingInfo(hass, 'sensor.sample_missing').value, null);
});

test('colour by range, by state, and the no-data colour', () => {
  const border = {
    type: 'border',
    entity: 'sensor.sample_temperature',
    ranges: [
      { from: -10, to: 17, color: '#4F8FBF', name: 'Fresco' },
      { from: 18, to: 25, color: '#3F8F5F' },
      { from: 26, to: 50, color: '#D98B1F', name: 'Caluroso' },
    ],
  };
  assert.deepEqual(indicatorColor(border, readingInfo(hass, border.entity)), { color: '#D98B1F', name: 'Caluroso' });
  const led = { type: 'led', entity: 'binary_sensor.sample', states: { on: '#3F8F5F', off: '#D0453A' } };
  assert.equal(indicatorColor(led, readingInfo(hass, led.entity)).color, '#D0453A');
  const missing = { type: 'led', entity: 'sensor.sample_missing', none: '#123456' };
  assert.equal(indicatorColor(missing, readingInfo(hass, missing.entity)).color, '#123456');
  assert.equal(defaultColors(readingInfo(hass, 'climate.sample')).states.heat !== undefined, true);
});

test('effects: a ring fills by its span, hidden indicators draw nothing', () => {
  const device = {
    display: {
      indicators: [
        { type: 'ring', entity: 'cover.sample', attribute: 'current_position', min: 0, max: 100, fill: '#6F6BB8' },
        { type: 'number', entity: 'sensor.sample_temperature', position: 'br' },
        { type: 'icon', entity: 'climate.sample', states: { cool: '#4F8FBF' }, hidden: true },
      ],
    },
  };
  const effects = effectsOf(device, hass);
  assert.deepEqual(effects.ring, { percent: 75, color: '#6F6BB8', empty: '#E3E7E1', width: 4 });
  assert.deepEqual(effects.number, { text: '27', position: 'br' });
  assert.equal(effects.icon, undefined);
});
