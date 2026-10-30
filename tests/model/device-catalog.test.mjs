import test from 'node:test';
import assert from 'node:assert/strict';
import { deviceCatalog, searchDevices, bindingIssues, pickerReadings } from '../../.work/model/device-catalog.js';
import { syntheticRegistry } from '../browser/fixtures/registry.js';
test('15 devices and over 80 entities produce one row for the 6-channel/20-entity device', () => {
  const hass = syntheticRegistry(),
    before = structuredClone(hass),
    catalog = deviceCatalog(hass);
  assert.ok(Object.keys(hass.devices).length >= 15);
  assert.ok(Object.keys(hass.entities).length >= 80);
  assert.equal(Object.values(hass.entities).filter(entry => entry.device_id === 'meter-six').length, 20);
  const meter = catalog.filter(device => device.deviceId === 'meter-six');
  assert.equal(meter.length, 1);
  assert.equal(meter[0].readings.length, 16);
  assert.equal(meter[0].excluded, 4);
  assert.equal(meter[0].primaryEntityId, 'sensor.energy_meter_6ch_total_power');
  const suggested = pickerReadings(meter[0]);
  assert.deepEqual(
    suggested.primary.map(reading => reading.name),
    ['Potencia total', 'Energía de hoy'],
  );
  assert.deepEqual(
    suggested.additional.slice(0, 4).map(reading => reading.name),
    ['Canal 1 · Potencia', 'Canal 2 · Potencia', 'Tensión', 'Corriente'],
  );
  assert.equal(
    catalog.find(device => device.deviceId === 'device-2').primaryEntityId,
    'sensor.synthetic_2_temperature',
  );
  assert.equal(catalog.find(device => device.deviceId === 'device-3').primaryEntityId, 'climate.synthetic_air');
  for (const device of catalog)
    for (const reading of device.readings) assert.doesNotMatch(reading.name, /_|DO.NOT.SHOW|\bsensor\./);
  assert.deepEqual(hass, before);
});
test('all exclusion flags are unconditional, including devices with no useful entities', () => {
  const hass = syntheticRegistry();
  for (const entry of Object.values(hass.entities)) if (entry.device_id === 'device-15') entry.disabled_by = 'user';
  hass.entities['sensor.energy_meter_6ch_channel_1_power'].hidden_by = 'integration';
  assert.equal(
    deviceCatalog(hass).find(device => device.deviceId === 'device-15'),
    undefined,
  );
  assert.equal(
    deviceCatalog(hass)[0].readings.some(reading => reading.entityId === 'sensor.energy_meter_6ch_channel_1_power'),
    false,
  );
});
test('search matches person name, space, manufacturer and model; legacy entity bindings count as placed', () => {
  const hass = syntheticRegistry();
  const catalog = deviceCatalog(hass, [{ bindings: { entityId: 'sensor.energy_meter_6ch_total_power' } }]);
  assert.equal(searchDevices(catalog, 'medidor')[0].inPlan, true);
  assert.equal(searchDevices(catalog, 'cocina').length, 1);
  assert.equal(searchDevices(catalog, 'fabricante especial')[0].deviceId, 'device-5');
  assert.equal(searchDevices(catalog, 'modelo 12')[0].deviceId, 'device-12');
  assert.equal(
    searchDevices(catalog, '', true).some(device => device.deviceId === 'meter-six'),
    false,
  );
  assert.equal(searchDevices(catalog, '').at(-1).deviceId, 'meter-six');
});
test('live membership loss is reported without rewriting configuration or breaking entity-only plans', () => {
  const hass = syntheticRegistry(),
    bindings = {
      deviceId: 'meter-six',
      entityId: 'sensor.energy_meter_6ch_total_power',
      readings: ['sensor.energy_meter_6ch_channel_1_power'],
    };
  const before = structuredClone(bindings);
  assert.deepEqual(bindingIssues(bindings, hass), []);
  hass.entities[bindings.readings[0]].device_id = 'device-2';
  assert.deepEqual(bindingIssues(bindings, hass), [{ code: 'device-mismatch', entityId: bindings.readings[0] }]);
  delete hass.entities[bindings.entityId];
  assert.equal(bindingIssues(bindings, hass)[0].code, 'reading-missing');
  assert.deepEqual(bindingIssues({ entityId: bindings.entityId }, hass), []);
  assert.deepEqual(bindings, before);
  assert.deepEqual(deviceCatalog(undefined), []);
});
