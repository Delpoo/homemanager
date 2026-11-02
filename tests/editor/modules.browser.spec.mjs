import { test, expect } from '../browser/local-test.mjs';
const card = page => page.locator('homemanager-card');
const editor = page => card(page).locator('homemanager-editor');
test.beforeEach(async ({ page }) => {
  await page.goto('/tests/browser/fixtures/shell.html');
  await page.waitForFunction(() => window.shellHarnessReady);
});
async function edit(page, id = 'fan') {
  await card(page).locator('.hm-menu > summary').click();
  await card(page).getByRole('button', { name: 'Editar plano', exact: true }).click();
  await card(page).locator(`[data-id=${id}] .primary`).click();
}
test('modules are independent, preview immediately, keep data and undo removal', async ({ page }) => {
  await edit(page);
  await expect(editor(page).getByRole('radio', { name: 'Interruptor', exact: true })).toHaveCount(0);
  await editor(page).locator('.module-menu > summary').click();
  await editor(page).locator('[data-command=module-add][data-module-id=indicators]').click();
  await expect(editor(page).locator('[data-module=indicators]')).toBeVisible();
  await expect
    .poll(() =>
      card(page).evaluate(c => c.getDraftConfiguration().catalog.devices.find(d => d.id === 'fan').display.modules),
    )
    .toContain('indicators');
  const module = editor(page).locator('[data-module=indicators]');
  await module.locator('summary').click();
  await module.getByRole('button', { name: 'Quitar módulo', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Quitar módulo', exact: true }).click();
  await expect(module).toBeHidden();
  await editor(page).getByRole('button', { name: 'Deshacer cambio de módulo' }).click();
  await expect(module).toBeVisible();
  await editor(page).locator('[name=layer]').selectOption('energy');
  await expect
    .poll(() =>
      card(page).evaluate(c => c.getDraftConfiguration().catalog.devices.find(d => d.id === 'fan').display.layer),
    )
    .toBe('energy');
});
