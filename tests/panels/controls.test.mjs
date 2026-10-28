import test from 'node:test';
import assert from 'node:assert/strict';
import {
  commandFor,
  defaultPrimaryCommand,
  entityControls,
  scriptFieldControls,
  suggestPresentation,
} from '../../.work/panels/controls.js';
import { boundsOf, clusterPoints } from '../../.work/card/markers.js';

globalThis.__homemanagerLanguage = 'es';
const entity = (state, attributes = {}) => ({ state, attributes, last_updated: '2026-01-01T00:00:00Z' });
const ids = controls => controls.map(control => `${control.kind}:${control.id}`);

test('controls follow the real capabilities of each entity', () => {
  assert.deepEqual(ids(entityControls('light.a', entity('on', { supported_color_modes: ['onoff'] }))), [
    'toggle:power',
  ]);
  const dimmable = entityControls(
    'light.a',
    entity('on', {
      supported_color_modes: ['color_temp'],
      brightness: 128,
      min_color_temp_kelvin: 2700,
      max_color_temp_kelvin: 6500,
      color_temp_kelvin: 3000,
    }),
  );
  assert.deepEqual(ids(dimmable), ['toggle:power', 'range:brightness', 'range:color-temp']);
  assert.equal(dimmable[1].value, 50);
  // A fan without on/off flags but with speed and presets (common for RF bridges).
  const fan = entityControls(
    'fan.f',
    entity('on', {
      supported_features: 1 | 8,
      percentage: 66,
      percentage_step: 33.33,
      preset_modes: ['auto', 'sleep'],
    }),
  );
  assert.deepEqual(ids(fan), ['range:speed', 'select:preset']);
  assert.equal(fan[0].step, 33.33);
  assert.deepEqual(
    ids(entityControls('cover.c', entity('open', { supported_features: 1 | 2 | 4 | 8, current_position: 40 }))),
    ['buttons:movement', 'range:position'],
  );
  assert.deepEqual(ids(entityControls('cover.c', entity('open', { supported_features: 1 | 2 }))), ['buttons:movement']);
  const climate = entityControls(
    'climate.ac',
    entity('cool', {
      supported_features: 1 | 8 | 128 | 256,
      hvac_modes: ['off', 'cool', 'heat'],
      min_temp: 16,
      max_temp: 30,
      target_temp_step: 1,
      temperature: 24,
      fan_modes: ['low', 'high'],
    }),
  );
  assert.deepEqual(ids(climate), ['toggle:power', 'select:hvac', 'stepper:temperature', 'select:fan_mode']);
  assert.deepEqual(ids(entityControls('sensor.t', entity('23.4', { unit_of_measurement: '°C' }))), ['reading:reading']);
  assert.deepEqual(entityControls('light.a', entity('unavailable')), []);
  assert.deepEqual(entityControls('light.a', undefined), []);
});

test('commands carry bounded values for the declared field only', () => {
  const [, brightness] = entityControls(
    'light.a',
    entity('on', { supported_color_modes: ['brightness'], brightness: 10 }),
  );
  assert.deepEqual(commandFor(brightness, 140), { service: 'turn_on', data: { brightness_pct: 100 } });
  assert.deepEqual(commandFor(brightness, 0), { service: 'turn_on', data: { brightness_pct: 1 } });
  const [, temperature] = entityControls(
    'climate.ac',
    entity('cool', {
      supported_features: 1,
      hvac_modes: ['cool'],
      min_temp: 16,
      max_temp: 30,
      target_temp_step: 0.5,
      temperature: 24,
    }),
  );
  assert.deepEqual(commandFor(temperature, 24.74), { service: 'set_temperature', data: { temperature: 24.5 } });
  const [preset] = entityControls('fan.f', entity('on', { supported_features: 8, preset_modes: ['auto'] }));
  assert.throws(() => commandFor(preset, 'turbo'));
  assert.deepEqual(commandFor(preset, 'auto'), { service: 'set_preset_mode', data: { preset_mode: 'auto' } });
});

test('script fields become inputs; scripts run through script.turn_on variables', () => {
  const fields = scriptFieldControls({
    speed: {
      name: 'Velocidad',
      required: true,
      selector: { select: { options: ['1', '2', { value: '3', label: 'Max' }] } },
    },
    light: { selector: { boolean: {} } },
    raw: { selector: { object: {} } },
  });
  assert.deepEqual(
    fields.map(field => [field.name, field.type, field.required]),
    [
      ['speed', 'select', true],
      ['light', 'boolean', false],
    ],
  );
  assert.deepEqual(fields[0].options, ['1', '2', '3']);
  const [run] = entityControls('script.rf', entity('off'), {
    speed: { required: true, selector: { select: { options: ['1'] } } },
  });
  assert.deepEqual(commandFor(run, { speed: '1' }), { service: 'turn_on', data: { variables: { speed: '1' } } });
  assert.deepEqual(commandFor(run, {}), { service: 'turn_on' });
});

test('one-step binding suggests a primary action only where it is unambiguous', () => {
  assert.deepEqual(defaultPrimaryCommand('light.a', entity('off')), { service: 'toggle' });
  assert.equal(defaultPrimaryCommand('fan.f', entity('off', { supported_features: 1 })), null);
  assert.equal(defaultPrimaryCommand('cover.c', entity('open')), null);
  assert.equal(defaultPrimaryCommand('climate.ac', entity('cool')), null);
  assert.deepEqual(suggestPresentation('binary_sensor.door', entity('off', { device_class: 'door' })), {
    kind: 'sensor',
    icon: 'mdi:door',
  });
  assert.deepEqual(suggestPresentation('sensor.power', entity('5', { device_class: 'power' })), {
    kind: 'energy',
    icon: 'mdi:flash',
  });
  assert.deepEqual(suggestPresentation('light.a', entity('on', { icon: 'mdi:ceiling-light' })), {
    kind: 'light',
    icon: 'mdi:ceiling-light',
  });
});

test('markers closer than the touch target are grouped deterministically', () => {
  const points = [
    { id: 'a', x: 100, y: 100 },
    { id: 'b', x: 120, y: 110 },
    { id: 'c', x: 300, y: 100 },
    { id: 'd', x: 125, y: 95 },
  ];
  const groups = clusterPoints(points, 46);
  assert.deepEqual(
    groups.map(group => group.ids),
    [['a', 'b', 'd'], ['c']],
  );
  assert.deepEqual(clusterPoints(points, 46), groups);
  assert.deepEqual(
    clusterPoints(points, 10).map(group => group.ids),
    [['a'], ['b'], ['c'], ['d']],
  );
  const bounds = boundsOf(
    [
      { x: 0.5, y: 0.5 },
      { x: 0.5, y: 0.5 },
    ],
    { x: 0, y: 0, width: 100, height: 100 },
    10,
  );
  assert.deepEqual(bounds, { x: 45, y: 45, width: 10, height: 10 });
});
