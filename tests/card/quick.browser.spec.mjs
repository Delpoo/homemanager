import { test, expect } from '@playwright/test';

// Quick actions on hold and the RF remote in the device panel (contract V2,
// optional bindings). RF data is a synthetic stand-in for rf_websocket.py.
const card = page => page.locator('homemanager-card');
const button = (page, name) => card(page).getByRole('button', { name, exact: true });
const draft = page => page.evaluate(() => window.testHarness.card.getDraftConfiguration());
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

test.beforeEach(async ({ page }) => {
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
    // The sensor becomes a button of the remote; the light gets a shortcut.
    hass.states['button.techo_1h'] = {
      state: 'unknown',
      attributes: { friendly_name: 'Techo 1H', homemanager_remote_button: 'techo' },
      last_updated: new Date().toISOString(),
    };
    window.testHarness.card.hass = { ...hass };
  }, remote);
});

async function holdOn(page, name) {
  const marker = button(page, `Acción principal de ${name}`);
  await marker.scrollIntoViewIfNeeded();
  const box = await marker.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(650);
  await page.mouse.up();
}

test('holding an icon shows its quick actions, which run its actions; ⋯ opens the panel', async ({ page }) => {
  await page.evaluate(() => {
    const config = window.testHarness.config;
    config.configuration.catalog.devices[0].bindings.quickActions = [
      { id: 'quick-1', label: 'Alternar luz', actionId: 'synthetic-light-toggle' },
    ];
    window.testHarness.card.setConfig(config);
    window.testHarness.card.hass = { ...window.testHarness.hass };
  });
  await holdOn(page, 'Luz de prueba');
  const quick = card(page).getByRole('group', { name: 'Accesos rápidos de Luz de prueba' });
  await expect(quick).toBeVisible();
  await expect(quick.getByRole('button', { name: 'Alternar luz' })).toBeFocused();
  // The row stays inside the plan.
  const area = await card(page).locator('.viewport').boundingBox();
  const row = await quick.boundingBox();
  expect(row.x).toBeGreaterThanOrEqual(area.x);
  expect(row.x + row.width).toBeLessThanOrEqual(area.x + area.width + 1);
  await quick.getByRole('button', { name: 'Alternar luz' }).click();
  await expect(quick).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => window.testHarness.calls.map(call => `${call.domain}.${call.service}`)))
    .toEqual(['light.toggle']);

  // Esc closes the row without running anything; "more" opens the full panel.
  await holdOn(page, 'Luz de prueba');
  await page.keyboard.press('Escape');
  await expect(quick).toHaveCount(0);
  await holdOn(page, 'Luz de prueba');
  await quick.getByRole('button', { name: 'Más controles de Luz de prueba' }).click();
  const panel = page.getByRole('dialog');
  await expect(panel.getByText('Accesos rápidos', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.testHarness.calls.length)).toBe(1);
});

test('without quick actions, holding still opens the panel; an RF remote is drawn in it', async ({ page }) => {
  await page.evaluate(() => {
    const config = window.testHarness.config;
    config.configuration.catalog.devices[2].bindings.entityId = 'button.techo_1h';
    window.testHarness.card.setConfig(config);
    window.testHarness.card.hass = { ...window.testHarness.hass };
  });
  await holdOn(page, 'Temperatura de prueba');
  const panel = page.getByRole('dialog');
  await expect(panel.getByText('Control remoto', { exact: true })).toBeVisible();
  // The remote comes from the bound RF button entity; its keys send through the integration.
  await panel.locator('homemanager-rf-remote').getByRole('button', { name: 'Apagar' }).click();
  await expect(panel.getByText('Enviado: Apagar')).toBeVisible();
  expect(await page.evaluate(() => window.rfPressed)).toEqual(['off']);
});

test('the editor sets up quick actions from suggestions and the remote of the panel', async ({ page }) => {
  await button(page, 'Editar plano').click();
  await button(page, 'Detalles de Luz de prueba').click();
  const editor = card(page).locator('homemanager-editor');
  await editor.getByText('Al mantener pulsado', { exact: true }).click();
  await editor.getByLabel('Acción del acceso 1').selectOption({ label: 'Encender' });
  await editor.getByLabel('Acción del acceso 2').selectOption('synthetic-light-toggle');
  await editor.getByLabel('Nombre del acceso 2').fill('Cambiar');
  await editor.getByRole('combobox', { name: 'Control RF en el panel' }).selectOption('techo');
  await button(page, 'Aplicar dispositivo').click();
  const configuration = await draft(page);
  expect(configuration.catalog.devices[0].bindings).toMatchObject({
    quickActions: [
      { id: 'quick-1', label: 'Encender', actionId: 'synthetic-light-synthetic-light-turn-on' },
      { id: 'quick-2', label: 'Cambiar', actionId: 'synthetic-light-toggle' },
    ],
    remoteId: 'techo',
  });
  expect(configuration.actions['synthetic-light-synthetic-light-turn-on']).toEqual({
    domain: 'light',
    service: 'turn_on',
    target: { entity_id: 'light.synthetic_light' },
    data: {},
  });
  // Other devices are written as before: no empty optional fields.
  expect(Object.keys(configuration.catalog.devices[1].bindings)).toEqual([
    'entityId',
    'primaryAction',
    'advancedPopupId',
  ]);
  // Editing only executes nothing.
  expect(await page.evaluate(() => window.testHarness.calls)).toEqual([]);
});
