// Fictional ESPHome hardware for the disposable Home Assistant: every RF/IR
// request is answered here, in memory. Capture subscriptions "hear" a button
// 2 s after they start. Nothing here comes from a real home.
(() => {
  const slug = name =>
    name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'x';
  const rfLib = [];
  const irLib = [];
  let defaultReceiver = null;
  let n = 0;
  const device = (id, name, extra = {}) => ({
    id,
    name,
    device_id: 'dev_' + id,
    manufacturer: 'Athom',
    model: 'RF IR Remote',
    online: true,
    has_package: false,
    can_capture: false,
    ...extra,
  });
  const answer = message => {
    const t = message.type;
    switch (t) {
      case 'homemanager/rf/library':
        return { remotes: structuredClone(rfLib) };
      case 'homemanager/rf/transmitters':
        return { transmitters: [{ id: 'athom_a', name: 'Athom A', device_id: 'dev_athom_a', can_capture: true }] };
      case 'homemanager/rf/devices':
        return {
          devices: [
            device('athom_a', 'Athom A', { has_package: true, can_capture: true }),
            device('athom_b', 'Athom B'),
            device('energy_meter', 'Medidor de energía', { model: 'Energy Monitor' }),
            device('old_board', 'Placa vieja', { online: false, manufacturer: 'Espressif', model: 'ESP8266' }),
          ],
          default_receiver: defaultReceiver,
          package: 'github://Delpoo/homemanager/esphome/homemanager-rf.yaml@v0.13.0-beta.1',
          builder_url: '/hassio/ingress/5c53de3b_esphome',
        };
      case 'homemanager/rf/default_receiver':
        defaultReceiver = message.receiver;
        return null;
      case 'homemanager/rf/remote/save': {
        const existing = message.remote_id && rfLib.find(r => r.id === message.remote_id);
        if (existing) return Object.assign(existing, message.remote);
        const remote = {
          id: slug(message.remote.name),
          icon: null,
          description: null,
          transmitter: 'athom_a',
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
        rfLib.push(remote);
        return remote;
      }
      case 'homemanager/rf/remote/delete':
        rfLib.splice(rfLib.findIndex(r => r.id === message.remote_id), 1);
        return null;
      case 'homemanager/rf/button/save': {
        const remote = rfLib.find(r => r.id === message.remote_id);
        let button = remote.buttons.find(b => b.id === message.button_id);
        if (button) Object.assign(button, message.button);
        else {
          button = { id: slug(message.button.name), icon: null, ...message.button, fingerprint: 'ab' + ++n };
          remote.buttons.push(button);
        }
        return button;
      }
      case 'homemanager/rf/button/delete': {
        const remote = rfLib.find(r => r.id === message.remote_id);
        remote.buttons = remote.buttons.filter(b => b.id !== message.button_id);
        return null;
      }
      case 'homemanager/rf/parts/save': {
        const remote = rfLib.find(r => r.id === message.remote_id);
        remote.parts = message.parts.map(p => ({ ...p, id: p.id ?? slug(p.name) }));
        return remote;
      }
      case 'homemanager/rf/layout/save': {
        const remote = rfLib.find(r => r.id === message.remote_id);
        remote.layout = message.layout;
        return structuredClone(remote);
      }
      case 'homemanager/rf/press':
      case 'homemanager/rf/test':
        return { result: 'sent', transmitter: 'athom_a', pulse_us: 350 };
      case 'homemanager/remotes/library':
        return { remotes: [...structuredClone(rfLib).map(r => ({ ...r, source: 'rf' })), ...structuredClone(irLib)] };
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
      case 'homemanager/remotes/ir/save': {
        let remote = message.remote_id && irLib.find(r => r.id === message.remote_id);
        if (!remote) {
          remote = { source: 'ir', id: slug(message.remote_name), name: message.remote_name, icon: null, description: null, layout: null, buttons: [] };
          irLib.push(remote);
        }
        remote.buttons.push({ id: slug(message.button_name), name: message.button_name, icon: null, fingerprint: 'ir' + ++n });
        return { id: remote.id };
      }
      case 'homemanager/remotes/ir/test':
      case 'homemanager/remotes/ir/press':
        return { result: 'sent' };
      case 'homemanager/remotes/ir/settings':
        return { emitter: 'esphome:a-tx', buttons: {} };
      case 'homemanager/remotes/ir/remote/edit': {
        const remote = irLib.find(r => r.id === message.remote_id);
        if (message.changes === null) {
          irLib.splice(irLib.indexOf(remote), 1);
          return null;
        }
        Object.assign(remote, message.changes);
        return structuredClone(remote);
      }
      case 'homemanager/remotes/ir/button/edit': {
        const remote = irLib.find(r => r.id === message.remote_id);
        if (message.changes === null) remote.buttons = remote.buttons.filter(b => b.id !== message.button_id);
        else Object.assign(remote.buttons.find(b => b.id === message.button_id), message.changes);
        return structuredClone(remote);
      }
    }
    return undefined;
  };
  const patch = connection => {
    if (connection.__hmFake) return;
    connection.__hmFake = true;
    const send = connection.sendMessagePromise.bind(connection);
    const subscribe = connection.subscribeMessage.bind(connection);
    connection.sendMessagePromise = async message => {
      if (/^homemanager\/(rf|remotes)\//.test(message.type)) {
        window.__hmCalls = [...(window.__hmCalls ?? []), message];
        const result = answer(message);
        if (result !== undefined) return structuredClone(result);
      }
      return send(message);
    };
    connection.subscribeMessage = async (callback, message, options) => {
      if (message.type === 'homemanager/rf/capture') {
        const timer = setTimeout(
          () =>
            callback({
              candidate: {
                candidate_id: 'c' + ++n,
                transmitter: message.transmitter ?? 'athom_a',
                protocol: 1,
                nbits: 24,
                pulse_us: 350,
                frames: 3,
                bursts: 1,
                burst_frames: 3,
                confirmed: true,
                confirmed_by: null,
                fingerprint: 'fp' + n,
                known_as: [],
              },
            }),
          2000,
        );
        return async () => clearTimeout(timer);
      }
      if (message.type === 'homemanager/remotes/ir/capture') {
        const timer = setTimeout(() => callback({ candidate_id: 'ir' + ++n, count: 68, duration_us: 67_500 }), 2000);
        return async () => clearTimeout(timer);
      }
      return subscribe(callback, message, options);
    };
  };
  setInterval(() => {
    const connection = document.querySelector('home-assistant')?.hass?.connection;
    if (connection) patch(connection);
  }, 50);
})();
