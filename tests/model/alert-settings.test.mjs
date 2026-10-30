import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  alertSettingsDraft,
  alertSettingsDisplay,
  alertReadingChoices,
  plantAlertSuggestions,
} from '../../.work/model/alert-settings.js';
import { upsertDevice } from '../../.work/editor/model.js';
const device = {
  id: 'plant',
  roomId: null,
  kind: 'plant',
  mobility: 'editable',
  position: { x: 0.5, y: 0.5 },
  display: { label: 'Test plant', icon: 'mdi:sprout', category: 'plant' },
  bindings: { entityId: 'sensor.test_soil', deviceId: 'test-plant', primaryAction: null, advancedPopupId: null },
};
const hass = {
  states: {
    'sensor.test_soil': { state: '38', attributes: { device_class: 'moisture', unit_of_measurement: '%' } },
    'sensor.test_light': { state: '400', attributes: { device_class: 'illuminance', unit_of_measurement: 'lx' } },
    'sensor.test_temp': { state: '20', attributes: { device_class: 'temperature', unit_of_measurement: '°C' } },
    'sensor.test_soil_unrelated': { state: '10', attributes: { device_class: 'moisture' } },
    'sensor.test_diagnostic': { state: '10', attributes: {} },
  },
  entities: {
    'sensor.test_soil': { device_id: 'test-plant' },
    'sensor.test_light': { device_id: 'test-plant' },
    'sensor.test_temp': { device_id: 'test-plant' },
    'sensor.test_soil_unrelated': { device_id: 'other' },
    'sensor.test_diagnostic': { device_id: 'test-plant', entity_category: 'diagnostic' },
  },
};
test('choices use only associated useful readings and plant suggestions are explicitly OFF', () => {
  const choices = alertReadingChoices(device, hass);
  assert.deepEqual(
    choices.map(item => item.id),
    ['sensor.test_soil', 'sensor.test_light', 'sensor.test_temp'],
  );
  assert.equal(choices[0].name, 'Humedad del suelo');
  const suggestions = plantAlertSuggestions(device, hass);
  assert.deepEqual(
    suggestions.map(item => [item.below, item.minutes, item.level, item.enabled]),
    [
      ['20', '', 'warning', false],
      ['800', '4320', 'warning', false],
      ['10', '', 'alert', false],
    ],
  );
  assert.deepEqual(alertSettingsDisplay({ rules: suggestions }), { alerts: [] });
  const before = structuredClone(device);
  alertSettingsDraft(device);
  assert.deepEqual(device, before);
});
test('settings round-trip zero, negative bounds, duration, severity and explicit false without mutation', () => {
  const original = {
    ...device,
    display: {
      ...device.display,
      highlight: false,
      alerts: [{ reading: 'sensor.test_temp', below: -2, above: 0, forMinutes: 0, level: 'alert' }],
    },
  };
  const draft = alertSettingsDraft(original),
    before = structuredClone(draft);
  assert.deepEqual(alertSettingsDisplay(draft), { alerts: original.display.alerts, highlight: false });
  assert.deepEqual(draft, before);
  const config = {
    schemaVersion: 2,
    rooms: [],
    catalog: { schemaVersion: 2, devices: [original] },
    architecture: { format: 'svg', content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"></svg>' },
    actions: {},
    panels: {},
    stateSources: {},
  };
  const changed = { ...original, display: { ...original.display, category: 'switch', ...alertSettingsDisplay(draft) } };
  const result = upsertDevice(config, changed, { previousId: device.id });
  assert.deepEqual(result.catalog.devices[0].display.alerts, original.display.alerts);
  assert.equal(result.catalog.devices[0].display.highlight, false);
  result.catalog.devices[0].display.alerts[0].below = 4;
  assert.equal(original.display.alerts[0].below, -2);
});
test('unfinished, nonfinite, negative duration and too many enabled settings cannot be saved', () => {
  const rule = { reading: 'sensor.test_soil', below: '', above: '', minutes: '', level: 'warning', enabled: true };
  for (const invalid of [
    rule,
    { ...rule, below: 'Infinity' },
    { ...rule, below: '20', minutes: '-1' },
    { ...rule, below: 'invalid' },
  ])
    assert.throws(() => alertSettingsDisplay({ rules: [invalid] }));
  assert.throws(() => alertSettingsDisplay({ rules: Array.from({ length: 5 }, () => ({ ...rule, below: '20' })) }));
  assert.deepEqual(alertSettingsDisplay({ rules: [{ ...rule, enabled: false }] }), { alerts: [] });
});
test('CP4 domain modules stay pure and the new inspector composes UI without owning CSS', () => {
  for (const name of ['alert-settings', 'alert-rules']) {
    const text = readFileSync(new URL(`../../src/model/${name}.ts`, import.meta.url), 'utf8');
    assert.doesNotMatch(text, /\b(?:document|window|HTMLElement|setTimeout|setInterval)\b|Date\.now\(/);
  }
  const source = readFileSync(new URL('../../src/editor/index.ts', import.meta.url), 'utf8');
  const block = source.slice(source.indexOf('private configureAlerts('), source.indexOf('/** Sheet model'));
  assert.doesNotMatch(block, /<style|style\s*=|#[0-9a-f]{3,8}\b|\.style\./i);
});
