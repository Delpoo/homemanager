import { openCardMenu } from '../browser/shell-helpers.mjs';
import { chooseAnyEntity, openDeviceSections } from '../browser/device-picker-helpers.mjs';
import { test, expect } from '../browser/local-test.mjs';
const card = page => page.locator('homemanager-card');
const editor = page => page.locator('homemanager-editor');
const device = (page, id) =>
  card(page).evaluate((c, id) => c.getDraftConfiguration().catalog.devices.find(d => d.id === id), id);
async function begin(page, name) {
  await openCardMenu(page);
  await card(page).getByRole('button', { name: 'Editar plano', exact: true }).click();
  await card(page).getByRole('button', { name, exact: true }).click();
  await openDeviceSections(page);
}
test.beforeEach(async ({ page }) => {
  await page.goto('/tests/browser/fixtures/card.html');
});
test('a legacy meter gets indicators and can add controls without categories', async ({ page }) => {
  await begin(page, 'Temperatura de prueba');
  await expect(editor(page).getByRole('group', { name: 'Categoría' })).toHaveCount(0);
  await expect(editor(page).getByRole('group', { name: 'Qué muestra el símbolo' })).toBeVisible();
  await editor(page).locator('.module-menu > summary').click();
  await editor(page).locator('[data-command=module-add][data-module-id=control]').click();
  await editor(page).locator('#device-controls-section > summary').click();
  await expect(editor(page).getByRole('button', { name: 'Ciclo', exact: true })).toBeVisible();
  await expect(editor(page).getByLabel('Al tocar', { exact: true })).toBeVisible();
});
test('adding indicators keeps legacy kind, category, archetype and all controls', async ({ page }) => {
  await begin(page, 'Luz de prueba');
  const before = await device(page, 'synthetic-light');
  await editor(page).locator('.module-menu > summary').click();
  await editor(page).locator('[data-command=module-add][data-module-id=indicators]').click();
  await editor(page).locator('#module-indicators > summary').click();
  await editor(page).getByRole('radio', { name: 'Los dos', exact: true }).check();
  await editor(page)
    .getByRole('button', { name: /^(Guardar dispositivo|Listo)$/, exact: true })
    .click();
  const after = await device(page, 'synthetic-light');
  expect(after.display.category).toBe(before.display.category);
  expect(after.display.archetype).toBe(before.display.archetype);
  expect(after.display.show).toBe('both');
  expect(after.kind).toBe(before.kind);
  expect(after.bindings).toEqual(before.bindings);
});
test('relinking cannot replace a chosen module set or its controls', async ({ page }) => {
  await begin(page, 'Temperatura de prueba');
  await editor(page).locator('.module-menu > summary').click();
  await editor(page).locator('[data-command=module-add][data-module-id=control]').click();
  await chooseAnyEntity(page, 'light.synthetic_spare');
  await expect(editor(page).locator('[data-module=control]')).toBeVisible();
  await expect(editor(page).locator('[data-module=indicators]')).toBeVisible();
  await chooseAnyEntity(page, 'sensor.synthetic_temperature');
  await expect(editor(page).locator('[data-module=control]')).toBeVisible();
});
