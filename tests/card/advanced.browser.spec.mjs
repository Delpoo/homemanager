import { openSettings } from '../browser/shell-helpers.mjs';
import { test, expect } from '../browser/local-test.mjs';

// 0.13: Advanced is gone; its parts are reached from where they are used.
const card = page => page.locator('homemanager-card');
const editor = page => card(page).locator('homemanager-editor');
const draft = page => page.evaluate(() => window.testHarness.card.getDraftConfiguration());
test.beforeEach(async ({ page }) => {
  await page.goto('/tests/browser/fixtures/card.html');
  await page.waitForFunction(() => window.testHarnessReady);
  await card(page).getByRole('button', { name: 'Editar plano', exact: true }).click();
});

test('the menu has no Advanced; a symbol lists its actions and opens one to edit it', async ({ page }) => {
  await openSettings(page);
  await expect(editor(page).locator('.nb-row[data-settings="actions-section"]')).toHaveCount(0);
  await expect(editor(page).locator('.nb-row[data-settings="panels-section"]')).toHaveCount(0);
  await editor(page).locator('homemanager-task-screen.settings-dialog .task-close').click();
  await card(page).locator('[data-id=synthetic-light] .primary').click();
  const control = editor(page).locator('#device-controls-section');
  if (!(await control.evaluate(node => node.open))) await control.locator('summary').click();
  const first = control.locator('[data-command=action-edit]').first();
  await expect(first).toBeVisible();
  const id = await first.getAttribute('data-action');
  await first.click();
  await expect(editor(page).locator('#action-select')).toHaveValue(id);
});

test('an advanced panel becomes the design of the symbol control, one button per control', async ({ page }) => {
  const panelId = await page.evaluate(() => {
    const c = window.testHarness.card;
    const next = structuredClone(c.getDraftConfiguration());
    const id = Object.keys(next.panels)[0];
    const light = next.catalog.devices.find(d => d.id === 'synthetic-light');
    light.bindings.advancedPopupId = id;
    light.display.modules = [...new Set([...(light.display.modules ?? ['device', 'control']), 'native'])];
    c.change(next);
    return id;
  });
  expect(panelId).toBeTruthy();
  const controls = (await draft(page)).panels[panelId].controls.length;
  await card(page).locator('[data-id=synthetic-light] .primary').click();
  const native = editor(page).locator('#module-native');
  if (!(await native.evaluate(node => node.open))) await native.locator('summary').click();
  await native.getByRole('button', { name: 'Pasar al diseñador', exact: true }).click();
  await expect
    .poll(async () => (await draft(page)).catalog.devices.find(d => d.id === 'synthetic-light').bindings.layout?.length)
    .toBe(controls);
  const light = (await draft(page)).catalog.devices.find(d => d.id === 'synthetic-light');
  expect(light.bindings.advancedPopupId).toBeNull();
  // The panel is kept as data: nothing is deleted.
  expect((await draft(page)).panels[panelId]).toBeTruthy();
});
