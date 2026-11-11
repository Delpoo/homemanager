import './harness.js';
import { ceiling, mountRfFixture } from './rf-server.js';

const { hass, original } = window.testHarness;
const { version } = await import('../../../dist/build-status.json', { with: { type: 'json' } });
const name = 'Aire de prueba';
const transmitter = 'infrared.synthetic_emitter';
const learned = [
  {
    id: 'demo-ir',
    name: 'Mando de prueba',
    source: 'ir',
    icon: null,
    layout: null,
    description: null,
    buttons: [{ id: 'power', name: 'Señal original', icon: null, fingerprint: 'synthetic' }],
  },
];
const capability = options => ({ type: 'select', options });
const time = { type: 'time', step: 600 };
const state = {
  power: true,
  temperature: 24,
  mode: 'cool',
  fan: 'auto',
  vane: 'auto',
  wide_vane: 'center',
  econo_cool: false,
  clock: '20:00',
  native_timer: 'none',
  start_time: '21:00',
  stop_time: '22:00',
};
const sampleControl = () => ({
  id: 'demo-absolute',
  name,
  profile: 'mitsubishi-electric-144',
  brand: 'Mitsubishi Electric',
  model: 'Perfil de prueba',
  emitter: transmitter,
  requested: null,
  preset: null,
  schedules: [],
  state: { ...state },
  capabilities: {
    power: { type: 'boolean' },
    temperature: { type: 'number', min: 16, max: 31, step: 0.5, unit: '°C' },
    mode: capability(['cool', 'heat', 'dry', 'auto', 'fan']),
    fan: capability(['auto', 'quiet', 'low', 'medium', 'high', 'max']),
    vane: capability(['auto', 'highest', 'middle', 'lowest', 'swing']),
    wide_vane: capability(['left', 'center', 'right', 'auto']),
    econo_cool: { type: 'boolean', mode: 'cool' },
    clock: time,
    native_timer: capability(['none', 'start', 'stop', 'both']),
    start_time: time,
    stop_time: time,
  },
});
const controls = [sampleControl()];
const widget = (id, type, x, y, w, h, attributes) => ({
  id,
  type,
  x,
  y,
  w,
  h,
  buttons: [],
  label: null,
  icon: null,
  ...attributes,
});
const layout = [
  widget('canvas', 'canvas', 0, 0, 6, 3),
  widget('vertical', 'slider', 0, 0, 2, 3, {
    label: 'Severity',
    buttons: ['v1', 'v2', 'v3'],
    orientation: 'vertical',
    values: { min: 1, max: 3, step: 1 },
    reading: 'sensor.synthetic_temperature',
    attribute: 'level',
  }),
  widget('graph', 'graph', 2, 0, 4, 2, { label: 'Potencia', reading: 'sensor.synthetic_power', period: '24h' }),
  widget('off', 'button', 2, 2, 4, 1, { buttons: ['off'], label: 'Apagar' }),
];
hass.states['sensor.synthetic_power'] = {
  state: '684.32',
  attributes: { unit_of_measurement: 'W', friendly_name: 'Potencia de prueba' },
};
hass.states['sensor.synthetic_temperature'].attributes.level = 2;
await mountRfFixture([ceiling({ layout })], version, { mount: false });

const home = {
  home_id: 'demo',
  title: 'Casa de prueba',
  revision: 1,
  configuration: {
    ...original.configuration,
    schemaVersion: 2,
    rooms: [
      { id: 'living', label: 'Espacio A' },
      { id: 'kitchen', label: 'Espacio B' },
      { id: 'office', label: 'Espacio C' },
    ],
    catalog: { ...original.configuration.catalog, schemaVersion: 2 },
  },
};
const old = hass.callWS.bind(hass);
const subscribe = hass.connection.subscribeMessage.bind(hass.connection);
const calls = [];
const history = [];
let sequence = 0;
hass.callWS = async message => {
  calls.push(structuredClone(message));
  switch (message.type) {
    case 'homemanager/homes':
      return { homes: [home] };
    case 'homemanager/home/get':
      return home;
    case 'homemanager/remotes/library':
      return { remotes: structuredClone(learned) };
    case 'homemanager/remotes/ir/devices':
      return {
        emitters: [{ id: transmitter, name: 'Emisor IR de prueba' }],
        receivers: [{ id: transmitter, name: 'Receptor IR de prueba' }],
      };
    case 'homemanager/remotes/resources':
      return structuredClone({
        controls,
        learned,
        profiles: ['mitsubishi-electric-144'],
        zone: 'Asia/Singapore',
        emitters: [{ id: transmitter, name: 'Emisor IR de prueba' }],
      });
    case 'homemanager/remotes/absolute': {
      const fields = message.fields;
      let item = controls.find(control => control.id === message.control_id);
      if (message.command === 'create') {
        item = {
          ...sampleControl(),
          id: 'synthetic-' + ++sequence,
          name: fields.name,
          brand: fields.brand,
          model: fields.model,
        };
        controls.push(item);
      } else if (message.command === 'send') {
        item.state = fields.state;
        item.requested = { state: fields.state, status: 'sent', at: new Date().toISOString() };
      } else if (message.command === 'preset') item.preset = fields.state;
      else if (message.command === 'configure') Object.assign(item, fields);
      else if (message.command === 'design') item.layout = fields.layout;
      else if (message.command === 'link-powerful') item.powerful_configured = !fields.remove;
      else if (message.command === 'powerful') item.powerful = new Date(Date.now() + 900_000).toISOString();
      else if (message.command === 'remove') controls.splice(controls.indexOf(item), 1);
      else if (message.command === 'schedule') {
        const index = item.schedules.findIndex(row => row.id === fields.schedule_id);
        if (fields.remove) item.schedules.splice(index, 1);
        else {
          const schedule = { ...fields, id: fields.schedule_id ?? 'schedule-' + ++sequence, next: null };
          if (index < 0) item.schedules.push(schedule);
          else item.schedules[index] = schedule;
        }
      }
      return structuredClone(item);
    }
    case 'homemanager/remotes/catalog/preview':
      return [
        { index: 0, name: 'Apagar', supported: true, fingerprint: 'synthetic' },
        { index: 1, name: 'Función desconocida', supported: false, fingerprint: null },
      ];
    case 'homemanager/remotes/catalog/import': {
      const record = {
        ...learned[0],
        id: 'imported-' + ++sequence,
        name: message.name,
        buttons: [
          {
            id: 'off',
            name: 'Apagar',
            icon: null,
            fingerprint: 'fixture-catalog',
            provenance: {
              source: message.source,
              brand: message.brand,
              model: message.model,
              entry: message.entry,
              revision: message.revision,
              partial: true,
            },
          },
        ],
      };
      learned.push(record);
      return { id: record.id, added: 1, duplicates: 0 };
    }
    case 'homemanager/remotes/ir/test':
    case 'homemanager/remotes/ir/press':
      return { result: 'sent' };
    case 'homemanager/remotes/ir/save':
      learned[0].buttons.push({
        id: 'learned-' + ++sequence,
        name: message.button_name,
        icon: null,
        fingerprint: 'fixture-learned',
      });
      return { id: learned[0].id };
    case 'homemanager/remotes/ir/settings':
      return { emitter: transmitter, buttons: {} };
    case 'homemanager/remotes/diagnostics/candidate':
      return {
        node: null,
        at: null,
        integrity: 'received',
        duration_us: 2100,
        count: 4,
        frames: 1,
        protocol: null,
        levels: [0, 1, 0, 1],
        base_us: 400,
      };
    case 'homemanager/remotes/diagnostics/devices':
      return { emitters: [{ id: transmitter, name: 'Emisor de prueba' }], receivers: [] };
    case 'homemanager/remotes/diagnostics/sheet':
      return {
        identity: {
          source: message.source,
          remote_id: message.remote_id,
          button_id: message.button_id,
          remote_name: 'Control de prueba',
          button_name: 'Botón de prueba',
          icon: null,
        },
        emitter: transmitter,
        original: null,
        prepared: null,
        comparison: null,
        observed: {},
        history: [...history],
      };
    case 'homemanager/remotes/diagnostics/run':
      history.unshift({
        id: 'trial-' + ++sequence,
        kind: 'send',
        status: 'sent',
        emitter: transmitter,
        at: new Date().toISOString(),
        snapshot: false,
      });
      return { id: history[0].id, status: 'sent', saved: true };
    case 'homemanager/remotes/diagnostics/candidate_note':
      return null;
    case 'history/history_during_period': {
      const start = Date.parse(message.start_time);
      const span = Date.now() - start;
      return {
        [message.entity_ids[0]]: [260, 420, 320, 610, 488, 684.32].map((s, index) => ({
          s: String(s),
          lu: (start + (span * index) / 6) / 1000,
        })),
      };
    }
    default:
      return old(message);
  }
};
hass.connection.subscribeMessage = (listener, message, options) => {
  if (message.type === 'homemanager/home/subscribe') return Promise.resolve(() => {});
  if (message.type === 'homemanager/remotes/ir/capture') {
    const timeout = setTimeout(() => listener({ candidate_id: 'fixture-ir', duration_us: 2100, count: 4 }), 350);
    return Promise.resolve(() => clearTimeout(timeout));
  }
  return subscribe(listener, message, options);
};
window.remotesDemoCalls = calls;
const app = document.createElement('homemanager-app');
document.querySelector('#mount').replaceChildren(app);
app.hass = hass;
