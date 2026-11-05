import { openFirstSection, showSection, openSettings } from '../browser/shell-helpers.mjs';
import { test, expect } from '../browser/local-test.mjs';
const card = page => page.locator('homemanager-card');
const rules = page => page.locator('homemanager-rules-editor');
test.beforeEach(async ({ page }) => {
  await page.goto('/tests/browser/fixtures/alerts.html');
  await page.waitForFunction(() => window.alertHarnessReady);
  // Rules live only in Settings since #70.
  await openSettings(card(page));
  await openFirstSection(page);
  await showSection(card(page).locator('homemanager-editor'), 'rules-section');
  await expect(rules(page)).toBeVisible();
});
test('one rules screen creates, edits, disables, deletes and undoes a rule with no symbols', async ({ page }) => {
  await rules(page).getByRole('button', { name: '+ Nueva regla', exact: true }).click();
  await rules(page).getByLabel('Nombre de la regla', { exact: true }).fill('Condición de prueba');
  await rules(page).locator('input[data-check-field=sources][value="sensor.test_soil"]').check();
  await expect(rules(page).getByLabel('Menos de', { exact: true })).toHaveValue('');
  await rules(page).getByLabel('Menos de', { exact: true }).fill('50');
  await expect(rules(page).locator('output')).toContainText('Se cumple ahora');
  await rules(page).getByRole('button', { name: 'Guardar regla', exact: true }).click();
  await expect.poll(() => card(page).evaluate(c => c.getDraftConfiguration().rules?.[0]?.symbols)).toEqual([]);
  await rules(page).getByRole('switch', { name: 'Condición de prueba', exact: true }).uncheck();
  await expect.poll(() => card(page).evaluate(c => c.getDraftConfiguration().rules?.[0]?.enabled)).toBe(false);
  await rules(page)
    .getByRole('button', { name: /^Condición de prueba/ })
    .click();
  await rules(page).getByLabel('Menos de', { exact: true }).fill('47');
  await rules(page).getByRole('button', { name: 'Guardar regla', exact: true }).click();
  await expect.poll(() => card(page).evaluate(c => c.getDraftConfiguration().rules?.[0]?.below)).toBe(47);
  await rules(page).getByRole('button', { name: 'Borrar regla', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Eliminar', exact: true }).click();
  await expect.poll(() => card(page).evaluate(c => c.getDraftConfiguration().rules?.length)).toBe(0);
  await rules(page).getByRole('button', { name: 'Deshacer regla', exact: true }).click();
  await expect.poll(() => card(page).evaluate(c => c.getDraftConfiguration().rules?.[0]?.below)).toBe(47);
});
test('legacy notices keep both bounds and level; base rules can be disabled', async ({ page }) => {
  await expect(rules(page)).toContainText('Aviso conservado');
  const before = await card(page).evaluate(
    c => c.getDraftConfiguration().catalog.devices.find(d => d.id === 'plant').display.alerts,
  );
  const first = rules(page).locator('[data-edit^="legacy:plant:"]').first();
  await first.click();
  await expect(rules(page).getByLabel('Menos de', { exact: true })).toHaveValue(String(before[0].below));
  // Base rules are one row per type (#60): this symbol is excluded from Offline.
  await rules(page).locator('[data-edit="base:unavailable"]').click();
  await rules(page).locator('input[data-check-field="base-devices"][value="plant"]').uncheck();
  await rules(page).locator('[data-base-apply]').click();
  await expect
    .poll(() =>
      card(page).evaluate(
        c => c.getDraftConfiguration().catalog.devices.find(d => d.id === 'plant').display.disabledBaseRules,
      ),
    )
    .toContain('unavailable');
  expect(
    await card(page).evaluate(
      c => c.getDraftConfiguration().catalog.devices.find(d => d.id === 'plant').display.alerts,
    ),
  ).toEqual(before);
});
