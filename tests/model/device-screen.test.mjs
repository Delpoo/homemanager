import test from 'node:test';
import assert from 'node:assert/strict';
import { deviceScreen } from '../../.work/model/device-screen.js';
import { nowSections } from '../../.work/model/now.js';
import { syntheticRegistry } from '../browser/fixtures/registry.js';
const now = Date.parse('2026-10-30T00:00:05Z');
const rooms = [
  { id: 'kitchen', label: 'Cocina' },
  { id: 'living', label: 'Living' },
];
const meter = () => ({
  id: 'meter',
  roomId: 'kitchen',
  kind: 'energy',
  display: { label: 'Medidor de energía', icon: 'mdi:flash' },
  bindings: {
    deviceId: 'meter-six',
    entityId: 'sensor.energy_meter_6ch_total_power',
    readings: ['sensor.energy_meter_6ch_today', 'sensor.energy_meter_voltage', 'sensor.energy_meter_current'],
  },
});
test('six-channel/20-entity screen groups every channel, caps big values, preserves inputs and IDs', () => {
  const device = meter(),
    hass = syntheticRegistry(),
    before = structuredClone({ device, hass });
  const screen = deviceScreen(device, hass, rooms, now);
  assert.equal(screen.channels.length, 6);
  assert.deepEqual(screen.channels[0], { name: 'Canal 1', now: '640 W', today: '0,4 kWh', watts: 640 });
  assert.deepEqual(
    screen.values.map(value => value.name),
    ['Potencia total', 'Energía de hoy', 'Tensión'],
  );
  assert.equal(screen.readings[0].name, 'Corriente');
  assert.deepEqual(
    screen.readingGroups.map(group => group.name),
    ['Corriente'],
  );
  assert.equal(screen.age, 5000);
  assert.equal(screen.health, 'online');
  assert.equal(screen.diagnosis.length, 1);
  assert.equal(screen.controls.length, 0);
  const visible = JSON.stringify(
    [screen.values, screen.readings].map(list => list.map(({ name, value }) => ({ name, value }))),
  );
  assert.doesNotMatch(visible, /_|DO NOT SHOW|sensor\./);
  assert.deepEqual({ device, hass }, before);
});
test('climate exposes live setpoint, bounds and human mode options without optimistic state', () => {
  const hass = syntheticRegistry();
  hass.states['climate.synthetic_air'].attributes = {
    supported_features: 385,
    min_temp: 16,
    max_temp: 30,
    temperature: 22,
    target_temp_step: 0.5,
    hvac_modes: ['off', 'cool', 'heat', 'dry', 'fan_only'],
  };
  const device = { ...meter(), kind: 'ac', bindings: { deviceId: 'device-3', entityId: 'climate.synthetic_air' } };
  const screen = deviceScreen(device, hass, rooms, now);
  assert.equal(screen.controls.find(control => control.kind === 'stepper').value, 22);
  assert.deepEqual(
    screen.controls.find(control => control.id === 'hvac').options.map(option => option.label),
    ['Apagado', 'Frío', 'Calor', 'Seco', 'Ventilar'],
  );
  hass.states['climate.synthetic_air'].state = 'unavailable';
  assert.equal(deviceScreen(device, hass, rooms, now).controls.length, 0);
});
test('legacy primary infers a registry device for reading only; missing/excluded/reassigned entities never leak', () => {
  const hass = syntheticRegistry(),
    device = meter();
  delete device.bindings.deviceId;
  delete device.bindings.readings;
  const before = structuredClone(device);
  assert.equal(deviceScreen(device, hass, rooms, now).channels.length, 6);
  assert.deepEqual(device, before);
  device.bindings.deviceId = 'device-3';
  let screen = deviceScreen(device, hass, rooms, now);
  assert.equal(screen.channels.length, 0);
  assert.equal(screen.health, 'unknown');
  assert.ok(screen.issues.includes('device-mismatch'));
  assert.equal(screen.controls.length, 0);
  const alone = { ...meter(), bindings: { entityId: 'sensor.alone' } };
  hass.states['sensor.alone'] = { state: '7', attributes: { device_class: 'temperature', unit_of_measurement: '°C' } };
  assert.equal(deviceScreen(alone, hass, rooms, now).values[0].value, '7 °C');
  assert.equal(deviceScreen(alone, hass, rooms, now).age, null);
  assert.equal(deviceScreen(alone, hass, rooms, now).diagnosis.length, 0);
});
test('all useful readings remain accessible, while hidden, disabled and configuration readings stay excluded', () => {
  const hass = syntheticRegistry();
  hass.entities['sensor.energy_meter_6ch_channel_2_power'].hidden_by = 'user';
  const screen = deviceScreen(meter(), hass, rooms, now);
  assert.equal(screen.channels[1].now, '—');
  assert.equal(screen.diagnosis.length, 1);
  assert.equal(
    screen.readings.some(reading => reading.entityId.includes('configuration')),
    false,
  );
  assert.equal(screen.channels[5].name, 'Canal 6');
});
test('Ahora only has nonempty sections, groups climate by space, filters rooms and avoids duplicate meter totals', () => {
  const hass = syntheticRegistry();
  const climate = {
    id: 'sensor',
    roomId: 'living',
    kind: 'sensor',
    display: { label: 'Sensor', icon: 'mdi:thermometer' },
    bindings: { entityId: 'sensor.synthetic_2_temperature', deviceId: 'device-2' },
  };
  let sections = nowSections([meter(), { ...meter(), id: 'duplicate' }, climate], rooms, hass, now);
  assert.deepEqual(
    sections.map(section => section.id),
    ['climate', 'energy'],
  );
  assert.equal(sections.find(section => section.id === 'energy').rows.length, 1);
  assert.equal(sections[0].rows[0].name, 'Living');
  assert.deepEqual(
    nowSections([meter(), climate], rooms, hass, now, 'living').map(section => section.id),
    ['climate'],
  );
  assert.deepEqual(nowSections([], rooms, hass, now), []);
});
test('quick-off is an explicit supported command and pending/unknown runtime does not invent activity', () => {
  const hass = { states: { 'light.synthetic': { state: 'on', attributes: {} } } };
  const device = { ...meter(), kind: 'light', bindings: { entityId: 'light.synthetic' } };
  let sections = nowSections([device], rooms, hass, now);
  assert.deepEqual(sections[0].rows[0].off, { service: 'turn_off' });
  sections = nowSections([device], rooms, hass, now, null, { meter: { value: 'unknown', confidence: 'sent' } });
  assert.equal(sections[0].rows[0].value, 'Encendido');
  hass.states['light.synthetic'].state = 'off';
  assert.deepEqual(nowSections([device], rooms, hass, now, null, { meter: { value: 'on', confidence: 'sent' } }), []);
});
test('device activity retains the four command terms and sanitizes untrusted labels and values', () => {
  const activity = ['Enviado', 'en el aire', 'confirmado', 'No se pudo enviar'].map((message, index) => ({
    deviceId: 'meter',
    message,
    updatedAt: now + index,
    actionLabel: 'sensor.secret_name',
    value: 'fan_only',
    tone: 'neutral',
  }));
  const screen = deviceScreen(meter(), syntheticRegistry(), rooms, now, activity);
  assert.equal(screen.activity.length, 4);
  assert.ok(screen.activity.some(entry => entry.message.startsWith('en el aire')));
  assert.doesNotMatch(JSON.stringify(screen.activity), /_|sensor\./);
});

test('a cumulative energy reading is never labeled as today without evidence in its name', () => {
  const hass = syntheticRegistry();
  hass.states['sensor.energy_meter_6ch_channel_1_energy'].attributes.friendly_name =
    'Energy_meter_6ch_Channel_1_Energía acumulada';
  const screen = deviceScreen(meter(), hass, rooms, now);
  assert.equal(screen.channels[0].today, '—');
  assert.ok(screen.readings.some(reading => reading.name === 'Canal 1 · Energía acumulada'));
});

test('0.7 configured panel actions keep their explicit IDs, labels and ordering', () => {
  const device = meter();
  device.bindings.advancedPopupId = 'legacy-panel';
  const screen = deviceScreen(device, syntheticRegistry(), rooms, now, [], {
    'legacy-panel': { controls: [{ actionId: 'existing-action', label: 'Control anterior' }] },
  });
  assert.deepEqual(screen.actions, [{ id: 'existing-action', label: 'Control anterior' }]);
});
