import { openCardMenu } from '../browser/shell-helpers.mjs';
import { picker } from '../browser/device-picker-helpers.mjs';
import { test, expect } from '../browser/local-test.mjs';

// Device controls (contract V2, optional): what a tap runs, the controls of the
// panel and the ones pinned next to the symbol. RF data is a synthetic stand-in
// for rf_websocket.py; no real remote or household data.
const card = page => page.locator('homemanager-card');
const button = (page, name) =>
  card(page).getByRole('button', {
    name:
      name === 'Guardar dispositivo' ? /^(Guardar dispositivo|Listo)$/ : name === 'Cerrar' ? /^(Cerrar|Volver)$/ : name,
    exact: true,
  });
const draft = page => page.evaluate(() => window.testHarness.card.getDraftConfiguration());
const calls = page => page.evaluate(() => window.testHarness.calls.map(call => `${call.domain}.${call.service}`));
const remote = {
  id: 'techo',
  name: 'Techo',
  icon: 'mdi:ceiling-fan',
  description: null,
  transmitter: 'tx_a',
  protocol: 1,
  nbits: 24,
  pulse_us: 400,
  repeats: 5,
  wait_us: 0,
  measured_pulse_us: 400,
  buttons: [
    { id: 'luz', name: 'Luz', icon: null, fingerprint: 'aaaa0000' },
    { id: 'off', name: 'Apagar', icon: null, fingerprint: 'bbbb0000' },
  ],
  parts: [],
  layout: null,
};

/** Replaces the light device's bindings (and adds plan actions) in the live card. */
async function configure(page, change) {
  await page.evaluate(source => {
    const config = window.testHarness.config;
    new Function('config', source)(config);
    window.testHarness.card.setConfig(config);
    window.testHarness.card.hass = { ...window.testHarness.hass };
  }, `(${change})(config)`);
}
const cycle = config => {
  const configuration = config.configuration;
  configuration.actions['light-on'] = {
    domain: 'light',
    service: 'turn_on',
    target: { entity_id: 'light.synthetic_light' },
  };
  configuration.actions['light-off'] = {
    domain: 'light',
    service: 'turn_off',
    target: { entity_id: 'light.synthetic_light' },
  };
  Object.assign(configuration.catalog.devices[0].bindings, {
    primaryAction: null,
    controls: [
      {
        id: 'power',
        type: 'cycle',
        label: 'Encender / Apagar',
        steps: [
          { actionId: 'light-on', label: 'Encender', icon: 'mdi:lightbulb' },
          { actionId: 'light-off', label: 'Apagar', icon: 'mdi:lightbulb-off' },
        ],
      },
    ],
    tap: 'power',
  });
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('homemanager-synthetic-started')) {
      localStorage.clear();
      sessionStorage.setItem('homemanager-synthetic-started', 'yes');
    }
  });
  await page.goto('/tests/browser/fixtures/card.html');
  await page.waitForFunction(() => window.testHarnessReady);
  await page.evaluate(remote => {
    const { hass } = window.testHarness;
    window.rfPressed = [];
    const base = hass.callWS.bind(hass);
    hass.callWS = async message => {
      if (message.type === 'homemanager/rf/library') return { remotes: [structuredClone(remote)] };
      if (message.type === 'homemanager/rf/press') {
        window.rfPressed.push(message.button_id);
        return { result: 'sent' };
      }
      return base(message);
    };
    hass.services.button = { press: { fields: {} } };
    hass.states['button.techo_1h'] = {
      state: 'unknown',
      attributes: { friendly_name: 'Techo 1H', homemanager_remote_button: 'techo' },
      last_updated: new Date().toISOString(),
    };
    window.testHarness.card.hass = { ...hass };
  }, remote);
});

async function hold(page, name) {
  const marker = button(page, name);
  // Waits until the symbol is stable (the plan may still be framing itself).
  await marker.click({ trial: true });
  const box = await marker.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(650);
  await page.mouse.up();
}

test('a cycle sends its next step on each tap, says what was sent and shows the step icon', async ({ page }) => {
  await configure(page, cycle);
  const symbol = button(page, 'Luz de prueba');
  // The light is off: the next step is "Encender".
  await expect(symbol).toHaveAttribute('aria-description', /Tocar: Encender/);
  await symbol.click();
  await expect.poll(() => calls(page)).toEqual(['light.turn_on']);
  await expect(card(page).locator('.sent-note')).toHaveText('Enviado: Encender');
  // Home Assistant reports it on: the cycle follows the live state.
  await page.evaluate(() => {
    const { hass } = window.testHarness;
    hass.states['light.synthetic_light'] = { ...hass.states['light.synthetic_light'], state: 'on' };
    window.testHarness.card.hass = { ...hass };
  });
  await expect(symbol).toHaveAttribute('data-icon', 'mdi:lightbulb');
  await expect(symbol).toHaveAttribute('aria-description', /Tocar: Apagar/);
  await symbol.click();
  await expect.poll(() => calls(page)).toEqual(['light.turn_on', 'light.turn_off']);
  // Sent is never a confirmation: the persisted state stays unknown.
  expect((await draft(page)).catalog.devices[0].state).toEqual({ value: 'unknown', confidence: 'unknown' });
});

test('holding opens the panel with the device controls, and the next tap is not swallowed', async ({ page }) => {
  await configure(page, cycle);
  await hold(page, 'Luz de prueba');

  const panel = page.locator('homemanager-task-screen[open]');
  await expect(panel.getByText('Controles', { exact: true })).toBeVisible();
  // In the panel every step of the cycle can be chosen directly.
  await panel.getByRole('button', { name: 'Apagar' }).click();
  await expect.poll(() => calls(page)).toEqual(['light.turn_off']);
  await expect(panel.getByText('Enviado: Apagar')).toBeVisible();
  expect(await page.evaluate(() => window.testHarness.calls.length)).toBe(1);
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
  await button(page, 'Luz de prueba').click();
  await expect.poll(() => calls(page)).toEqual(['light.turn_off', 'light.turn_on']);
});

test('a 0.5 plan keeps working: its primary action is the tap and its quick actions are panel controls', async ({
  page,
}) => {
  await configure(page, config => {
    config.configuration.catalog.devices[0].bindings.quickActions = [
      { id: 'quick-1', label: 'Alternar luz', actionId: 'synthetic-light-toggle' },
    ];
  });
  await button(page, 'Luz de prueba').click();
  await expect.poll(() => calls(page)).toEqual(['light.toggle']);
  await button(page, 'Luz de prueba').click({ button: 'right' });
  const panel = page.locator('homemanager-task-screen[open]');
  await panel.getByRole('button', { name: 'Alternar luz', exact: true }).click();
  await expect.poll(() => calls(page)).toEqual(['light.toggle', 'light.toggle']);
});

test('pinned controls work next to the symbol: a button and a slider of the entity value', async ({ page }) => {
  await configure(page, config => {
    const configuration = config.configuration;
    configuration.actions['techo-1h'] = {
      domain: 'button',
      service: 'press',
      target: { entity_id: 'button.techo_1h' },
    };
    Object.assign(configuration.catalog.devices[0].bindings, {
      controls: [
        { id: 'timer', type: 'button', label: '1H', steps: [{ actionId: 'techo-1h' }] },
        { id: 'level', type: 'slider', label: 'Intensidad', steps: [], orientation: 'vertical' },
      ],
    });
    configuration.catalog.devices[0].display.pinned = ['timer', 'level'];
  });
  await page.evaluate(() => {
    const { hass } = window.testHarness;
    hass.states['light.synthetic_light'] = {
      state: 'on',
      attributes: { friendly_name: 'Synthetic light', supported_color_modes: ['brightness'], brightness: 128 },
      last_updated: new Date().toISOString(),
    };
    window.testHarness.card.hass = { ...hass };
  });
  const pins = card(page).locator('.marker[data-id="synthetic-light"] .pins');
  await pins.getByRole('button', { name: '1H' }).click();
  await expect.poll(() => calls(page)).toEqual(['button.press']);
  const slider = pins.getByRole('slider', { name: 'Intensidad' });
  await expect(slider).toHaveAttribute('aria-valuenow', '50');
  const box = await slider.boundingBox();
  // Drag to the top: one call on release, at the maximum.
  await page.mouse.move(box.x + box.width / 2, box.y + box.height - 4);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y - 20, { steps: 5 });
  await page.mouse.up();
  await expect
    .poll(() => page.evaluate(() => window.testHarness.calls.at(-1)))
    .toEqual({
      domain: 'light',
      service: 'turn_on',
      data: { brightness_pct: 100 },
      target: { entity_id: 'light.synthetic_light' },
    });
  expect(await page.evaluate(() => window.testHarness.calls.length)).toBe(2);
  // Dragging a pinned slider never pans the plan or moves the device.
  expect((await draft(page)).catalog.devices[0].position).toEqual({ x: 0.25, y: 0.33 });
});

test('the note says when the RF signal was heard on air, without claiming the device changed', async ({ page }) => {
  await configure(page, config => {
    const configuration = config.configuration;
    configuration.actions['techo-1h'] = {
      domain: 'button',
      service: 'press',
      target: { entity_id: 'button.techo_1h' },
    };
    Object.assign(configuration.catalog.devices[0].bindings, {
      primaryAction: null,
      controls: [{ id: 'timer', type: 'button', label: '1H', steps: [{ actionId: 'techo-1h' }] }],
      tap: 'timer',
    });
  });
  await button(page, 'Luz de prueba').click();
  const note = card(page).locator('.sent-note');
  await expect(note).toHaveText('Enviado: 1H');
  // The integration reports the echo of this transmission on the entity.
  await page.evaluate(() => {
    const { hass } = window.testHarness;
    hass.states['button.techo_1h'] = {
      ...hass.states['button.techo_1h'],
      attributes: {
        ...hass.states['button.techo_1h'].attributes,
        homemanager_on_air: { at: new Date().toISOString(), result: 'heard', by: 'Athom' },
      },
    };
    window.testHarness.card.hass = { ...hass };
  });
  await expect(note).toHaveText('Enviado: 1H · en el aire');
});

test('the sheet builds controls from suggestions, by how they are used, and saving closes it', async ({ page }) => {
  await openCardMenu(page);
  await button(page, 'Editar plano').click();
  await button(page, 'Luz de prueba').click();
  const editor = card(page).locator('homemanager-editor');
  for (const id of ['device-binding', 'device-controls-section', 'device-remote']) {
    const section = editor.locator('#' + id);
    if ((await section.isVisible()) && !(await section.evaluate(node => node.open)))
      await section.locator(':scope > summary').click();
  }
  // The 0.5 primary action shows up as a visible control that the tap runs.
  await expect(editor.getByLabel('Al tocar el símbolo', { exact: true })).toHaveValue('tap');
  await editor.getByRole('button', { name: 'Ciclo', exact: true }).click();
  // A new cycle starts filled in with what the entity offers.
  await expect(editor.getByLabel('Ciclo: acción de Paso 1', { exact: true })).toHaveValue(
    'new:light.turn_on:light.synthetic_light',
  );
  await expect(editor.getByLabel('Ciclo: acción de Paso 2', { exact: true })).toHaveValue(
    'new:light.turn_off:light.synthetic_light',
  );
  await editor.getByLabel('Al tocar el símbolo', { exact: true }).selectOption({ label: 'Ciclo' });
  // With an RF remote chosen for the device, its buttons are suggested too.
  await editor.getByText('Más opciones', { exact: true }).click();
  await editor.getByRole('combobox', { name: 'Control RF en el panel' }).selectOption('techo');
  await editor.getByRole('button', { name: 'Pulsador', exact: true }).click();
  await editor.getByLabel('Nombre del control (Pulsador)', { exact: true }).last().fill('1H');
  // Labels follow the control's name the next time the section is drawn.
  await editor.getByLabel('Acción de Pulsador', { exact: true }).selectOption({ label: '1H' });
  await editor.getByRole('button', { name: 'Mostrar en el plano' }).last().click();
  await editor.getByRole('button', { name: 'Grande', exact: true }).click();
  await editor.getByRole('button', { name: /^(Guardar dispositivo|Listo)$/, exact: true }).click();
  await expect(editor.getByRole('button', { name: /^(Guardar dispositivo|Listo)$/, exact: true })).toHaveCount(0);
  const device = (await draft(page)).catalog.devices[0];
  expect(device.display).toMatchObject({ size: 'l', pinned: ['pulsador'] });
  expect(device.bindings.tap).toBe('ciclo');
  expect(device.bindings.remoteId).toBe('techo');
  expect(device.bindings.primaryAction).toBeNull();
  expect(
    device.bindings.controls.map(control => [control.id, control.type, control.steps.map(step => step.actionId)]),
  ).toEqual([
    ['tap', 'button', ['synthetic-light-toggle']],
    ['ciclo', 'cycle', ['synthetic-light-synthetic-light-turn-on', 'synthetic-light-synthetic-light-turn-off']],
    ['pulsador', 'button', ['synthetic-light-techo-1h-press']],
  ]);
  expect((await draft(page)).actions['synthetic-light-techo-1h-press']).toEqual({
    domain: 'button',
    service: 'press',
    target: { entity_id: 'button.techo_1h' },
  });
  // Other devices are written as before: no empty optional fields.
  expect(Object.keys((await draft(page)).catalog.devices[1].bindings)).toEqual([
    'entityId',
    'primaryAction',
    'advancedPopupId',
  ]);
  // Opening and saving again creates no duplicate actions.
  const actions = Object.keys((await draft(page)).actions).length;
  await button(page, 'Luz de prueba').click();
  await editor.getByRole('button', { name: /^(Guardar dispositivo|Listo)$/, exact: true }).click();
  expect(Object.keys((await draft(page)).actions).length).toBe(actions);
  // Editing only executes nothing.
  expect(await page.evaluate(() => window.testHarness.calls)).toEqual([]);
});

test('a control left without its actions is reported instead of being saved half done', async ({ page }) => {
  await openCardMenu(page);
  await button(page, 'Editar plano').click();
  await button(page, 'Luz de prueba').click();
  const editor = card(page).locator('homemanager-editor');
  for (const id of ['device-binding', 'device-controls-section', 'device-remote']) {
    const section = editor.locator('#' + id);
    if ((await section.isVisible()) && !(await section.evaluate(node => node.open)))
      await section.locator(':scope > summary').click();
  }
  await editor.getByRole('button', { name: 'Selector', exact: true }).click();
  await editor.getByRole('button', { name: /^(Guardar dispositivo|Listo)$/, exact: true }).click();
  await expect(editor.locator('.status')).toContainText('Completá las acciones de: Selector');
  expect((await draft(page)).catalog.devices[0].bindings.controls).toBeUndefined();
});

test('icon and entity choosers offer suggestions with nothing typed, filter while typing and scroll', async ({
  page,
}) => {
  await openCardMenu(page);
  await button(page, 'Editar plano').click();
  await button(page, 'Luz de prueba').click();
  const editor = card(page).locator('homemanager-editor');
  for (const id of ['device-binding', 'device-controls-section', 'device-remote']) {
    const section = editor.locator('#' + id);
    if ((await section.isVisible()) && !(await section.evaluate(node => node.open)))
      await section.locator(':scope > summary').click();
  }
  // Entity: focusing shows every entity, the current one first.
  await editor.getByRole('button', { name: 'Vincular dispositivo', exact: true }).click();
  await picker(page).getByRole('button', { name: 'Buscar cualquier entidad', exact: true }).click();
  expect(await picker(page).locator('[data-action=entity]').count()).toBeGreaterThan(2);
  await picker(page).getByRole('searchbox').fill('spare');
  await expect(picker(page).locator('[data-action=entity]')).toHaveCount(1);
  await page.keyboard.press('Escape');
  // Icon: the grid opens with suggestions and filters by Spanish words.
  // E02: Escape goes back from advanced search; the next Escape leaves linking.
  await page.keyboard.press('Escape');
  await editor.getByRole('button', { name: 'Icono del dispositivo', exact: true }).click();
  const grid = editor.getByRole('listbox', { name: 'Iconos' });
  expect(await grid.getByRole('option').count()).toBeGreaterThan(50);
  expect(await grid.evaluate(node => node.scrollHeight > node.clientHeight)).toBe(true);
  await editor.getByRole('searchbox', { name: 'Buscar icono' }).fill('ventilador');
  await grid.getByRole('option', { name: 'mdi:fan', exact: true }).click();
  await expect(editor.locator('input[name=icon]')).toHaveValue('mdi:fan');
  // Esc on a chooser does not close the whole sheet.
  await editor.getByRole('button', { name: 'Icono del dispositivo', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(editor.getByRole('button', { name: /^(Guardar dispositivo|Listo)$/, exact: true })).toBeVisible();
});
