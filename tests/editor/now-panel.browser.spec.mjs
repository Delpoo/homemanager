import { test, expect } from '../browser/local-test.mjs';
import { openCardMenu } from '../browser/shell-helpers.mjs';
test('Now editor previews selected readings, orders blocks, saves and permits a separate wall list', async ({
  page,
}) => {
  await page.goto('/tests/browser/fixtures/card.html');
  await page.waitForFunction(() => window.testHarnessReady);
  const card = page.locator('homemanager-card');
  await openCardMenu(page);
  await card.getByRole('button', { name: 'Editar plano', exact: true }).click();
  await card.locator('[data-command=settings]').click();
  const editor = card.locator('homemanager-editor');
  await editor.locator('[data-settings=now-section]').click();
  const panel = editor.locator('homemanager-now-panel-editor');
  await panel.locator('[data-type]').selectOption('readings');
  await panel.getByRole('button', { name: 'Agregar bloque', exact: true }).click();
  await panel.locator('[data-field=readings]').selectOption('sensor.synthetic_temperature');
  await panel.getByLabel('Título', { exact: true }).fill('Lectura de prueba');
  await panel.getByLabel('Título', { exact: true }).dispatchEvent('change');
  await expect(panel.locator('.preview')).toContainText('23');
  await panel.locator('[data-type]').selectOption('alerts');
  await panel.getByRole('button', { name: 'Agregar bloque', exact: true }).click();
  await panel.getByRole('button', { name: 'Subir', exact: true }).last().click();
  expect(await card.evaluate(c => c.draft.nowPanels.home.map(b => b.type))).toEqual(['alerts', 'readings']);
  await panel.getByLabel('Configuración del panel', { exact: true }).selectOption('wall');
  await panel.getByRole('button', { name: 'Quitar', exact: true }).first().click();
  expect(await card.evaluate(c => c.draft.nowPanels.home.length)).toBe(2);
  expect(await card.evaluate(c => c.draft.nowPanels.wall.length)).toBe(1);
  await page.keyboard.press('Escape');
  await card.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
  await expect(card.locator('.shell>.status')).toContainText('Guardado');
  await card.getByRole('button', { name: 'Salir de edición', exact: true }).click();
  expect(await page.evaluate(() => window.testHarness.calls)).toEqual([]);
  await page.reload();
  await page.waitForFunction(() => window.testHarnessReady);
  await expect(card.locator('homemanager-insights')).toContainText('Lectura de prueba');
  await expect(card.locator('homemanager-insights')).toContainText('23');
  expect(await page.evaluate(() => window.testHarness.calls)).toEqual([]);
});
