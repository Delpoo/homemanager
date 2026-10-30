import test from 'node:test';
import assert from 'node:assert/strict';
import { deviceName, readingName, entityAreaId, areaName, personName } from '../../.work/model/names.js';
import { syntheticRegistry } from '../browser/fixtures/registry.js';
test('device user names win; factory names and unnamed devices never expose identifiers', () => {
  assert.equal(deviceName({ name_by_user: 'Luz_del_estudio', name: 'Factory name' }), 'Luz del estudio');
  assert.equal(deviceName({ name: 'Factory_name' }), 'Factory name');
  assert.equal(deviceName({ name: 'sensor.factory_1' }), 'Dispositivo');
  assert.equal(personName('sensor.factory_1'), '');
});
test('readings remove either device prefix, respect word boundaries and translate classes in several languages', () => {
  const hass = syntheticRegistry();
  assert.equal(readingName('sensor.energy_meter_6ch_channel_1_power', hass), 'Canal 1 · Potencia');
  assert.equal(readingName('sensor.energy_meter_6ch_total_power', hass), 'Potencia total');
  const id = 'sensor.synthetic_2_temperature';
  for (const has_entity_name of [true, false, undefined]) {
    hass.entities[id].has_entity_name = has_entity_name;
    hass.states[id].attributes.friendly_name = 'Sensor de ambiente';
    assert.equal(readingName(id, hass), 'Temperatura');
    hass.states[id].attributes.friendly_name = 'Temperatura de la ventana';
    assert.equal(readingName(id, hass), 'Temperatura de la ventana');
  }
  delete hass.states[id].attributes.friendly_name;
  hass.locale.language = 'en-US';
  assert.equal(readingName(id, hass), 'Temperature');
  hass.locale.language = 'de-DE';
  assert.equal(readingName(id, hass), 'Temperatur');
  hass.devices['device-2'].name = 'AC';
  hass.entities[id].name = 'Aceite de prueba';
  assert.equal(readingName(id, hass), 'Aceite de prueba');
  hass.entities[id].name = 'sensor.some_id';
  assert.equal(readingName(id, hass), 'Temperatur');
});
test('an entity area overrides its device area; unknown areas stay explicit and inputs do not mutate', () => {
  const hass = syntheticRegistry(),
    id = 'sensor.synthetic_2_temperature';
  const original = structuredClone(hass);
  assert.equal(entityAreaId(id, hass), 'living');
  hass.entities[id].area_id = 'kitchen';
  assert.equal(areaName(entityAreaId(id, hass), hass), 'Cocina');
  assert.equal(areaName('not-present', hass), 'Sin espacio en Home Assistant');
  delete hass.entities[id].area_id;
  readingName(id, hass);
  assert.deepEqual(hass, original);
});
