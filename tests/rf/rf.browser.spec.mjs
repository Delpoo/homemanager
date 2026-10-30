import { test, expect } from '@playwright/test';

// Synthetic stand-in for the RF websocket API of custom_components/homemanager
// (rf_websocket.py, exercised against real HA in tests/integration/test_rf.py).
// No code ever travels: captures are candidate ids, buttons fingerprints.
import { setup, ceiling, calls } from '../browser/rf-helpers.mjs';

test('a new remote is a name and an icon; any button is learned, tried and saved', async ({ page }) => {
  const rf = await setup(page);
  await rf.getByRole('button', { name: 'Nuevo control', exact: true }).click();
  await rf.getByLabel('Nombre', { exact: true }).fill('Ventilador estudio');
  await rf.getByRole('button', { name: 'Ventilador de techo', exact: true }).click();
  await rf.getByRole('button', { name: 'Aprender botones', exact: true }).click();
  await expect(rf.getByText('Pulsá un botón del control')).toBeVisible();
  await expect(rf.getByText('Todavía no está guardado')).toBeVisible();

  // One frame is not trusted yet; the reason is on screen.
  await page.evaluate(() => window.rfServer.heard({ frames: 1 }));
  await expect(rf.getByText('Recibido, falta repetir')).toBeVisible();
  await expect(rf.getByText('1 señal(es). Mantené pulsado un momento o pulsalo otra vez.')).toBeVisible();
  // Three identical frames of the same press confirm it.
  await page.evaluate(() =>
    window.rfServer.heard({ frames: 3, burst_frames: 3, confirmed: true, confirmed_by: 'frames' }),
  );
  await expect(rf.getByText('Señal reconocida')).toBeVisible();
  await expect(rf.getByText('3 señales iguales en una pulsación.')).toBeVisible();
  await rf.locator('homemanager-rf-learn summary').click();
  await expect(rf.getByText('Tipo 1 · tamaño 24 · pulso medido de la señal: 400 µs')).toBeVisible();

  await rf.getByRole('button', { name: 'Velocidad 1', exact: true }).click();
  await expect(rf.getByLabel('Nombre del botón')).toHaveValue('Velocidad 1');
  await rf.getByRole('button', { name: 'Probar', exact: true }).click();
  await expect(rf.getByText('¿El equipo reaccionó?')).toBeVisible();
  await rf.getByRole('button', { name: 'No reaccionó', exact: true }).click();
  // One change at a time, and the change is named.
  await expect(rf.getByText('Enviado por Emisor B · 400 µs · 5 repeticiones')).toBeVisible();
  await expect(rf.getByText('✗ Pulso medido · Emisor A · 400 µs · 5 repeticiones')).toBeVisible();
  await rf.getByRole('button', { name: 'Sí, guardar', exact: true }).click();
  await expect(rf.getByText('«Velocidad 1» guardado. Pulsá el siguiente botón.')).toBeVisible();

  expect(
    (await calls(page, 'homemanager/rf/test')).map(call => [call.transmitter, call.pulse_us, call.repeats]),
  ).toEqual([
    ['tx_a', 400, 5],
    ['tx_b', 400, 5],
  ]);
  expect((await calls(page, 'homemanager/rf/remote/save'))[0].remote).toEqual({
    name: 'Ventilador estudio',
    icon: 'mdi:ceiling-fan',
    description: null,
    transmitter: 'tx_b',
    protocol: 1,
    nbits: 24,
    pulse_us: 400,
    repeats: 5,
    wait_us: 0,
    measured_pulse_us: 400,
  });
  expect((await calls(page, 'homemanager/rf/button/save'))[0]).toMatchObject({
    remote_id: 'ventilador-estudio',
    button: { name: 'Velocidad 1', icon: 'mdi:numeric-1' },
    candidate_id: 'c1',
  });
  expect(JSON.stringify(await page.evaluate(() => window.rfServer.calls))).not.toMatch(/"code"/);

  // The learned button is already on the drawn remote, and sends.
  await rf.getByRole('button', { name: 'Listo', exact: true }).click();
  await rf.locator('homemanager-rf-remote').getByRole('button', { name: 'Velocidad 1' }).click();
  await expect(rf.getByText('Enviado: Velocidad 1')).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.rfServer.calls.at(-1)))
    .toEqual({ type: 'homemanager/rf/press', remote_id: 'ventilador-estudio', button_id: 'velocidad-1' });
});

test('learning says when a signal is not recognised and listens with the chosen receiver', async ({ page }) => {
  const rf = await setup(page, { remotes: [ceiling()] });
  await rf.getByRole('button', { name: /Techo/ }).click();
  await rf.getByRole('button', { name: 'Aprender botones', exact: true }).click();
  await page.evaluate(() => window.rfServer.send({ noise: 4 }));
  await expect(rf.getByText('Llega señal, pero no se reconoce')).toBeVisible();
  await rf.getByLabel('Escucha').selectOption('tx_b');
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.rfServer.calls.filter(call => call.type === 'homemanager/rf/capture').map(call => call.transmitter),
      ),
    )
    .toEqual(['tx_a', 'tx_b']);
  // A code already saved says so; two presses also confirm.
  await page.evaluate(() =>
    window.rfServer.heard({ bursts: 2, confirmed: true, confirmed_by: 'presses', known_as: ['Techo · Luz'] }),
  );
  await expect(rf.getByText('La misma señal en 2 pulsaciones.')).toBeVisible();
  await expect(rf.getByText('Ya está guardado como: Techo · Luz')).toBeVisible();
});

test("parts decide Home Assistant's fan and light, so the light's off is not the fan's", async ({ page }) => {
  const rf = await setup(page, { remotes: [ceiling()] });
  await rf.getByRole('button', { name: /Techo/ }).click();
  await rf.getByRole('button', { name: 'Editar', exact: true }).click();
  await rf.getByRole('button', { name: 'Agregar ventilador', exact: true }).click();
  await rf.getByRole('button', { name: 'Agregar luz', exact: true }).click();
  const fan = rf.locator('.part[data-kind=fan]');
  const light = rf.locator('.part[data-kind=light]');
  await fan.getByLabel('Apagar', { exact: true }).selectOption('off');
  await fan.getByLabel('Velocidad 1', { exact: true }).selectOption('v1');
  await fan.getByLabel('Velocidad 2', { exact: true }).selectOption('v2');
  await light.getByLabel('Encender / apagar (alterna)').selectOption('luz');
  await light.getByLabel('Apagar', { exact: true }).selectOption('luz-off');
  await expect
    .poll(async () => (await calls(page, 'homemanager/rf/parts/save')).at(-1)?.parts)
    .toEqual([
      {
        id: 'ventilador',
        name: 'Ventilador',
        kind: 'fan',
        speeds: null,
        roles: { off: 'off', speed_1: 'v1', speed_2: 'v2' },
      },
      { id: 'luz', name: 'Luz', kind: 'light', speeds: null, roles: { toggle: 'luz', off: 'luz-off' } },
    ]);
  // A fourth speed appears once the third is chosen.
  await expect(fan.getByLabel('Velocidad 4', { exact: true })).toHaveCount(0);
  await fan.getByLabel('Velocidad 3', { exact: true }).selectOption('v3');
  await expect(fan.getByLabel('Velocidad 4', { exact: true })).toBeVisible();

  // Removing a part asks first.
  await light.getByRole('button', { name: 'Quitar Luz' }).click();
  const dialog = rf.getByRole('dialog', { name: '¿Quitar «Luz» de Home Assistant?' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Quitar', exact: true }).click();
  await expect
    .poll(async () => (await calls(page, 'homemanager/rf/parts/save')).at(-1).parts.map(part => part.kind))
    .toEqual(['fan']);
});

test('the remote is designed on a grid: add, move, resize and remove elements', async ({ page }) => {
  const rf = await setup(page, { remotes: [ceiling()] });
  await rf.getByRole('button', { name: /Techo/ }).click();
  const remote = rf.locator('homemanager-rf-remote');
  // Until designed, every button is drawn.
  await expect(remote.getByRole('button')).toHaveCount(6);
  await rf.getByRole('button', { name: 'Editar', exact: true }).click();
  await rf.getByRole('button', { name: 'Agregar elemento', exact: true }).click();
  const editor = rf.getByRole('dialog', { name: 'Agregar elemento' });
  await editor.getByRole('button', { name: 'Deslizador por pasos', exact: true }).click();
  await editor.getByLabel('Paso 1', { exact: true }).selectOption('v1');
  await editor.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(editor.getByText('Elegí al menos 2 botones.')).toBeVisible();
  await editor.getByLabel('Paso 2', { exact: true }).selectOption('v2');
  await editor.getByRole('button', { name: 'Agregar paso', exact: true }).click();
  await editor.getByLabel('Paso 3', { exact: true }).selectOption('v3');
  await editor.getByLabel('Etiqueta (opcional)').fill('Velocidad');
  await editor.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(editor).toHaveCount(0);
  let layout = (await calls(page, 'homemanager/rf/layout/save')).at(-1).layout;
  expect(layout.at(-1)).toMatchObject({
    type: 'steps',
    buttons: ['v1', 'v2', 'v3'],
    label: 'Velocidad',
    w: 4,
    x: 0,
    y: 2,
  });

  // Keyboard: arrows move, Shift+arrows resize; covered elements move down.
  const off = remote.getByRole('group', { name: 'Apagar', exact: true });
  await off.focus();
  await page.keyboard.press('Shift+ArrowRight');
  await expect.poll(async () => (await calls(page, 'homemanager/rf/layout/save')).length).toBe(2);
  layout = (await calls(page, 'homemanager/rf/layout/save')).at(-1).layout;
  expect(layout.find(widget => widget.id === 'b-off')).toMatchObject({ x: 0, y: 0, w: 2 });
  expect(layout.find(widget => widget.id === 'b-v1')).toMatchObject({ x: 1, y: 1 });

  // Dragging an element to another cell.
  const light = remote.getByRole('group', { name: 'Luz', exact: true });
  const from = await light.boundingBox();
  const grid = await remote.locator('.grid').boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(grid.x + grid.width * 0.875, grid.y + 5 * 74 + 30, { steps: 8 });
  await page.mouse.up();
  await expect
    .poll(async () =>
      (await calls(page, 'homemanager/rf/layout/save')).at(-1).layout.find(widget => widget.id === 'b-luz'),
    )
    .toMatchObject({ x: 3, y: 5 });

  // Removing asks first; the button itself stays learned.
  await off.getByRole('button', { name: 'Eliminar Apagar' }).click();
  const confirm = rf.getByRole('dialog', { name: '¿Quitar «Apagar» del control?' });
  await confirm.getByRole('button', { name: 'Quitar', exact: true }).click();
  await expect
    .poll(async () =>
      (await calls(page, 'homemanager/rf/layout/save')).at(-1).layout.some(widget => widget.id === 'b-off'),
    )
    .toBe(false);
  await rf.getByRole('button', { name: 'Terminar edición', exact: true }).click();
  await expect(remote.getByRole('button', { name: 'Apagar' })).toHaveCount(0);
  await expect(remote.getByRole('button', { name: 'Velocidad 2' })).toHaveCount(2);
});

test('RF devices lists every ESPHome device and gives the exact YAML to paste', async ({ page }) => {
  const rf = await setup(page);
  await rf.getByRole('tab', { name: 'Equipos RF' }).click();
  const devices = rf.locator('homemanager-rf-devices');
  await expect(devices.getByText('Listo')).toBeVisible();
  await expect(devices.getByText('Falta el paquete')).toBeVisible();
  const sensor = devices.locator('[data-device=sensor_b]');
  await sensor.getByRole('button', { name: 'Cómo agregarlo' }).click();
  await expect(sensor.locator('pre')).toHaveText(
    [
      'substitutions:',
      '  hm_rf_transmitter: rf_transmitter   # cambiá por el id de tu componente',
      '  hm_rf_receiver: rf_receiver   # cambiá por el id de tu componente',
      '',
      'packages:',
      '  homemanager_rf: github://Delpoo/homemanager/esphome/homemanager-rf.yaml@v0.9.0-beta.4',
    ].join('\n'),
  );
  await expect(sensor.getByRole('link', { name: 'Abrir ESPHome Builder' })).toHaveAttribute(
    'href',
    '/hassio/ingress/5c53de3b_esphome',
  );
  await sensor.getByRole('button', { name: 'Copiar' }).click();
  await expect(devices.getByText(/Copiado\.|Seleccionado: copialo con Ctrl\+C\./)).toBeVisible();

  // The device with the package can be the default receiver and be checked.
  const athom = devices.locator('[data-device=tx_a]');
  await athom.locator('summary').click();
  await athom.getByRole('button', { name: 'Usar para aprender' }).click();
  await athom.locator('summary').click();
  await expect(athom.getByRole('button', { name: 'Receptor por defecto' })).toHaveAttribute('aria-pressed', 'true');
  await athom.getByRole('button', { name: 'Probar recepción' }).click();
  await page.evaluate(() => window.rfServer.heard({ confirmed: true }));
  await expect(athom.getByText('✓ Recibe bien: tipo 1, tamaño 24, pulso 400 µs.')).toBeVisible();
});

test('speed stops send on tap, including the current stop, and once per drag', async ({ page }) => {
  await page.goto('/tests/browser/fixtures/card.html');
  await page.waitForFunction(() => window.testHarnessReady);
  await page.evaluate(async () => {
    const { openPanel } = await import('/.work/panels/native-panel.js');
    const entity = {
      state: 'on',
      attributes: {
        friendly_name: 'Ventilador RF',
        supported_features: 1 | 16 | 32,
        percentage: 33,
        percentage_step: 100 / 6,
        assumed_state: true,
        homemanager_remote: 'ventilador',
      },
      last_updated: new Date().toISOString(),
    };
    window.sent = [];
    window.assumed = [];
    openPanel({
      panel: null,
      device: {
        id: 'fan',
        roomId: null,
        kind: 'fan',
        position: { x: 0.5, y: 0.5 },
        mobility: 'fixed',
        display: { label: 'Ventilador RF', icon: 'mdi:fan' },
        bindings: { entityId: 'fan.ventilador', primaryAction: null, advancedPopupId: null },
        state: { value: 'unknown', confidence: 'unknown' },
      },
      state: {
        value: 'on',
        confidence: 'estimated',
        observedAt: null,
        sourceEntityId: 'fan.ventilador',
        command: null,
      },
      configuration: { actions: {}, panels: {}, stateSources: {} },
      availability: () => ({ available: false }),
      onAction: async () => {},
      getEntity: () => entity,
      entityAvailability: () => ({ available: true }),
      onEntityCommand: async command => window.sent.push(command),
      onAssume: async isOn => window.assumed.push(isOn),
    });
  });
  const dialog = page.getByRole('dialog');
  const stops = dialog.locator('.steps');
  await expect(stops.getByRole('button')).toHaveCount(7);
  await expect(stops.getByRole('button', { name: 'Velocidad 2' })).toHaveAttribute('aria-pressed', 'true');
  await expect(dialog.locator('[data-control-id=speed] output')).toHaveText('2/6');

  // Tapping the current stop sends it again (re-synchronizes the device).
  await stops.getByRole('button', { name: 'Velocidad 2' }).click();
  await stops.getByRole('button', { name: 'Velocidad 5' }).click();
  // Dragging from 1 to 4 sends a single command on release.
  const from = await stops.getByRole('button', { name: 'Velocidad 1' }).boundingBox();
  const to = await stops.getByRole('button', { name: 'Velocidad 4' }).boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 6 });
  await page.mouse.up();
  await expect
    .poll(() => page.evaluate(() => window.sent))
    .toEqual([
      { service: 'set_percentage', data: { percentage: 33 } },
      { service: 'set_percentage', data: { percentage: 83 } },
      { service: 'set_percentage', data: { percentage: 66 } },
    ]);

  // Correcting the assumed state sends nothing; it only reports the real state.
  await dialog.getByRole('button', { name: 'Marcar como apagado', exact: true }).click();
  expect(await page.evaluate(() => window.assumed)).toEqual([false]);
  expect(await page.evaluate(() => window.sent.length)).toBe(3);
});
