import { test, expect } from '../browser/local-test.mjs';
const card = page => page.locator('homemanager-card');
const editor = page => card(page).locator('homemanager-editor');
test.beforeEach(async ({ page }) => {
  await page.goto('/tests/browser/fixtures/shell.html');
  await page.waitForFunction(() => window.shellHarnessReady);
});
async function edit(page, id = 'fan') {
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

test('tap and hold are independently editable, keyboard hold works and context menu preserves control access', async ({
  page,
}) => {
  await edit(page);
  await editor(page).locator('#module-gestures > summary').click();
  await editor(page).locator('[data-gesture=tap]').selectOption('@screen');
  await editor(page).locator('[data-gesture=hold]').selectOption('@none');
  await expect
    .poll(() =>
      card(page).evaluate(c => c.getDraftConfiguration().catalog.devices.find(d => d.id === 'fan').bindings.hold),
    )
    .toEqual({ action: 'none' });
  await editor(page).getByRole('button', { name: 'Listo', exact: true }).click();
  // The synthetic fixture keeps the draft in memory; no Home Assistant is contacted.
  await card(page).evaluate(c => {
    c.editing = false;
    c.render();
  });
  const marker = card(page).locator('[data-id=fan] .primary');
  await marker.focus();
  await page.keyboard.press('Shift+Enter');
  await expect.poll(() => card(page).evaluate(c => c.feed.log.entries.at(-1)?.message)).toBe('Sin acción configurada');
  await marker.click({ button: 'right' });
  await expect(page.locator('homemanager-task-screen')).not.toHaveCount(0);
});
