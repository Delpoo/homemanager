/** A fictional home like a typical HomeManager setup: two Athom RF IR Remote
 * boards (IR through ESPHome IR Proxy, one with the RF package), an energy meter
 * that is also an ESPHome device but can neither send nor receive, and an old
 * board that is no longer connected. Used for walking every Controls flow by hand
 * and in the end-to-end browser test. */
import { mountRfFixture } from './rf-server.js';

/** In the full app (shell.html) the card gets the new connection; in card.html the
 * Controls panel is mounted alone. */
export async function mountScenario(version = '0.0.0-test', { mount = !window.shellHarnessReady } = {}) {
  await mountRfFixture([], version, { mount: false });
  const { hass } = window.testHarness;
  const rfCall = hass.callWS;
  const irLibrary = [];
  hass.callWS = async message => {
    switch (message.type) {
      case 'homemanager/rf/transmitters':
        return { transmitters: [{ id: 'athom_a', name: 'Athom A', device_id: 'dev_a', can_capture: true }] };
      case 'homemanager/rf/devices':
        return {
          devices: [
            device('athom_a', 'Athom A', 'dev_a', { has_package: true, can_capture: true }),
            device('athom_b', 'Athom B', 'dev_b'),
            device('energy_meter', 'Medidor de energía', 'dev_c', { manufacturer: 'Athom', model: 'Energy Monitor' }),
            device('old_board', 'Placa vieja', 'dev_d', { online: false, manufacturer: 'Espressif', model: 'ESP8266' }),
          ],
          default_receiver: null,
          package: `github://Delpoo/homemanager/esphome/homemanager-rf.yaml@v${version}`,
          builder_url: '/hassio/ingress/5c53de3b_esphome',
        };
      case 'homemanager/remotes/library':
        return { remotes: structuredClone(irLibrary) };
      case 'homemanager/remotes/ir/devices':
        return {
          receivers: [
            { id: 'esphome:a-rx', name: 'Athom A · IR Proxy Receiver' },
            { id: 'esphome:b-rx', name: 'Athom B · IR Proxy Receiver' },
          ],
          emitters: [
            { id: 'esphome:a-tx', name: 'Athom A · IR Proxy Transmitter' },
            { id: 'esphome:b-tx', name: 'Athom B · IR Proxy Transmitter' },
          ],
        };
      default:
        return rfCall(message);
    }
  };
  const { card } = window.testHarness;
  if (!mount) card.hass = { ...hass };
  else {
    await customElements.whenDefined('homemanager-rf');
    const element = document.createElement('homemanager-rf');
    document.querySelector('#mount').replaceChildren(element);
    element.hass = hass;
  }
}

function device(id, name, deviceId, extra = {}) {
  return {
    id,
    name,
    device_id: deviceId,
    manufacturer: 'Athom',
    model: 'RF IR Remote',
    online: true,
    has_package: false,
    can_capture: false,
    ...extra,
  };
}
