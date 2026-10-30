import './shell-harness.js';
// Fictional CP4 register. No real household, services, configuration or RF data.
const { card, hass } = window.testHarness;
const configuration = card.getConfiguration();
const device = (id, label, category, entityId, roomId, x, y, display = {}) => ({
  id,
  roomId,
  kind: category === 'plant' ? 'plant' : 'sensor',
  position: { x, y },
  mobility: 'editable',
  display: {
    label,
    icon: category === 'plant' ? 'mdi:flower-outline' : category === 'presence' ? 'mdi:door' : 'mdi:gauge',
    category,
    ...display,
  },
  bindings: { entityId, primaryAction: null, advancedPopupId: null },
  state: { value: 'unknown', confidence: 'unknown' },
});
const plant = device('plant', 'Planta de prueba', 'plant', 'sensor.test_soil', 'living', 0.12, 0.68, {
  alerts: [
    { reading: 'sensor.test_soil', below: 20, level: 'warning' },
    { reading: 'sensor.test_plant_temp', below: 10, level: 'alert' },
  ],
});
plant.bindings.deviceId = 'fictional-plant';
plant.bindings.readings = ['sensor.test_plant_light', 'sensor.test_plant_temp'];
configuration.catalog.devices.push(
  plant,
  device('presence', 'Puerta de prueba', 'presence', 'binary_sensor.test_door', 'office', 0.53, 0.25),
);
const meter = configuration.catalog.devices.find(d => d.id === 'power');
meter.display.category = 'meter';
meter.display.alerts = [{ reading: meter.bindings.entityId, above: 1.5, level: 'warning' }];
configuration.catalog.devices.find(d => d.id === 'leak').display.category = 'alert';
hass.entities = { ...hass.entities };
hass.devices = { ...hass.devices, 'fictional-plant': { name: 'Planta de prueba' } };
const stamp = new Date().toISOString();
for (const [id, state, device_class, unit_of_measurement, friendly_name] of [
  ['sensor.test_soil', '18', 'moisture', '%', 'Humedad del suelo'],
  ['sensor.test_plant_light', '700', 'illuminance', 'lx', 'Luz'],
  ['sensor.test_plant_temp', '8', 'temperature', '°C', 'Temperatura'],
  ['binary_sensor.test_door', 'on', 'door', '', 'Puerta'],
]) {
  hass.states[id] = {
    state,
    attributes: { device_class, unit_of_measurement, friendly_name },
    last_changed: stamp,
    last_updated: stamp,
  };
  if (id.startsWith('sensor.')) hass.entities[id] = { device_id: 'fictional-plant', name: friendly_name };
}
hass.states['binary_sensor.synthetic_leak'].state = 'on';
hass.formatEntityState = entity => {
  const unit = entity.attributes?.unit_of_measurement;
  return unit ? `${entity.state.replace('.', ',')} ${unit}` : entity.state;
};
const config = {
  type: 'custom:homemanager-card',
  card_id: 'synthetic-shell',
  title: 'Casa de prueba',
  dashboard_mode: 'storage',
  configuration,
};
card.setConfig(config);
card.hass = { ...hass };
window.testHarness.mutateRemote(dashboard => {
  dashboard.views[0].cards[0] = structuredClone(config);
});
// Like the standalone app, reserve room for the header, edit toolbar and mobile rail.
const layout = () => {
  const root = card.shadowRoot;
  const height = selector => root.querySelector(selector)?.getBoundingClientRect().height ?? 0;
  card.style.setProperty(
    '--hm-viewport-height',
    `${innerHeight - height('.header') - height('.editbar') - (innerWidth < 1100 ? height('.rooms') : 0) - 2}px`,
  );
};
new MutationObserver(layout).observe(card.shadowRoot.querySelector('.shell'), {
  attributes: true,
  attributeFilter: ['class'],
});
addEventListener('resize', layout);
layout();
window.alertHarnessReady = true;
