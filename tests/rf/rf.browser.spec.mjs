import { test, expect } from '@playwright/test';

// Synthetic stand-in for the RF websocket API of custom_components/homemanager
// (rf_websocket.py, exercised against real HA in tests/integration/test_rf.py).
// No code ever travels: captures are candidate ids, buttons fingerprints.
async function setup(page) {
  await page.goto('/tests/browser/fixtures/card.html');
  await page.waitForFunction(() => window.testHarnessReady);
  await page.evaluate(async () => {
    const { hass } = window.testHarness;
    const calls = [];
    let remotes = [];
    let capture = null;
    const lovelace = hass.callWS.bind(hass);
    hass.callWS = async message => {
      if (!message.type.startsWith('homemanager/rf/')) return lovelace(message);
      calls.push(structuredClone(message));
      switch (message.type) {
        case 'homemanager/rf/library':
          return { remotes: structuredClone(remotes) };
        case 'homemanager/rf/transmitters':
          return {
            transmitters: [
              { id: 'tx_a', name: 'Emisor A', device_id: 'a', can_capture: true },
              { id: 'tx_b', name: 'Emisor B', device_id: 'b', can_capture: true },
            ],
          };
        case 'homemanager/rf/test':
          return { result: 'sent', transmitter: message.transmitter, pulse_us: message.pulse_us };
        case 'homemanager/rf/remote/save': {
          const remote = {
            id: 'ventilador-estudio',
            name: message.remote.name,
            protocol: 1,
            nbits: 24,
            wait_us: 0,
            speeds: null,
            ...message.remote,
            buttons: [],
          };
          remotes = [remote];
          return remote;
        }
        case 'homemanager/rf/button/save': {
          const button = {
            id: message.button.name.toLowerCase().replace(/\W+/g, '-'),
            ...message.button,
            fingerprint: 'abcd1234',
          };
          remotes[0].buttons.push(button);
          return button;
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
      heard: candidate =>
        capture?.({
          candidate: {
            candidate_id: 'c1',
            transmitter: 'tx_a',
            protocol: 1,
            nbits: 24,
            pulse_us: 400,
            frames: 5,
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
  });
  return page.locator('homemanager-rf');
}

test('the wizard captures a button, finds working settings by asking, and saves it', async ({ page }) => {
  const rf = await setup(page);
  await rf.getByRole('button', { name: 'Agregar control', exact: true }).click();
  await rf.getByLabel('Nombre del equipo').fill('Ventilador estudio');
  await rf
    .getByRole('group', { name: '¿Cuántas velocidades tiene el control?' })
    .getByRole('button', { name: '3', exact: true })
    .click();
  await rf.getByRole('button', { name: 'Empezar a capturar', exact: true }).click();
  await expect(rf.getByText('Presioná en tu control: Apagar')).toBeVisible();

  // One press is not enough: the same code must arrive in a second press.
  await page.evaluate(() => window.rfServer.heard({ bursts: 1, confirmed: false }));
  await expect(rf.getByText('Presioná el mismo botón otra vez para confirmarlo')).toBeVisible();
  await expect(rf.getByRole('button', { name: 'Probar este botón' })).toHaveCount(0);
  await page.evaluate(() => window.rfServer.heard({ bursts: 2, confirmed: true }));
  await expect(rf.getByText('Protocolo 1 · 24 bits · pulso medido 400 µs')).toBeVisible();

  await rf.getByRole('button', { name: 'Probar este botón', exact: true }).click();
  await expect(rf.getByText('¿El equipo reaccionó?')).toBeVisible();
  await rf.getByRole('button', { name: 'No reaccionó', exact: true }).click();
  // The next attempt changes one thing: the transmitter.
  await expect(rf.getByText('Enviado por Emisor B · 400 µs · 5 repeticiones')).toBeVisible();
  await rf.getByRole('button', { name: 'Sí, funcionó', exact: true }).click();
  await expect(rf.getByText('Botón «Apagar» guardado.')).toBeVisible();
  await expect(rf.getByText('Presioná en tu control: Velocidad 1')).toBeVisible();

  const calls = await page.evaluate(() => window.rfServer.calls);
  const tests = calls.filter(call => call.type === 'homemanager/rf/test');
  expect(tests.map(call => [call.transmitter, call.pulse_us, call.repeats, call.wait_us])).toEqual([
    ['tx_a', 400, 5, 0],
    ['tx_b', 400, 5, 0],
  ]);
  expect(calls.find(call => call.type === 'homemanager/rf/remote/save').remote).toEqual({
    name: 'Ventilador estudio',
    transmitter: 'tx_b',
    protocol: 1,
    nbits: 24,
    pulse_us: 400,
    repeats: 5,
    wait_us: 0,
    speeds: 3,
  });
  expect(calls.find(call => call.type === 'homemanager/rf/button/save')).toMatchObject({
    remote_id: 'ventilador-estudio',
    button: { name: 'Apagar', function: 'off' },
    candidate_id: 'c1',
  });
  expect(JSON.stringify(calls)).not.toMatch(/"code"/);

  await rf.getByRole('button', { name: 'Terminar', exact: true }).click();
  await expect(rf.getByText('Ventilador estudio quedó guardado con 1 botones.')).toBeVisible();
  await rf.getByRole('button', { name: 'Ver el control', exact: true }).click();
  await rf.getByRole('button', { name: 'Probar', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.rfServer.calls.at(-1)))
    .toEqual({ type: 'homemanager/rf/press', remote_id: 'ventilador-estudio', button_id: 'apagar' });
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
