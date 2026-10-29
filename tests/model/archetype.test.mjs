import test from 'node:test';
import assert from 'node:assert/strict';
import { ARCHETYPES, archetypeOf, presentationOf, suggestedRoomIcon } from '../../.work/model/archetype.js';
import { fixture } from './fixtures.mjs';

test('kind defaults cover the six archetypes without rendering knowledge', () => {
  for (const [kind, expected] of Object.entries({
    light: 'actuator',
    switch: 'actuator',
    fan: 'actuator',
    curtain: 'actuator',
    lock: 'actuator',
    ac: 'equipment',
    purifier: 'equipment',
    robot: 'equipment',
    appliance: 'equipment',
    media: 'equipment',
    energy: 'meter',
    plant: 'meter',
    infra: 'infrastructure',
    camera: 'equipment',
    other: 'equipment',
  }))
    assert.equal(archetypeOf(fixture(kind).device), expected, kind);
  assert.equal(ARCHETYPES.length, 6);
});

test('binary sensors stay sensors; numeric and classed sensors become meters even while unavailable', () => {
  const binary = fixture('sensor', 'binary_sensor.test_door', 'off', { device_class: 'door' });
  assert.equal(archetypeOf(binary.device, binary.hass), 'sensor');
  for (const [state, attributes] of [
    ['23.4', {}],
    ['unavailable', { device_class: 'temperature' }],
    ['unknown', { unit_of_measurement: '%' }],
  ]) {
    const { device, hass } = fixture('sensor', 'sensor.test_temperature', state, attributes);
    assert.equal(archetypeOf(device, hass), 'meter');
  }
});

test('explicit archetype wins over RF remote and defaults; RF remote defaults to remote', () => {
  const { device, hass } = fixture('fan', 'fan.test_remote', 'unknown');
  device.bindings.remoteId = 'test-remote';
  assert.equal(archetypeOf(device, hass), 'remote');
  device.display.archetype = 'actuator';
  assert.equal(archetypeOf(device, hass), 'actuator');
});

test('HA HomeManager remote attributes classify both RF entities and remote buttons', () => {
  for (const attribute of ['homemanager_remote', 'homemanager_remote_button']) {
    const { device, hass } = fixture('fan', 'fan.test_remote', 'unknown', { [attribute]: 'test-remote' });
    assert.equal(archetypeOf(device, hass), 'remote');
    device.display.archetype = 'actuator';
    assert.equal(archetypeOf(device, hass), 'actuator');
  }
});

test('model resolves layers, bounded levels and cooling tone', () => {
  const light = fixture('light', 'light.test_light', 'on', { brightness: 127.5 });
  assert.deepEqual(presentationOf(light.device, light.hass), {
    archetype: 'actuator',
    layer: 'controls',
    cool: false,
    level: 0.5,
  });
  const energy = fixture('sensor', 'sensor.test_power', '120', { device_class: 'power' });
  assert.equal(presentationOf(energy.device, energy.hass).layer, 'energy');
  const ac = fixture('ac', 'climate.test_ac', 'cool');
  assert.equal(presentationOf(ac.device, ac.hass).cool, true);
  const fan = fixture('fan', 'fan.test_fan', 'on', { percentage: 200 });
  assert.equal(presentationOf(fan.device, fan.hass).level, 1);
});

test('room icon suggestions accept translated generic names and fall back safely', () => {
  for (const [label, icon] of [
    ['Living', 'mdi:sofa'],
    ['Cocina', 'mdi:pot-steam'],
    ['Dormitorio', 'mdi:bed'],
    ['Baño', 'mdi:shower'],
    ['Oficina', 'mdi:desk'],
    ['Balcón', 'mdi:flower'],
    ['Space 42', 'mdi:floor-plan'],
  ])
    assert.equal(suggestedRoomIcon(label), icon);
});
