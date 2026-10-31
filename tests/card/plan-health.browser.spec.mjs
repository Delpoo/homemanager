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
  await card(page).locator('.hm-menu > summary').click();
  await button(page, 'Editar plano').click();
  await expect(button(page, 'Guardar cambios')).toBeVisible();
};
const openDiagnosis = async page => {
  await button(page, 'Ajustes del plano').click();
  await editor(page).locator('[data-settings="health-section"]').click();
  return editor(page).getByRole('region', { name: 'Ajustes del plano' });
};

test.beforeEach(async ({ page }) => {
  await page.goto('/tests/browser/fixtures/card.html');
  await page.waitForFunction(() => window.testHarnessReady);
  // A plan with the mess of real life: a leftover space, a device assigned to the wrong one,
  // a broken link and a zone nobody uses.
  await page.evaluate(() => {
    const configuration = window.testHarness.card.getDraftConfiguration();
    configuration.rooms = configuration.rooms.filter(room => room.id !== 'kitchen');
    configuration.rooms.push({ id: 'old-hall', label: 'Pasillo viejo' });
    const devices = configuration.catalog.devices;
    devices.find(device => device.id === 'synthetic-sensor').roomId = 'living';
    devices.find(device => device.id === 'synthetic-fan').roomId = null;
    devices.find(device => device.id === 'synthetic-light').bindings.entityId = 'light.gone';
    window.testHarness.mutateRemote(dashboard => {
      dashboard.views[0].cards[0].configuration = configuration;
    });
  });
  await page.reload();
  await page.waitForFunction(() => window.testHarnessReady);
});

test('the rail hides a space with nothing to show, and editing shows it to fix it', async ({ page }) => {
  const rail = card(page).locator('.rooms');
  await expect(rail.getByRole('button', { name: 'Encuadrar Espacio A', exact: true })).toBeVisible();
  await expect(rail.getByRole('button', { name: 'Encuadrar Pasillo viejo', exact: true })).toHaveCount(0);
  await begin(page);
  await expect(rail.getByRole('button', { name: 'Encuadrar Pasillo viejo', exact: true })).toBeVisible();
});

test('the diagnosis says which plan is saved, lists each problem, and fixes the safe ones in one undo', async ({
  page,
}) => {
  await begin(page);
  const before = await draft(page);
  const settings = await openDiagnosis(page);
  await expect(settings.getByText('Synthetic geometry', { exact: true })).toBeVisible();
  await expect(settings.getByText(/2 zonas|3 zonas/)).toBeVisible();
  const rows = settings.locator('.health-row');
  await expect(rows.filter({ hasText: 'Pasillo viejo' })).toContainText('Espacio sin zona ni forma');
  await expect(rows.filter({ hasText: 'Temperatura de prueba' })).toContainText('Dibujado en');
  await expect(rows.filter({ hasText: 'Ventilador de prueba' })).toContainText('Dibujado fuera de todos los espacios');
  await expect(rows.filter({ hasText: 'Luz de prueba' })).toContainText('Su entidad ya no existe');
  await expect(rows.filter({ hasText: 'Zona del plano que ningún espacio usa' })).toHaveCount(1);
  await settings.getByRole('button', { name: /Arreglar lo seguro/ }).click();
  const fixed = await draft(page);
  expect(fixed.catalog.devices.find(device => device.id === 'synthetic-sensor').roomId).toBe('office');
  expect(fixed.rooms.some(room => room.id === 'old-hall')).toBe(false);
  // The unused zone was not added on its own, and no device was lost.
  expect(fixed.rooms.some(room => room.id === 'kitchen')).toBe(false);
  expect(fixed.catalog.devices.length).toBe(before.catalog.devices.length);
  await expect(settings.locator('.health-row').filter({ hasText: 'Pasillo viejo' })).toHaveCount(0);
  await settings.getByRole('button', { name: /^(Cerrar|Volver)$/, exact: true }).click();
  await button(page, 'Deshacer').click();
  expect(await draft(page)).toEqual(before);
});

test('a row fixes or opens just its own problem', async ({ page }) => {
  await begin(page);
  const settings = await openDiagnosis(page);
  // The zone nobody uses is added only when chosen.
  await settings
    .locator('.health-row')
    .filter({ hasText: 'Zona del plano que ningún espacio usa' })
    .getByRole('button', { name: 'Agregar', exact: true })
    .click();
  expect((await draft(page)).rooms.some(room => room.id === 'kitchen')).toBe(true);
  // With its space back, the fan is drawn in it and can move there.
  await settings
    .locator('.health-row')
    .filter({ hasText: 'Ventilador de prueba' })
    .getByRole('button', { name: /^Mover a/ })
    .click();
  expect((await draft(page)).catalog.devices.find(device => device.id === 'synthetic-fan').roomId).toBe('kitchen');
  // A broken link needs a decision: it opens the device's sheet.
  await settings
    .locator('.health-row')
    .filter({ hasText: 'Luz de prueba' })
    .getByRole('button', { name: 'Abrir', exact: true })
    .click();
  await expect(settings).toHaveCount(0);
  await expect(button(page, 'Guardar dispositivo')).toBeVisible();
});

test('a clean plan says it is in order', async ({ page }) => {
  await page.evaluate(() => {
    const configuration = window.testHarness.card.getDraftConfiguration();
    configuration.rooms = configuration.rooms.filter(room => room.id !== 'old-hall');
    configuration.rooms.push({ id: 'kitchen', label: 'Espacio B' });
    const devices = configuration.catalog.devices;
    devices.find(device => device.id === 'synthetic-sensor').roomId = 'office';
    devices.find(device => device.id === 'synthetic-fan').roomId = 'kitchen';
    devices.find(device => device.id === 'synthetic-light').bindings.entityId = 'light.synthetic_light';
    window.testHarness.mutateRemote(dashboard => {
      dashboard.views[0].cards[0].configuration = configuration;
    });
  });
  await page.reload();
  await page.waitForFunction(() => window.testHarnessReady);
  await begin(page);
  const settings = await openDiagnosis(page);
  await expect(settings.getByText(/Todo en orden/)).toBeVisible();
  await expect(settings.locator('.health-row')).toHaveCount(0);
});
