import { openAdvanced, openFirstSection } from '../browser/shell-helpers.mjs';
import { openCardMenu } from '../browser/shell-helpers.mjs';
import { chooseAnyEntity, openDeviceSections } from '../browser/device-picker-helpers.mjs';
import { test, expect } from '../browser/local-test.mjs';

const card = page => page.locator('homemanager-card');
const editor = page => card(page).locator('homemanager-editor');
const button = (page, name) =>
  card(page).getByRole('button', {
    name:
      name === 'Guardar dispositivo' ? /^(Guardar dispositivo|Listo)$/ : name === 'Cerrar' ? /^(Cerrar|Volver)$/ : name,
    exact: true,
  });
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
  await expect(editor(page).getByLabel('Al tocar', { exact: true })).toHaveValue('power');
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
  await button(page, 'Crear').click();
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

test('cancelling a new device leaves no trace, with or without a name (#88)', async ({ page }) => {
  await begin(page);
  const before = (await draft(page)).catalog.devices.length;
  const undo = card(page).getByRole('button', { name: 'Deshacer', exact: true });
  const undoBefore = await undo.isDisabled();
  const startNew = async () => {
    await button(page, 'Agregar dispositivo').click();
    await button(page, 'Dispositivo vacío').click();
    await expect(button(page, 'Crear')).toBeVisible();
    await expect(button(page, 'Cancelar')).toBeVisible();
  };
  // Empty sheet: the × closes at once, without a question or a browser bubble.
  await startNew();
  await button(page, 'Cerrar').click();
  await expect(editor(page)).toBeHidden();
  expect((await draft(page)).catalog.devices.length).toBe(before);
  // With a name: Cancel asks once, and discarding adds nothing.
  await startNew();
  await editor(page).getByLabel('Nombre del dispositivo', { exact: true }).fill('No quedará');
  await button(page, 'Cancelar').click();
  await expect(editor(page).getByRole('dialog')).toContainText('¿Descartar el dispositivo nuevo?');
  await editor(page).getByRole('button', { name: 'Descartar', exact: true }).click();
  await expect(editor(page)).toBeHidden();
  // Tapping × with a name also asks; keeping the sheet keeps what was typed.
  await startNew();
  await editor(page).getByLabel('Nombre del dispositivo', { exact: true }).fill('Tampoco');
  await button(page, 'Cerrar').click();
  await editor(page).getByRole('dialog').getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(editor(page).getByLabel('Nombre del dispositivo', { exact: true })).toHaveValue('Tampoco');
  // Esc while typing works like Cancel.
  await editor(page).getByLabel('Nombre del dispositivo', { exact: true }).press('Escape');
  await editor(page).getByRole('button', { name: 'Descartar', exact: true }).click();
  const after = await draft(page);
  expect(after.catalog.devices.length).toBe(before);
  expect(after.catalog.devices.some(d => ['No quedará', 'Tampoco'].includes(d.display.label))).toBe(false);
  // Nothing reached the undo history either.
  expect(await undo.isDisabled()).toBe(undoBefore);
});

test('creating without a name shows the app message next to the field (#88)', async ({ page }) => {
  await begin(page);
  await button(page, 'Agregar dispositivo').click();
  await button(page, 'Dispositivo vacío').click();
  await button(page, 'Crear').click();
  const name = editor(page).getByLabel('Nombre del dispositivo', { exact: true });
  await expect(name).toHaveAttribute('aria-invalid', 'true');
  await expect(editor(page).locator('.field-error')).toHaveText('Completá este campo.');
  await expect(name).toBeFocused();
  await name.fill('Con nombre');
  await expect(editor(page).locator('.field-error')).toHaveCount(0);
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
  await button(page, 'Configuración').click();
  await openFirstSection(page);
  const settings = editor(page).getByRole('region', { name: 'Configuración' });
  await expect(settings).toBeVisible();
  // A page with its sections on the side (mockup §9), not folded sections.
  await expect(settings.getByRole('listitem')).toHaveCount(3);
  const sections = settings.getByRole('navigation', { name: 'Secciones de configuración' });
  await openAdvanced(settings);
  for (const name of ['Plano y espacios', 'Acciones lógicas', 'Paneles nativos', 'Referencias pendientes', 'Copias'])
    await expect(sections.getByRole('button', { name: new RegExp(`^${name}`) }).first()).toBeVisible();
  await page.keyboard.press('Escape');
  await select(page);
  await openDeviceSections(page, ['device-binding']);
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
  expect(await editor(page).evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(27, 34, 30)');
  await expect(editor(page).getByRole('button', { name: /^(Cerrar|Volver)$/, exact: true })).toHaveCSS(
    'background-color',
    'rgb(18, 23, 20)',
  );
  await page.screenshot({
    path: testInfo.outputPath(`editor-${testInfo.project.name}-dark.png`),
    fullPage: true,
    animations: 'disabled',
  });
});
