import { test, expect } from '@playwright/test';

const card = page => page.locator('homemanager-card');
const editor = page => card(page).locator('homemanager-editor');
const button = (page, name) => card(page).getByRole('button', { name, exact: true });
const draft = page => page.evaluate(() => window.testHarness.card.getDraftConfiguration());
const begin = page => button(page, 'Editar plano').click();
const select = (page, name = 'Luz de prueba') => button(page, `Detalles de ${name}`).click();

test('automatic binding preserves a colliding reusable action and does not invent script parameters', async ({
  page,
}) => {
  await page.evaluate(() => {
    window.testHarness.mutateRemote(dashboard => {
      dashboard.views[0].cards[0].configuration.actions['synthetic-sensor-toggle'] = {
        domain: 'light',
        service: 'toggle',
        target: { entity_id: 'light.synthetic_light' },
      };
    });
  });
  await begin(page);
  await select(page, 'Temperatura de prueba');
  await editor(page).getByLabel('Entidad del dispositivo', { exact: true }).fill('light.synthetic_spare');
  await button(page, 'Aplicar dispositivo').click();
  const configuration = await draft(page);
  expect(configuration.actions['synthetic-sensor-toggle'].target.entity_id).toBe('light.synthetic_light');
  expect(configuration.catalog.devices[2].bindings.primaryAction).toBe('synthetic-sensor-toggle-2');
  await button(page, 'Descartar cambios').click();
  await card(page)
    .getByRole('dialog', { name: '¿Descartar los cambios?' })
    .getByRole('button', { name: 'Descartar cambios', exact: true })
    .click();
  await expect(editor(page)).toBeVisible();
  await page.evaluate(() => {
    const hass = window.testHarness.hass;
    hass.states['script.needs_input'] = { state: 'off', attributes: { friendly_name: 'Needs input' } };
    hass.services.script.needs_input = { fields: { message: { required: true, selector: { text: {} } } } };
    window.testHarness.card.hass = { ...hass };
  });
  await editor(page).getByLabel('Entidad del dispositivo', { exact: true }).fill('script.needs_input');
  await button(page, 'Aplicar dispositivo').click();
  expect((await draft(page)).catalog.devices[2].bindings.primaryAction).toBeNull();
  expect(await page.evaluate(() => window.testHarness.calls)).toEqual([]);
});

test.beforeEach(async ({ page }) => {
  await page.goto('/tests/browser/fixtures/card.html');
  await page.waitForFunction(() => window.testHarnessReady);
});

test('editing starts with the plan, and the floating add menu offers both creation paths', async ({ page }) => {
  await begin(page);
  await expect(editor(page)).toBeHidden();
  await expect(card(page).locator('.viewport')).toBeVisible();
  const add = button(page, 'Agregar dispositivo');
  const box = await add.boundingBox();
  expect(box.width).toBeGreaterThanOrEqual(48);
  expect(box.height).toBeGreaterThanOrEqual(48);
  await add.click();
  await expect(button(page, 'Desde Home Assistant')).toBeVisible();
  await expect(button(page, 'Dispositivo vacío')).toBeVisible();
  await button(page, 'Dispositivo vacío').click();
  await editor(page).getByLabel('Nombre del dispositivo', { exact: true }).fill('Lámpara nueva');
  await button(page, 'Aplicar dispositivo').click();
  await expect(card(page).locator('.placing-hint')).toBeVisible();
  await expect(editor(page)).toBeHidden();
  const zone = await card(page).locator('#room-living').boundingBox();
  await page.mouse.click(zone.x + zone.width * 0.65, zone.y + zone.height * 0.7);
  const device = (await draft(page)).catalog.devices.find(item => item.display.label === 'Lámpara nueva');
  expect(device.roomId).toBe('living');
  await expect(editor(page)).toBeVisible();
  await expect(editor(page).getByLabel('ID del dispositivo', { exact: true })).toBeHidden();
  expect(await page.evaluate(() => window.testHarness.calls)).toEqual([]);
});

test('linking an existing icon generates its primary action only in the draft, then toggles after save', async ({
  page,
}) => {
  await begin(page);
  await select(page, 'Temperatura de prueba');
  const entity = editor(page).getByLabel('Entidad del dispositivo', { exact: true });
  await entity.fill('spare');
  await editor(page)
    .getByRole('option', { name: /Synthetic spare light/ })
    .click();
  await button(page, 'Aplicar dispositivo').click();
  const configuration = await draft(page);
  const device = configuration.catalog.devices.find(item => item.id === 'synthetic-sensor');
  expect(configuration.actions[device.bindings.primaryAction]).toEqual({
    domain: 'light',
    service: 'toggle',
    target: { entity_id: 'light.synthetic_spare' },
  });
  expect(
    await page.evaluate(() => window.testHarness.config.configuration.catalog.devices[2].bindings.primaryAction),
  ).toBeNull();
  expect(await page.evaluate(() => window.testHarness.calls)).toEqual([]);
  await button(page, 'Guardar cambios').click();
  await expect(button(page, 'Guardar cambios')).toHaveAttribute('data-dirty', 'false');
  await button(page, 'Salir de edición').click();
  await button(page, 'Acción principal de Temperatura de prueba').click();
  await expect.poll(() => page.evaluate(() => window.testHarness.calls.length)).toBe(1);
  const call = await page.evaluate(() => window.testHarness.calls[0]);
  expect(call.domain).toBe('light');
  expect(call.service).toBe('toggle');
  expect(call.target?.entity_id ?? call.data.entity_id).toBe('light.synthetic_spare');
});

test('deletion has a modal focus trap, Escape and Cancel restore the trigger, and Undo restores the icon', async ({
  page,
}) => {
  await begin(page);
  await select(page);
  await button(page, 'Eliminar dispositivo').click();
  const dialog = editor(page).getByRole('dialog', { name: '¿Eliminar «Luz de prueba»?' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Cancelar', exact: true })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: 'Eliminar', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: 'Cancelar', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(button(page, 'Eliminar dispositivo')).toBeFocused();
  expect((await draft(page)).catalog.devices).toHaveLength(3);
  await button(page, 'Eliminar dispositivo').click();
  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(button(page, 'Eliminar dispositivo')).toBeFocused();
  await button(page, 'Eliminar dispositivo').click();
  await dialog.getByRole('button', { name: 'Eliminar', exact: true }).click();
  await expect.poll(async () => (await draft(page)).catalog.devices.length).toBe(2);
  expect((await draft(page)).actions['synthetic-light-toggle']).toBeDefined();
  await button(page, 'Deshacer').click();
  expect((await draft(page)).catalog.devices).toHaveLength(3);
});

test('plan settings and field help open without cluttering the map, and Move uses map placement', async ({ page }) => {
  await begin(page);
  await button(page, 'Ajustes del plano').click();
  const settings = editor(page).getByRole('dialog', { name: 'Ajustes del plano' });
  await expect(settings).toBeVisible();
  for (const name of [
    'Espacios (3)',
    'Acciones lógicas',
    'Paneles nativos',
    'Importar y exportar',
    'Referencias pendientes (0)',
  ])
    await expect(settings.getByText(name, { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await select(page);
  await editor(page).getByRole('button', { name: 'Ayuda: Entidad del dispositivo', exact: true }).click();
  await expect(
    editor(page).getByText('Elegí el equipo de Home Assistant que representa este icono.', { exact: true }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await button(page, 'Mover').click();
  await expect(editor(page)).toBeHidden();
  const zone = await card(page).locator('#room-office').boundingBox();
  await page.mouse.click(zone.x + zone.width * 0.2, zone.y + zone.height * 0.2);
  expect((await draft(page)).catalog.devices[0].roomId).toBe('office');
  expect((await draft(page)).catalog.devices[0].bindings.primaryAction).toBe('synthetic-light-toggle');
});

test('the device sheet fits the viewport with advanced fields collapsed and uses the HA theme', async ({
  page,
}, testInfo) => {
  await begin(page);
  await select(page);
  await expect(editor(page).getByLabel('ID del dispositivo', { exact: true })).toBeHidden();
  await expect(editor(page).getByLabel('Posición X', { exact: true })).toBeHidden();
  const bounds = await editor(page).boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(page.viewportSize().width + 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(button(page, 'Aplicar dispositivo')).toBeInViewport();
  await expect(button(page, 'Mover')).toBeInViewport();
  if (testInfo.project.name === 'mobile') {
    await expect
      .poll(async () => {
        const marker = await card(page).locator('[data-id="synthetic-light"] .primary').boundingBox();
        const sheet = await card(page).locator('.workspace > .editor').boundingBox();
        return marker.y + marker.height <= sheet.y;
      })
      .toBe(true);
  }
  await page.screenshot({
    path: testInfo.outputPath(`editor-${testInfo.project.name}.png`),
    fullPage: true,
    animations: 'disabled',
  });
  await page.evaluate(() => {
    const el = document.querySelector('homemanager-card');
    el.style.setProperty('--ha-card-background', '#17221d');
    el.style.setProperty('--primary-text-color', '#edf4f0');
    el.style.setProperty('--secondary-text-color', '#b1c2b7');
    el.style.setProperty('--secondary-background-color', '#22342a');
    el.style.setProperty('--divider-color', '#54695d');
  });
  expect(await editor(page).evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(23, 34, 29)');
  await expect(editor(page).getByRole('button', { name: 'Cerrar', exact: true })).toHaveCSS(
    'background-color',
    'rgb(23, 34, 29)',
  );
  await page.screenshot({
    path: testInfo.outputPath(`editor-${testInfo.project.name}-dark.png`),
    fullPage: true,
    animations: 'disabled',
  });
});
