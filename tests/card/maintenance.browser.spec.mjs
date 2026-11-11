import { openSettings } from '../browser/shell-helpers.mjs';
import { test, expect } from '../browser/local-test.mjs';

// 0.13 Maintenance and help, as in the approved mockup.
const card = page => page.locator('homemanager-card');
const editor = page => card(page).locator('homemanager-editor');
test.beforeEach(async ({ page }) => {
  await page.goto('/tests/browser/fixtures/card.html');
  await page.waitForFunction(() => window.testHarnessReady);
  await card(page).getByRole('button', { name: 'Editar plano', exact: true }).click();
});

test('Home status is one list with filters and counts; pending references are part of it', async ({ page }) => {
  await openSettings(page, 'health-section');
  const section = editor(page).locator('#health-section');
  const all = section.locator('[data-command=health-filter][data-filter=all]');
  await expect(all).toHaveAttribute('aria-pressed', 'true');
  const total = Number(await all.locator('b').textContent());
  expect(total).toBeGreaterThan(0);
  await expect(section.locator('.health-row')).toHaveCount(total);
  // Another filter shows only its rows.
  const other = section.locator('[data-command=health-filter]:not([data-filter=all])').first();
  const count = Number(await other.locator('b').textContent());
  const cat = await other.getAttribute('data-filter');
  await other.click();
  await expect(section.locator('.health-row')).toHaveCount(count);
  await expect(section.locator(`.health-row:not([data-cat="${cat}"])`)).toHaveCount(0);
  // The pending references no longer have a section of their own.
  await editor(page).locator('homemanager-task-screen.settings-dialog .task-back').click();
  await expect(editor(page).locator('.nb-row[data-settings="pending-section"]')).toHaveCount(0);
  await expect(editor(page).locator('.nb-row[data-settings="storage-section"]')).toHaveCount(0);
});

test('Data and copies keeps export and import together', async ({ page }) => {
  await openSettings(page, 'import-section');
  const section = editor(page).locator('#import-section');
  await expect(editor(page).locator('homemanager-task-screen.settings-dialog .task-head h2')).toContainText(
    'Datos y copias',
  );
  await expect(section.getByRole('button', { name: 'Exportar JSON', exact: true })).toBeVisible();
  await expect(section.getByLabel('Importar JSON o SVG', { exact: true })).toBeAttached();
});

test('Help searches its topics, opens one from its card and holds the hover-help switch', async ({ page }) => {
  await openSettings(page, 'help-section');
  const section = editor(page).locator('#help-section');
  await section.getByRole('searchbox', { name: 'Buscar en la ayuda' }).fill('birrete');
  await expect(section.locator('.help-part:not([hidden])')).toHaveCount(1);
  await expect(section.locator('.help-part:not([hidden]) summary')).toHaveText('Alertas');
  await section.getByRole('searchbox', { name: 'Buscar en la ayuda' }).fill('');
  await section.locator('[data-help-topic="help-controles-rf"]').click();
  await expect(section.locator('#help-controles-rf')).toHaveAttribute('open', '');
  // One door: the switch lives in Help, not in Appearance.
  const tips = section.getByRole('switch', { name: 'Ayudas al pasar el mouse' });
  await tips.uncheck();
  expect(await page.evaluate(() => localStorage.getItem('homemanager:tips'))).toBe('off');
  await tips.check();
  await openSettings(page, 'appearance-section');
  await expect(editor(page).locator('#appearance-section [data-tips]')).toHaveCount(0);
});
