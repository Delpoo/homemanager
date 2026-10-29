import test from 'node:test';
import assert from 'node:assert/strict';
import {
  actionIdsOf,
  controlsOf,
  cycleIndex,
  nextIndex,
  offIcon,
  pinnedControls,
  sliderSource,
  stepLabel,
  suggestControls,
  tapControl,
} from '../../.work/card/device-controls.js';

// Labels read in Spanish, as for a Home Assistant user whose language is es.
globalThis.__homemanagerLanguage = 'es';
// Synthetic devices and entities only.
const action = (service, entityId = 'light.sample') => ({
  domain: entityId.split('.')[0],
  service,
  target: { entity_id: entityId },
});
const configuration = {
  actions: { on: action('turn_on'), off: action('turn_off'), press: action('press', 'button.sample_1h') },
};
const device = (bindings = {}, display = {}) => ({
  id: 'sample',
  display: { label: 'Muestra', icon: 'mdi:lightbulb', ...display },
  bindings: { entityId: 'light.sample', primaryAction: null, advancedPopupId: null, ...bindings },
});
const cycle = {
  id: 'power',
  type: 'cycle',
  label: 'Encender / Apagar',
  steps: [
    { actionId: 'on', icon: 'mdi:lightbulb' },
    { actionId: 'off', icon: 'mdi:lightbulb-off' },
  ],
};
const hass = state => ({ states: { 'light.sample': { state, attributes: {} } } });

test('without tap a plan keeps its primary action; tap null opens the panel; tap names a control', () => {
  assert.equal(tapControl(device()), null);
  assert.deepEqual(tapControl(device({ primaryAction: 'on' })).steps, [{ actionId: 'on' }]);
  assert.equal(tapControl(device({ primaryAction: 'on', controls: [cycle], tap: null })), null);
  assert.equal(tapControl(device({ controls: [cycle], tap: 'power' })), cycle);
});

test('0.5 quick actions read as buttons until the device has controls of its own', () => {
  const quick = [{ id: 'quick-1', label: 'Encender', actionId: 'on' }];
  assert.deepEqual(controlsOf(device({ quickActions: quick })), [
    { id: 'quick-1', type: 'button', label: 'Encender', steps: [{ actionId: 'on' }] },
  ]);
  assert.deepEqual(controlsOf(device({ quickActions: quick, controls: [cycle] })), [cycle]);
  assert.deepEqual(actionIdsOf(device({ primaryAction: 'press', controls: [cycle] })), ['press', 'on', 'off']);
});

test('a cycle follows the live state when its steps say what they leave, else what was sent last', () => {
  assert.equal(cycleIndex(cycle, configuration, hass('off'), undefined), 1);
  assert.equal(cycleIndex(cycle, configuration, hass('on'), 1), 0);
  // Unknown state (an RF fan before anyone used it): the remembered step, or nothing yet.
  assert.equal(cycleIndex(cycle, configuration, hass('unknown'), 1), 1);
  assert.equal(cycleIndex(cycle, configuration, hass('unknown'), undefined), -1);
  assert.equal(nextIndex(cycle, -1), 0);
  assert.equal(nextIndex(cycle, 1), 0);
  assert.equal(nextIndex(cycle, 0), 1);
  // Steps without a known result (a button press) always use what was sent last.
  const presses = { ...cycle, steps: [{ actionId: 'press' }, { actionId: 'on' }] };
  assert.equal(cycleIndex(presses, configuration, hass('on'), 0), 0);
  // A remembered step beyond the steps (the cycle was shortened) is ignored.
  assert.equal(cycleIndex(presses, configuration, hass('on'), 5), -1);
});

test('step labels and pins come from the controls', () => {
  assert.equal(stepLabel(cycle, 0, configuration), 'Encender');
  assert.equal(stepLabel({ ...cycle, steps: [{ actionId: 'on', label: 'Prender' }] }, 0, configuration), 'Prender');
  assert.equal(
    stepLabel({ id: 'b', type: 'button', label: '1H', steps: [{ actionId: 'press' }] }, 0, configuration),
    '1H',
  );
  const level = { id: 'level', type: 'slider', label: 'Nivel', steps: [] };
  assert.deepEqual(
    pinnedControls(device({ controls: [cycle, level] }, { pinned: ['level', 'missing'] })).map(item => item.id),
    ['level'],
  );
});

test('a slider without steps adjusts the adjustable value of its entity, or of the device', () => {
  const level = { id: 'level', type: 'slider', label: 'Nivel', steps: [] };
  const entities = {
    'light.sample': { state: 'on', attributes: { supported_color_modes: ['brightness'], brightness: 255 } },
    'light.other': { state: 'on', attributes: { supported_color_modes: ['onoff'] } },
  };
  const found = sliderSource(level, device(), id => entities[id]);
  assert.equal(found.entityId, 'light.sample');
  assert.equal(found.control.kind, 'range');
  assert.equal(found.control.value, 100);
  // An entity with nothing to adjust gives no slider value; a stepped slider has none either.
  assert.equal(
    sliderSource({ ...level, entityId: 'light.other' }, device(), id => entities[id]),
    null,
  );
  assert.equal(
    sliderSource({ ...level, steps: [{ actionId: 'on' }, { actionId: 'off' }] }, device(), id => entities[id]),
    null,
  );
});

test('suggested controls are generic and visible: a cycle for on/off, a button for presses', () => {
  const allowed = {
    light: ['turn_on', 'turn_off', 'toggle'],
    button: ['press'],
    script: ['turn_on'],
    cover: ['open_cover', 'close_cover'],
  };
  const canCall = (domain, service) => (allowed[domain] ?? []).includes(service);
  const light = suggestControls('lamp', 'light.sample', 'mdi:lightbulb', canCall);
  assert.equal(light.tap, 'power');
  assert.deepEqual(
    light.controls[0].steps.map(step => [step.actionId, step.label, step.icon]),
    [
      ['lamp-turn-on', 'Encender', 'mdi:lightbulb'],
      ['lamp-turn-off', 'Apagar', 'mdi:lightbulb-off'],
    ],
  );
  assert.deepEqual(light.actions['lamp-turn-on'], action('turn_on'));
  assert.equal(suggestControls('b', 'button.sample_1h', 'mdi:timer', canCall).controls[0].type, 'button');
  assert.equal(suggestControls('c', 'cover.sample', 'mdi:curtains', canCall).controls[0].steps[1].label, 'Cerrar');
  // Nothing callable: no control, a tap opens the panel.
  assert.deepEqual(suggestControls('s', 'sensor.sample', 'mdi:gauge', canCall), {
    actions: {},
    controls: [],
    tap: null,
  });
  assert.equal(offIcon('mdi:fan'), 'mdi:fan-off');
  assert.equal(offIcon('mdi:unknown-thing'), 'mdi:unknown-thing');
});
