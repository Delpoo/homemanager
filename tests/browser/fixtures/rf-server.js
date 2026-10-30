/** Fictional RF service, shared by behavioral tests and CP6 visual checks. */
/** `version` is the package being tested, so the YAML to paste never pins an old release. */
export async function mountRfFixture(initial, version = '0.0.0-test') {
  const { hass } = window.testHarness;
  const calls = [];
  const library = structuredClone(initial);
  let capture = null;
  let defaultReceiver = null;
  const slug = name =>
    name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  const find = id => library.find(remote => remote.id === id);
  const lovelace = hass.callWS.bind(hass);
  hass.callWS = async message => {
    if (!message.type.startsWith('homemanager/rf/')) return lovelace(message);
    calls.push(structuredClone(message));
    switch (message.type) {
      case 'homemanager/rf/library':
        return { remotes: structuredClone(library) };
      case 'homemanager/rf/transmitters':
        return {
          transmitters: [
            { id: 'tx_a', name: 'Emisor A', device_id: 'a', can_capture: true },
            { id: 'tx_b', name: 'Emisor B', device_id: 'b', can_capture: true },
          ],
        };
      case 'homemanager/rf/devices':
        return {
          devices: [
            {
              id: 'tx_a',
              name: 'Emisor A',
              device_id: 'a',
              manufacturer: 'Athom',
              model: 'RF IR Remote',
              online: true,
              has_package: true,
              can_capture: true,
            },
            {
              id: 'sensor_b',
              name: 'Sensor B',
              device_id: 'c',
              manufacturer: 'Espressif',
              model: 'ESP32',
              online: true,
              has_package: false,
              can_capture: false,
            },
          ],
          default_receiver: defaultReceiver,
          package: `github://Delpoo/homemanager/esphome/homemanager-rf.yaml@v${version}`,
          builder_url: '/hassio/ingress/5c53de3b_esphome',
        };
      case 'homemanager/rf/default_receiver':
        defaultReceiver = message.receiver;
        return null;
      case 'homemanager/rf/test':
        return { result: 'sent', transmitter: message.transmitter, pulse_us: message.pulse_us };
      case 'homemanager/rf/remote/save': {
        const existing = message.remote_id && find(message.remote_id);
        if (existing) return Object.assign(existing, message.remote);
        const remote = {
          id: slug(message.remote.name),
          icon: null,
          description: null,
          protocol: 1,
          nbits: 24,
          pulse_us: 350,
          repeats: 5,
          wait_us: 0,
          measured_pulse_us: null,
          ...message.remote,
          buttons: [],
          parts: [],
          layout: null,
        };
        library.push(remote);
        return remote;
      }
      case 'homemanager/rf/button/save': {
        const remote = find(message.remote_id);
        let button = remote.buttons.find(item => item.id === message.button_id);
        if (button) Object.assign(button, message.button);
        else {
          button = { id: slug(message.button.name), icon: null, ...message.button, fingerprint: 'abcd1234' };
          remote.buttons.push(button);
        }
        if (message.role) remote.parts.find(part => part.id === message.role.part).roles[message.role.role] = button.id;
        return button;
      }
      case 'homemanager/rf/parts/save': {
        const remote = find(message.remote_id);
        remote.parts = message.parts.map(part => ({ ...part, id: part.id ?? slug(part.name) }));
        return remote;
      }
      case 'homemanager/rf/layout/save': {
        const remote = find(message.remote_id);
        remote.layout = message.layout;
        return structuredClone(remote);
      }
      case 'homemanager/rf/press':
        return { result: 'sent' };
    }
    throw Object.assign(new Error(message.type), { code: 'unknown_command' });
  };
  hass.connection.subscribeMessage = async (callback, message) => {
    calls.push(structuredClone(message));
    capture = callback;
    return () => (capture = null);
  };
  window.rfServer = {
    calls,
    library,
    send: event => capture?.(event),
    heard: candidate =>
      capture?.({
        candidate: {
          candidate_id: 'c1',
          transmitter: 'tx_a',
          protocol: 1,
          nbits: 24,
          pulse_us: 400,
          frames: 1,
          bursts: 1,
          burst_frames: 1,
          confirmed: false,
          confirmed_by: null,
          fingerprint: 'abcd1234',
          known_as: [],
          ...candidate,
        },
      }),
  };
  await customElements.whenDefined('homemanager-rf');
  const element = document.createElement('homemanager-rf');
  document.querySelector('#mount').replaceChildren(element);
  element.hass = hass;
}
const button = (id, name, icon = null) => ({ id, name, icon, fingerprint: 'abcd1234' });
export const ceiling = (extra = {}) => ({
  id: 'techo',
  name: 'Techo',
  icon: 'mdi:ceiling-fan-light',
  description: null,
  transmitter: 'tx_a',
  protocol: 1,
  nbits: 24,
  pulse_us: 400,
  repeats: 5,
  wait_us: 0,
  measured_pulse_us: 400,
  buttons: [
    button('off', 'Apagar'),
    button('v1', 'Velocidad 1'),
    button('v2', 'Velocidad 2'),
    button('v3', 'Velocidad 3'),
    button('luz', 'Luz'),
    button('luz-off', 'Luz off'),
  ],
  parts: [],
  layout: null,
  ...extra,
});
