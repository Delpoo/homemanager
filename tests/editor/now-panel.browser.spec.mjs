import { test, expect } from '../browser/local-test.mjs';
import { openCardMenu, showSection, openSettings } from '../browser/shell-helpers.mjs';

test('shortcut destination matches its label and choosing a target replaces the other target', async ({ page }) => {
  await page.goto('/tests/browser/fixtures/card.html');
  await page.waitForFunction(() => window.testHarnessReady);
  await page.evaluate(() => {
    const h = window.testHarness,
      c = structuredClone(h.original);
    c.configuration.nowPanels = {
      home: [{ id: 'shortcut', type: 'shortcut', deviceId: 'synthetic-light', roomId: 'office' }],
    };
    h.card.setConfig(c);
    h.card.hass = { ...h.hass };
  });
  const card = page.locator('homemanager-card');
  await expect(card.locator('homemanager-insights [data-now-room]')).toHaveCount(0);
  await expect(card.locator('homemanager-insights')).toContainText('Luz de prueba');
  await openCardMenu(page);
  await card.getByRole('button', { name: 'Editar plano', exact: true }).click();
  await openSettings(card);
  await showSection(card, 'now-section');
  const panel = card.locator('homemanager-now-panel-editor');
  await panel.getByRole('button', { name: 'Agregar bloque', exact: true }).click();
  await panel.locator('[data-add-type=shortcut]').click();
  await panel.locator('[data-field=roomId]').selectOption('living');
  expect(await card.evaluate(c => c.draft.nowPanels.home[0].deviceId)).toBeUndefined();
  await panel.locator('[data-field=deviceId]').selectOption('synthetic-light');
  expect(await card.evaluate(c => c.draft.nowPanels.home[0].roomId)).toBeUndefined();
});
test('Now editor previews selected readings, orders blocks and saves', async ({ page }) => {
  await page.goto('/tests/browser/fixtures/card.html');
  await page.waitForFunction(() => window.testHarnessReady);
  const card = page.locator('homemanager-card');
  await openCardMenu(page);
  await card.getByRole('button', { name: 'Editar plano', exact: true }).click();
  await openSettings(card);
  const editor = card.locator('homemanager-editor');
  await showSection(editor, 'now-section');
  const panel = editor.locator('homemanager-now-panel-editor');
  await panel.getByRole('button', { name: 'Agregar bloque', exact: true }).click();
  await panel.locator('[data-add-type=readings]').click();
  await panel.locator('input[data-check-field=readings][value="sensor.synthetic_temperature"]').check();
  await panel.getByLabel('Título', { exact: true }).fill('Lectura de prueba');
  await panel.getByLabel('Título', { exact: true }).dispatchEvent('change');
  await expect(panel.locator('.w.sel .preview')).toContainText('23');
  await panel.getByRole('button', { name: 'Agregar bloque', exact: true }).click();
  await panel.locator('[data-add-type=alerts]').click();
  await panel.getByRole('button', { name: 'Subir', exact: true }).last().click();
  // Customizing starts from what Now shows today (#62).
  expect(await card.evaluate(c => c.draft.nowPanels.home.map(b => b.type))).toEqual([
    'alerts',
    'climate',
    'active',
    'energy',
    'alerts',
    'readings',
  ]);
  // The wall list was removed with wall mode (#61): only the home list is edited.
  await expect(panel.getByLabel('Configuración del panel', { exact: true })).toHaveCount(0);
  expect(await card.evaluate(c => c.draft.nowPanels.home.length)).toBe(6);
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
