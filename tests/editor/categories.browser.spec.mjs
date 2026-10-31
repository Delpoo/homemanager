import { openCardMenu } from '../browser/shell-helpers.mjs';
import { chooseAnyEntity } from '../browser/device-picker-helpers.mjs';
import { test, expect } from '../browser/local-test.mjs';

const card = page => page.locator('homemanager-card');
const editor = page => card(page).locator('homemanager-editor');
const button = (page, name) => card(page).getByRole('button', { name, exact: true });
const draft = page => page.evaluate(() => window.testHarness.card.getDraftConfiguration());
const device = async (page, id) => (await draft(page)).catalog.devices.find(item => item.id === id);
const categories = page => editor(page).getByRole('group', { name: 'Categoría' });
const begin = async (page, name) => {
  await openCardMenu(page);
  await button(page, 'Editar plano').click();
  await button(page, name).click();
};

test.beforeEach(async ({ page }) => {
  await page.goto('/tests/browser/fixtures/card.html');
});

test('the sheet starts with the suggested category and shows only its sections', async ({ page }) => {
  await begin(page, 'Temperatura de prueba');
  await expect(categories(page).getByRole('radio', { name: 'Medidor' })).toBeChecked();
  // A meter: what to show, and no button editor.
  await expect(editor(page).getByRole('group', { name: 'Qué muestra el símbolo' })).toBeVisible();
  await expect(editor(page).getByLabel('Al tocar el símbolo', { exact: true })).toBeHidden();
  // The technical kind is no longer offered.
  await expect(editor(page).getByLabel('Tipo de dispositivo', { exact: true })).toHaveCount(0);
  await categories(page).getByRole('radio', { name: 'Interruptor' }).check();
  await expect(editor(page).getByLabel('Al tocar el símbolo', { exact: true })).toBeVisible();
  await expect(editor(page).getByRole('group', { name: 'Qué muestra el símbolo' })).toBeHidden();
});

test('saving writes the chosen category and what to show, and keeps the kind and the hidden controls', async ({
  page,
}) => {
  await begin(page, 'Luz de prueba');
  await expect(categories(page).getByRole('radio', { name: 'Interruptor' })).toBeChecked();
  const before = await device(page, 'synthetic-light');
  await categories(page).getByRole('radio', { name: 'Medidor' }).check();
  await editor(page)
    .getByRole('group', { name: 'Qué muestra el símbolo' })
    .getByRole('radio', { name: 'Los dos' })
    .check();
  await button(page, 'Guardar dispositivo').click();
  const after = await device(page, 'synthetic-light');
  expect(after.display.category).toBe('meter');
  expect(after.display.show).toBe('both');
  expect(after.kind).toBe(before.kind);
  // Hiding the button editor never deletes what it had: the 0.5 primary action is still its tap control.
  expect(before.bindings.primaryAction).toBe('synthetic-light-toggle');
  expect(after.bindings.controls.find(control => control.id === after.bindings.tap).steps).toEqual([
    { actionId: 'synthetic-light-toggle' },
  ]);
});

test('linking another entity proposes its category, unless the person already chose one', async ({ page }) => {
  await begin(page, 'Temperatura de prueba');
  await chooseAnyEntity(page, 'light.synthetic_spare');
  await expect(categories(page).getByRole('radio', { name: 'Interruptor' })).toBeChecked();
  await categories(page).getByRole('radio', { name: 'Equipo' }).check();
  await chooseAnyEntity(page, 'sensor.synthetic_temperature');
  await expect(categories(page).getByRole('radio', { name: 'Equipo' })).toBeChecked();
});
