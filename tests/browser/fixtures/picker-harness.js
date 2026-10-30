import './shell-harness.js';
import { syntheticRegistry } from './registry.js';
const { card, hass } = window.testHarness;
const registry = syntheticRegistry();
registry.states = { ...hass.states, ...registry.states };
Object.assign(hass, registry);
delete hass.formatEntityState;
const configuration = card.getConfiguration();
const legacy = configuration.catalog.devices.find(device => device.id === 'temperature');
if (legacy) {
  legacy.bindings.entityId = 'sensor.synthetic_2_temperature';
  legacy.position.x = 0.266667;
}
const config = {
  type: 'custom:homemanager-card',
  card_id: 'synthetic-picker',
  title: 'Casa de prueba',
  dashboard_mode: 'storage',
  configuration,
};
card.setConfig(config);
card.hass = { ...hass };
window.testHarness.mutateRemote(dashboard => {
  dashboard.views[0].cards[0] = structuredClone(config);
});
window.pickerHarnessReady = true;
