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
  assert.deepEqual(moduleSummary('rules', device, context), { key: '{count} alertas lo usan', vars: { count: 2 } });
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

test('a fictional robot offers programs, modes and actions as shortcuts without a designed control (#96)', async () => {
  const { deviceActions, addShortcut, removeShortcut, shortcutId, MAX_SHORTCUTS } = await import(
    '../../.work/model/device-actions.js'
  );
  const states = {
    'vacuum.robot_ficticio': { state: 'docked', attributes: { friendly_name: 'Robot' } },
    'button.robot_ficticio_profundo': { state: 'unknown', attributes: { friendly_name: 'Profundo' } },
    'button.robot_ficticio_estandar': { state: 'unknown', attributes: { friendly_name: 'Estándar' } },
    'select.robot_ficticio_fregado': { state: 'medio', attributes: { options: ['bajo', 'alto'] } },
  };
  const entities = Object.fromEntries(Object.keys(states).map(id => [id, { device_id: 'robot' }]));
  const symbol = {
    id: 'robot',
    roomId: null,
    kind: 'equipment',
    display: { label: 'Robot', icon: 'mdi:robot-vacuum' },
    bindings: { entityId: 'vacuum.robot_ficticio', deviceId: 'robot' },
  };
  const actions = deviceActions(symbol, { states, entities });
  assert.deepEqual(
    actions.filter(a => a.group === 'program').map(a => a.name),
    ['Estándar', 'Profundo'],
  );
  assert.equal(actions.filter(a => a.group === 'mode').length, 2);
  assert.ok(actions.some(a => a.action.domain === 'vacuum' && a.action.service === 'return_to_base'));
  const plan = { actions: {}, catalog: { devices: [structuredClone(symbol)] } };
  const deep = actions.find(a => a.name === 'Profundo');
  const once = addShortcut(plan, 'robot', deep, 'Profundo');
  const device = once.catalog.devices[0];
  assert.deepEqual(device.display.pinned, [shortcutId(deep)]);
  const control = device.bindings.controls[0];
  assert.equal(control.type, 'button');
  assert.deepEqual(once.actions[control.steps[0].actionId], {
    domain: 'button',
    service: 'press',
    target: { entity_id: 'button.robot_ficticio_profundo' },
  });
  let full = once;
  for (const action of actions.filter(a => a !== deep).slice(0, MAX_SHORTCUTS - 1))
    full = addShortcut(full, 'robot', action, action.name);
  assert.throws(() => addShortcut(full, 'robot', actions.at(-1), 'x'), /shortcut_limit/);
  const back = removeShortcut(once, 'robot', deep);
  assert.equal(back.catalog.devices[0].display.pinned, undefined);
  assert.deepEqual(back.actions, {});
});

test('gestures that leave the plan only accept safe links and real pages (#97)', async () => {
  const { safeLink, safePath, resolveAction } = await import('../../.work/model/gestures.js');
  for (const ok of ['https://example.com/x', 'exampleapp://open', 'intent://scan#Intent;scheme=x;end'])
    assert.equal(safeLink(ok), true, ok);
  for (const bad of ['javascript:alert(1)', 'JavaScript:x', 'data:text/html,x', 'file:///x', 'http://example.com'])
    assert.equal(safeLink(bad), false, bad);
  assert.equal(safePath('/config/devices/dashboard'), true);
  assert.equal(safePath('//evil.example'), false);
  const device = { id: 'd', bindings: { entityId: 'light.x' } };
  assert.deepEqual(resolveAction({ action: 'url', url: 'javascript:alert(1)' }, device), {
    action: 'screen',
    missing: true,
  });
  assert.deepEqual(resolveAction({ action: 'more-info' }, { id: 'd', bindings: { entityId: null } }), {
    action: 'screen',
    missing: true,
  });
});

test('home status lists what does not work, each kind with its place (#74)', async () => {
  const { homeStatus } = await import('../../.work/model/home-status.js');
  const device = (id, bindings, display = {}) => ({ id, display: { label: id, ...display }, bindings });
  const configuration = {
    catalog: {
      devices: [
        device('sin-vinculo', { entityId: null }),
        device('dibujo', { entityId: null }, { standalone: true }),
        device('caido', { entityId: 'light.caida' }),
        device('incierto', { entityId: 'sensor.incierto' }),
        device('mando', { entityId: null, remoteId: 'borrado' }),
      ],
    },
    planViews: [{ id: 'noche', name: 'Noche', light: {} }],
    rules: [{ id: 'r', name: 'Regla vieja', sources: [{ reading: 'sensor.no_existe' }], symbols: ['sin-vinculo'] }],
  };
  const hass = {
    states: { 'light.caida': { state: 'unavailable' }, 'sensor.incierto': { state: 'unknown' } },
  };
  const issues = homeStatus(configuration, hass, { remotes: new Set(), storageShare: 0.85 });
  const kinds = issues.map(issue => issue.kind);
  assert.deepEqual(kinds, [
    'storage',
    'remote-missing',
    'offline',
    'unlinked',
    'rule-target',
    'unknown-state',
    'view-image',
  ]);
  assert.ok(!issues.some(issue => issue.deviceId === 'dibujo'));
  assert.deepEqual(homeStatus({ catalog: { devices: [] } }, hass), []);
});

test('base rules: absent means v0.11 limits; battery needs evidence (#60)', async () => {
  const { limitsOf, appliesTo } = await import('../../.work/model/base-rules.js');
  const { alertsOf } = await import('../../.work/model/alerts.js');
  assert.deepEqual(limitsOf(undefined), { battery: 15, unavailable: 10, safety: true });
  assert.deepEqual(limitsOf({ battery: { below: 30 }, unavailable: { enabled: false } }), {
    battery: 30,
    unavailable: null,
    safety: true,
  });
  const lamp = {
    id: 'l',
    roomId: null,
    kind: 'light',
    display: { label: 'L', icon: 'mdi:lamp' },
    bindings: { entityId: 'light.l' },
  };
  const sensor = { ...lamp, id: 's', bindings: { entityId: 'sensor.s' } };
  const hass = {
    states: {
      'light.l': { state: 'on', attributes: {} },
      'sensor.s': { state: '22', attributes: { battery_level: 20 } },
    },
  };
  assert.equal(appliesTo('battery', lamp, hass), false);
  assert.equal(appliesTo('battery', sensor, hass), true);
  assert.equal(
    alertsOf(sensor, hass, Date.now()).some(a => a.rule === 'battery'),
    false,
  );
  assert.equal(
    alertsOf(sensor, hass, Date.now(), {}, { battery: { below: 25 } }).some(a => a.rule === 'battery'),
    true,
  );
});
