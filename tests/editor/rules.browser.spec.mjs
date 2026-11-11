import { openFirstSection, showSection, openSettings, pickReading } from '../browser/shell-helpers.mjs';
import { test, expect } from '../browser/local-test.mjs';
const card = page => page.locator('homemanager-card');
const rules = page => page.locator('homemanager-rules-editor');
const config = page => card(page).evaluate(c => c.getDraftConfiguration());
test.beforeEach(async ({ page }) => {
  await page.goto('/tests/browser/fixtures/alerts.html');
  await page.waitForFunction(() => window.alertHarnessReady);
  // 0.13: Alerts (before Rules) live in Settings.
  await openSettings(card(page));
  await openFirstSection(page);
  await showSection(card(page).locator('homemanager-editor'), 'rules-section');
  await expect(rules(page)).toBeVisible();
});
test('an alert is built as a sentence with a live preview; it is turned off, edited, deleted and undone', async ({
  page,
}) => {
  await rules(page).getByRole('button', { name: 'Nueva alerta', exact: true }).click();
  await rules(page).getByLabel('Nombre de la alerta', { exact: true }).fill('Condición de prueba');
  await pickReading(rules(page), 'sensor.test_soil');
  await rules(page).getByRole('radio', { name: 'Menor que', exact: true }).click();
  await rules(page).getByLabel('Menos de', { exact: true }).fill('50');
  await expect(rules(page).locator('#g-prev')).toContainText('Ahora se activaría');
  await rules(page).getByLabel('Menos de', { exact: true }).fill('1');
  await expect(rules(page).locator('#g-prev')).toContainText('Ahora no se activa');
  await rules(page).getByLabel('Menos de', { exact: true }).fill('50');
  await rules(page).getByLabel('Durante (minutos)', { exact: true }).fill('10');
  await rules(page).getByRole('radio', { name: 'Alerta', exact: true }).click();
  await rules(page).getByRole('button', { name: 'Listo', exact: true }).click();
  await expect
    .poll(async () => (await config(page)).rules?.[0])
    .toMatchObject({
      name: 'Condición de prueba',
      below: 50,
      forMinutes: 10,
      level: 'alert',
      symbols: [],
    });
  // The list says it in one line, with its switch.
  await expect(rules(page).getByRole('button', { name: /^Condición de prueba/ })).toContainText('< 50');
  await rules(page).getByRole('switch', { name: 'Condición de prueba', exact: true }).uncheck();
  await expect.poll(async () => (await config(page)).rules?.[0]?.enabled).toBe(false);
  await rules(page)
    .getByRole('button', { name: /^Condición de prueba/ })
    .click();
  await rules(page).getByLabel('Menos de', { exact: true }).fill('47');
  await rules(page).getByRole('button', { name: 'Listo', exact: true }).click();
  await expect.poll(async () => (await config(page)).rules?.[0]?.below).toBe(47);
  await rules(page)
    .getByRole('button', { name: /^Condición de prueba/ })
    .click();
  await rules(page).getByRole('button', { name: 'Borrar alerta', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Eliminar', exact: true }).click();
  await expect.poll(async () => (await config(page)).rules?.length).toBe(0);
  await rules(page).getByRole('button', { name: 'Deshacer', exact: true }).click();
  await expect.poll(async () => (await config(page)).rules?.[0]?.below).toBe(47);
});
test('the guide walks through the five parts of an alert', async ({ page }) => {
  await rules(page).getByRole('button', { name: 'Guía paso a paso', exact: true }).click();
  const guide = rules(page).getByRole('dialog', { name: 'Guía' });
  for (const [title, target] of [
    ['Qué mirar', '#g-read'],
    ['La condición', '#g-cmp'],
    ['El límite', '#g-val'],
    ['Cómo se ve', '#g-sev'],
    ['El resultado', '#g-prev'],
  ]) {
    await expect(guide).toContainText(title);
    if (target !== '#g-val') await expect(rules(page).locator(target)).toHaveClass(/gfocus/);
    await guide.getByRole('button', { name: /^(Siguiente|Listo)$/ }).click();
  }
  await expect(guide).toHaveCount(0);
});
test('legacy notices keep both bounds and level; included alerts change their limit and symbols', async ({ page }) => {
  await expect(rules(page)).toContainText('Incluidas');
  const before = await card(page).evaluate(
    c => c.getDraftConfiguration().catalog.devices.find(d => d.id === 'plant').display.alerts,
  );
  await rules(page).locator('[data-open^="legacy:plant:"]').first().click();
  await expect(rules(page).getByLabel('Menos de', { exact: true })).toHaveValue(String(before[0].below));
  await rules(page).getByRole('button', { name: 'Volver', exact: true }).click();
  // Included alerts are one row per type (#60): this symbol leaves Offline.
  await rules(page).locator('button.ib[data-open="base:unavailable"]').click();
  await rules(page).locator('input[data-check-field="base-devices"][value="plant"]').uncheck();
  await rules(page).getByRole('button', { name: 'Listo', exact: true }).click();
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
