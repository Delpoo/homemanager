import test from 'node:test';
import assert from 'node:assert/strict';
import { snapToStep, keyStep, unsavedCount, validStep } from '../../.work/model/move-grid.js';
import { moduleSummary } from '../../.work/model/module-summary.js';

test('moving lands on the grid, Alt or no grid moves freely (#90)', () => {
  assert.equal(snapToStep(0.2537, 0.01), 0.25);
  assert.equal(snapToStep(0.2537, 0.01, true), 0.2537);
  assert.equal(snapToStep(0.2537, 0), 0.2537);
  assert.equal(snapToStep(0.0126, 0.025), 0.025);
  assert.equal(keyStep(0.01, false), 0.01);
  assert.equal(keyStep(0.01, true), 0.05);
  assert.equal(keyStep(0, false), 0.002);
  assert.equal(validStep('0.5'), 0.01);
  assert.equal(validStep('0.025'), 0.025);
  assert.equal(unsavedCount(0, true), 1);
  assert.equal(unsavedCount(3, false), 0);
});

test('each module card has a one-line summary (#71)', () => {
  const device = {
    id: 'd',
    roomId: null,
    kind: 'light',
    display: { label: 'Luz', icon: 'mdi:lamp', show: 'both', pinned: ['a', 'b'] },
    bindings: {
      entityId: 'light.ficticia',
      readings: ['sensor.a', 'light.ficticia'],
      tap: 'power',
      hold: { action: 'screen' },
      controls: [{ id: 'power', type: 'toggle' }],
    },
  };
  const context = { rules: 2, controlLabel: id => (id === 'power' ? 'Encender' : undefined) };
  assert.deepEqual(moduleSummary('device', device, context), { key: '{count} lecturas', vars: { count: 2 } });
  assert.deepEqual(moduleSummary('indicators', device, context), { key: 'Muestra icono y valor' });
  assert.deepEqual(moduleSummary('gestures', device, context), [
    { key: 'Tocar:' },
    { key: '{name}', vars: { name: 'Encender' } },
    { key: '· Mantener:' },
    { key: 'pantalla' },
  ]);
  assert.deepEqual(moduleSummary('control', device, context), { key: '1 control' });
  assert.deepEqual(moduleSummary('pinned', device, context), { key: '{count} atajos', vars: { count: 2 } });
  assert.deepEqual(moduleSummary('rules', device, context), { key: '{count} reglas lo afectan', vars: { count: 2 } });
  assert.deepEqual(moduleSummary('device', { ...device, bindings: { entityId: null } }, context), {
    key: 'Sin vincular',
  });
});

test('a fictional robot vacuum: programs are actions, the robot state is the suggestion (#91)', async () => {
  const { deviceCatalog } = await import('../../.work/model/device-catalog.js');
  const entity = (state, attributes = {}) => ({ state, attributes });
  const states = {
    'vacuum.robot_ficticio': entity('docked', { friendly_name: 'Robot' }),
    'sensor.robot_ficticio_bateria': entity('87', { device_class: 'battery', unit_of_measurement: '%' }),
    'button.robot_ficticio_profundo': entity('unknown', { friendly_name: 'Profundo' }),
    'button.robot_ficticio_estandar': entity('unknown', { friendly_name: 'Estándar' }),
    'button.robot_ficticio_barrido': entity('unknown', { friendly_name: 'Barrido' }),
    'button.robot_ficticio_fregado': entity('unknown', { friendly_name: 'Fregado' }),
    'select.robot_ficticio_modo_fregado': entity('medio', { options: ['bajo', 'medio', 'alto'] }),
    'sensor.robot_ficticio_wifi': entity('-50', { device_class: 'signal_strength' }),
  };
  const entities = Object.fromEntries(
    Object.keys(states).map(id => [
      id,
      {
        device_id: 'robot',
        entity_category: id.includes('modo_fregado') ? 'config' : id.includes('wifi') ? 'diagnostic' : null,
      },
    ]),
  );
  const [robot] = deviceCatalog({ states, entities, devices: { robot: { name: 'Robot ficticio' } } });
  assert.equal(robot.primaryEntityId, 'vacuum.robot_ficticio');
  assert.deepEqual(robot.readings.map(r => r.entityId).sort(), [
    'sensor.robot_ficticio_bateria',
    'vacuum.robot_ficticio',
  ]);
  assert.equal(robot.actions.length, 5);
  assert.ok(robot.actions.some(a => a.entityId === 'select.robot_ficticio_modo_fregado'));
  assert.equal(robot.excluded, 1);
  // Each entity appears once across both lists.
  const all = [...robot.readings, ...robot.actions].map(r => r.entityId);
  assert.equal(new Set(all).size, all.length);
});

test('value format: decimals, abbreviation, language and ranges (#92)', async () => {
  const { formatReading, abbreviate, rangeColor, shownValues } = await import('../../.work/model/value-style.js');
  assert.equal(formatReading('1753.234', 'W', {}, 'es'), '1,75 kW');
  assert.equal(formatReading('1753.234', 'W', {}, 'en'), '1.75 kW');
  assert.equal(formatReading('1753.234', 'W', { unit: false, decimals: 0 }, 'en'), '1,753');
  assert.equal(formatReading('27.66', '°C', { decimals: 1 }, 'es'), '27,7 °C');
  assert.equal(formatReading('40.5', '%', {}, 'es', 0), '41 %');
  assert.equal(formatReading('encendido', '', {}, 'es'), 'encendido');
  assert.deepEqual(abbreviate(950, 'W'), { value: 950, unit: 'W' });
  assert.deepEqual(abbreviate(2_500_000, 'Wh'), { value: 2.5, unit: 'MWh' });
  const ranges = [
    { from: 30, color: '#d0453a' },
    { from: 0, color: '#3f8f5f' },
    { from: 20, color: '#d98b1f' },
  ];
  assert.equal(rangeColor(-5, ranges), undefined);
  assert.equal(rangeColor(10, ranges), '#3f8f5f');
  assert.equal(rangeColor(25, ranges), '#d98b1f');
  assert.equal(rangeColor(35, ranges), '#d0453a');
  const hass = {
    locale: { language: 'es' },
    states: {
      'sensor.ficticio_potencia': { state: '1753.23', attributes: { unit_of_measurement: 'W' } },
      'sensor.ficticio_temp': { state: '27.7', attributes: { unit_of_measurement: '°C' } },
      'sensor.ficticio_texto': { state: 'un texto muy largo que no entra en ningún símbolo del plano', attributes: {} },
    },
  };
  const device = {
    id: 'd',
    roomId: null,
    kind: 'sensor',
    display: {
      label: 'Medidor',
      icon: 'mdi:flash',
      values: [
        { entity: 'sensor.ficticio_potencia', label: 'Pot.' },
        { entity: 'sensor.ficticio_temp', ranges, dot: true },
        { entity: 'sensor.ficticio_texto' },
      ],
    },
    bindings: { entityId: 'sensor.ficticio_potencia' },
  };
  const shown = shownValues(device, hass);
  assert.equal(shown[0].text, '1,75 kW');
  assert.equal(shown[0].full, 'Pot. 1,75 kW');
  assert.equal(shown[1].dot, '#d98b1f');
  assert.equal(shown[1].color, undefined);
  // Never cut: the whole text travels with the value.
  assert.equal(shown[2].full, hass.states['sensor.ficticio_texto'].state);
});

test('symbol size: house, space, in between and limits; none keeps it fixed (#94)', async () => {
  const { symbolScale, cameraForView, viewFromCamera } = await import('../../.work/model/symbol-scale.js');
  const sizes = { house: 1, room: 2, min: 0.8, max: 1.8 };
  const plain = { display: {} };
  assert.equal(symbolScale('house', 1, undefined, plain), null);
  assert.equal(symbolScale('house', 1, undefined, { display: { scale: 1.3 } }), 1.3);
  assert.equal(symbolScale('house', 1, sizes, plain), 1);
  assert.equal(symbolScale('room', 1, sizes, plain), 1.8);
  const middle = symbolScale('house', 2, sizes, plain);
  assert.ok(middle > 1 && middle < 1.8);
  assert.equal(symbolScale('house', 0.5, sizes, plain), 1);
  assert.equal(symbolScale('house', 1, { ...sizes, house: 0.5 }, plain), 0.8);
  assert.equal(symbolScale('room', 1, sizes, { display: { roomScale: 1.2 } }), 1.2);
  const box = { x: 10, y: 20, width: 1000, height: 700 };
  const viewport = { width: 800, height: 600 };
  const view = viewFromCamera({ x: -300, y: -100, scale: 1.5 }, box, 0.75, viewport, 'living');
  const camera = cameraForView(view, box, 0.75, viewport);
  assert.ok(Math.abs(camera.x + 300) < 0.5 && Math.abs(camera.y + 100) < 0.5 && Math.abs(camera.scale - 1.5) < 0.001);
  assert.equal(view.room, 'living');
});

test('a symbol says whether it is linked, unless it needs no link (#95)', async () => {
  const { symbolSpec } = await import('../../.work/model/symbol-spec.js');
  const base = { id: 'x', roomId: null, kind: 'light', display: { label: 'X', icon: 'mdi:lamp' } };
  assert.equal(symbolSpec({ ...base, bindings: { entityId: 'light.ficticia' } }, undefined, 0).link, 'linked');
  assert.equal(symbolSpec({ ...base, bindings: { entityId: null } }, undefined, 0).link, 'unlinked');
  assert.equal(
    symbolSpec({ ...base, display: { ...base.display, standalone: true }, bindings: { entityId: null } }, undefined, 0)
      .link,
    null,
  );
});
