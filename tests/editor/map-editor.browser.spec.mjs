import { openCardMenu } from '../browser/shell-helpers.mjs';
import { chooseAnyEntity } from '../browser/device-picker-helpers.mjs';
import { test, expect } from '@playwright/test';

const card = page => page.locator('homemanager-card');
const editor = page => card(page).locator('homemanager-editor');
const button = (page, name) => card(page).getByRole('button', { name, exact: true });
const draft = page => page.evaluate(() => window.testHarness.card.getDraftConfiguration());
const begin = async page => {
  await openCardMenu(page);
  await button(page, 'Editar plano').click();
};
// In edit mode a tap on the symbol opens its sheet.
const select = (page, name = 'Luz de prueba') => button(page, name).click();

test('automatic binding preserves a colliding reusable action and does not invent script parameters', async ({
  page,
}) => {
  await page.evaluate(() => {
    window.testHarness.mutateRemote(dashboard => {
      dashboard.views[0].cards[0].configuration.actions['synthetic-sensor-synthetic-spare-turn-on'] = {
        domain: 'light',
        service: 'turn_on',
        target: { entity_id: 'light.synthetic_light' },
      };
    });
  });
  await begin(page);
  await select(page, 'Temperatura de prueba');
  await chooseAnyEntity(page, 'light.synthetic_spare');
  // A device without controls gets the ones its new entity suggests, shown before saving.
  await expect(editor(page).getByLabel('Al tocar el símbolo', { exact: true })).toHaveValue('power');
  await button(page, 'Guardar dispositivo').click();
  const configuration = await draft(page);
  expect(configuration.actions['synthetic-sensor-synthetic-spare-turn-on'].target.entity_id).toBe(
    'light.synthetic_light',
  );
  expect(configuration.catalog.devices[2].bindings.controls[0].steps[0].actionId).toBe(
    'synthetic-sensor-synthetic-spare-turn-on-2',
  );
  expect(configuration.actions['synthetic-sensor-synthetic-spare-turn-on-2'].target.entity_id).toBe(
    'light.synthetic_spare',
  );
  await button(page, 'Descartar cambios').click();
  await card(page)
    .getByRole('dialog', { name: '¿Descartar los cambios?' })
    .getByRole('button', { name: 'Descartar cambios', exact: true })
    .click();
  await expect.poll(async () => (await draft(page)).catalog.devices[2].bindings.controls).toBeUndefined();
  await page.evaluate(() => {
    const hass = window.testHarness.hass;
    hass.states['script.needs_input'] = { state: 'off', attributes: { friendly_name: 'Needs input' } };
    hass.services.script.needs_input = { fields: { message: { required: true, selector: { text: {} } } } };
    window.testHarness.card.hass = { ...hass };
  });
  await select(page, 'Temperatura de prueba');
  await chooseAnyEntity(page, 'script.needs_input');
  await button(page, 'Guardar dispositivo').click();
  // A script that needs input is not run by a tap: its panel asks for the fields.
  expect((await draft(page)).catalog.devices[2].bindings).toMatchObject({ primaryAction: null, tap: null });
  expect((await draft(page)).catalog.devices[2].bindings.controls).toBeUndefined();
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
  await button(page, 'Guardar dispositivo').click();
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

test('linking an existing icon suggests its controls only in the draft, then a tap runs them after save', async ({
  page,
}) => {
  await begin(page);
  await select(page, 'Temperatura de prueba');
  await chooseAnyEntity(page, 'light.synthetic_spare');
  await button(page, 'Guardar dispositivo').click();
  const configuration = await draft(page);
  const device = configuration.catalog.devices.find(item => item.id === 'synthetic-sensor');
  expect(device.bindings.tap).toBe('power');
  expect(configuration.actions[device.bindings.controls[0].steps[0].actionId]).toEqual({
    domain: 'light',
    service: 'turn_on',
    target: { entity_id: 'light.synthetic_spare' },
  });
  expect(
    await page.evaluate(() => window.testHarness.config.configuration.catalog.devices[2].bindings.controls),
  ).toBeUndefined();
  expect(await page.evaluate(() => window.testHarness.calls)).toEqual([]);
  await button(page, 'Guardar cambios').click();
  await expect(button(page, 'Guardar cambios')).toHaveAttribute('data-dirty', 'false');
  await button(page, 'Salir de edición').click();
  await button(page, 'Temperatura de prueba').click();
  await expect.poll(() => page.evaluate(() => window.testHarness.calls.length)).toBe(1);
  // The spare light is off, so the cycle's next step is "Encender".
  const call = await page.evaluate(() => window.testHarness.calls[0]);
  expect(call.domain).toBe('light');
  expect(call.service).toBe('turn_on');
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
  // A page with its sections on the side (mockup §9), not folded sections.
  const sections = settings.getByRole('navigation', { name: 'Secciones de ajustes' });
  for (const name of [
    'Plano y espacios',
    'Acciones lógicas',
    'Paneles nativos',
    'Referencias pendientes',
    'Importar y exportar',
  ])
    await expect(sections.getByRole('button', { name: new RegExp(`^${name}`) })).toBeVisible();
  await expect(settings.getByRole('listitem')).toHaveCount(3);
  await page.keyboard.press('Escape');
  await select(page);
  await editor(page).getByRole('button', { name: 'Ayuda: Dispositivo de Home Assistant', exact: true }).click();
  await expect(
    editor(page).getByText(
      'Elegí el dispositivo y las lecturas que querés mostrar. Los controles actuales se conservan.',
      { exact: true },
    ),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await button(page, 'Mover en el plano').click();
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
  await expect(button(page, 'Guardar dispositivo')).toBeInViewport();
  await expect(button(page, 'Mover en el plano')).toBeInViewport();
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
    window.testHarness.hass.themes = { darkMode: true };
    el.hass = { ...window.testHarness.hass };
  });
  expect(await editor(page).evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(18, 23, 20)');
  await expect(editor(page).getByRole('button', { name: 'Cerrar', exact: true })).toHaveCSS(
    'background-color',
    'rgb(18, 23, 20)',
  );
  await page.screenshot({
    path: testInfo.outputPath(`editor-${testInfo.project.name}-dark.png`),
    fullPage: true,
    animations: 'disabled',
  });
});
