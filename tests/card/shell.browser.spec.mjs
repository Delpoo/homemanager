import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
const card = page => page.locator('homemanager-card');
test.beforeEach(async ({ page }) => {
  await page.goto('/tests/browser/fixtures/shell.html');
  await page.waitForFunction(() => window.shellHarnessReady);
});

test('shell is compact, branded, accessible, and reserves health marks for problems', async ({ page }, testInfo) => {
  const host = card(page);
  await expect(host.locator('.header')).toBeVisible();
  await expect(host.getByRole('button', { name: 'Editar plano', exact: true })).toBeHidden();
  await expect(host.locator('[data-id=temperature] .value')).toHaveText('23,4°');
  await expect(host.locator('[data-id=lamp] .symbol-ring')).toHaveCount(1);
  await expect(host.locator('[data-id=lamp] .symbol-health')).toHaveCount(0);
  await expect(host.locator('.state-dot')).toHaveCount(0);
  await expect(host.locator('[data-id=hub]')).toHaveCount(0);
  const boxes = await host.evaluate(node => {
    const root = node.shadowRoot;
    return {
      header: root.querySelector('.header').getBoundingClientRect().height,
      rail: root.querySelector('.rooms').getBoundingClientRect().height,
      brand: getComputedStyle(node).getPropertyValue('--hm-brand').trim(),
    };
  });
  expect(boxes.brand.toLowerCase()).toBe('#4f7a5a');
  if (testInfo.project.name === 'mobile') expect(boxes.header + boxes.rail).toBeLessThanOrEqual(120);
  await host.locator('.hm-menu > summary').click();
  await expect(host.getByRole('button', { name: 'Editar plano', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(host.locator('.hm-menu')).not.toHaveAttribute('open', '');
  await page.evaluate(() => {
    const h = window.testHarness.hass;
    h.themes = { darkMode: true };
    h.user.is_admin = false;
    window.testHarness.card.hass = { ...h };
  });
  await expect(host).toHaveAttribute('data-theme', 'dark');
  await host.locator('.hm-menu > summary').click();
  await expect(host.getByRole('button', { name: 'Editar plano', exact: true })).toHaveCount(0);
});

test('critical alerts propagate to the symbol, room and pill, and the pill frames the sensor', async ({ page }) => {
  await page.evaluate(() =>
    window.testHarness.updateState('binary_sensor.synthetic_leak', 'on', { device_class: 'moisture' }),
  );
  await expect(card(page).locator('[data-id=leak] .symbol-badge')).toHaveText('1');
  await expect(card(page).locator('[data-room=kitchen] .room-alerts')).toHaveText('1');
  await expect(card(page).locator('.alert-pill')).toBeVisible();
  await card(page).getByRole('button', { name: 'Alertas', exact: true }).click();
  await expect(card(page).locator('[data-id=leak]')).toHaveClass(/selected/);
  await expect(card(page).locator('[data-id=leak] .primary')).toBeFocused();
  await page.evaluate(() =>
    window.testHarness.updateState('binary_sensor.synthetic_leak', 'off', { device_class: 'moisture' }),
  );
  await expect(card(page).locator('.alert-pill')).toBeHidden();
});

test('activity shows exact send/air/error vocabulary and retains one row per command', async ({ page }) => {
  await card(page).getByRole('button', { name: 'Encuadrar Living', exact: true }).click();
  await card(page).getByRole('button', { name: 'Ventilador Living', exact: true }).click();
  await expect(card(page).locator('.activity')).toContainText('Enviado');
  await page.evaluate(() =>
    window.testHarness.updateState('script.synthetic_fan', 'off', {
      homemanager_on_air: { at: new Date().toISOString(), result: 'heard' },
    }),
  );
  await expect(card(page).locator('.activity')).toContainText('en el aire');
  expect(
    await card(page).evaluate(node => node.activity.entries.filter(entry => entry.type === 'command').length),
  ).toBe(1);
  await card(page).getByRole('button', { name: 'Historial de actividad', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Historial de actividad', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.evaluate(
    () =>
      (window.testHarness.hass.callService = async () => {
        throw new Error('synthetic failure');
      }),
  );
  await page.evaluate(() => (window.testHarness.card.hass = { ...window.testHarness.hass }));
  await card(page).getByRole('button', { name: 'Ventilador Living', exact: true }).click();
  await expect(card(page).locator('.activity')).toContainText('No se pudo enviar');
  await expect(card(page).locator('.activity')).toHaveAttribute('data-tone', 'alert');
});

test('capture the five requested visual scenarios and the import review', async ({ page }, testInfo) => {
  const size = testInfo.project.name === 'mobile' ? { width: 390, height: 844 } : { width: 1440, height: 900 };
  await page.setViewportSize(size);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const folder = process.env.HM_CAPTURE_VISUALS === '1' ? 'docs/evidence/0.7' : testInfo.outputPath('visuals');
  await mkdir(folder, { recursive: true });
  const shot = async label => {
    const bytes = await page.screenshot({ path: `${folder}/${testInfo.project.name}-${label}.png`, scale: 'css' });
    expect(bytes.readUInt32BE(16)).toBe(size.width);
    expect(bytes.readUInt32BE(20)).toBe(size.height);
  };
  await shot('plan');
  await card(page).getByRole('button', { name: 'Encuadrar Living', exact: true }).click();
  await expect(card(page).locator('.room-highlight')).toHaveCount(1);
  await shot('room');
  await card(page).getByRole('button', { name: 'Encuadrar todo', exact: true }).click();
  await page.evaluate(() =>
    window.testHarness.updateState('binary_sensor.synthetic_leak', 'on', { device_class: 'moisture' }),
  );
  await expect(card(page).locator('.alert-pill')).toBeVisible();
  await shot('alert');
  await card(page).getByRole('button', { name: 'Encuadrar Living', exact: true }).click();
  await card(page).getByRole('button', { name: 'Ventilador Living', exact: true }).click();
  await expect(card(page).locator('.activity')).toContainText('Enviado');
  await shot('activity');
  await card(page).locator('.hm-menu > summary').click();
  await shot('menu');
  await card(page).getByRole('button', { name: 'Editar plano', exact: true }).click();
  await card(page).getByRole('button', { name: 'Ajustes del plano', exact: true }).click();
  const editor = card(page).locator('homemanager-editor');
  await editor.locator('[data-settings="import-section"]').click();
  await editor.getByLabel('Importar JSON o SVG', { exact: true }).setInputFiles({
    name: 'joined.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400"><rect id="room-joined" width="600" height="400"><title>Casa reunida</title></rect></svg>',
    ),
  });
  await expect(page.getByRole('dialog', { name: 'Revisar cambios', exact: true })).toBeVisible();
  await shot('review');
});
