import { showSection, openFirstSection, openSettings } from '../browser/shell-helpers.mjs';
import { test, expect } from '../browser/local-test.mjs';
const card = page => page.locator('homemanager-card');
async function start(page) {
  await page.goto('/tests/browser/fixtures/shell.html');
  await page.waitForFunction(() => window.shellHarnessReady);
}
test('layers are icons, filter, minimize persistently and can be hidden from settings', async ({ page }) => {
  await start(page);
  const layers = card(page).getByRole('navigation', { name: 'Capas', exact: true });
  expect((await layers.innerText()).trim()).toBe('');
  // 0.13: two filters, infrastructure and every other device.
  for (const label of ['Dispositivos', 'Infraestructura']) {
    await expect(layers.getByRole('button', { name: label, exact: true })).toHaveAttribute('title', label);
  }
  await expect(layers.getByRole('button', { name: 'Infraestructura', exact: true })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await layers.getByRole('button', { name: 'Dispositivos', exact: true }).click();
  await expect(card(page).locator('[data-id=leak]')).toHaveCount(0);
  await layers.getByRole('button', { name: 'Minimizar capas', exact: true }).click();
  await expect(layers.getByRole('button', { name: 'Dispositivos', exact: true })).toBeHidden();
  await page.reload();
  await page.waitForFunction(() => window.shellHarnessReady);
  await expect(layers.getByRole('button', { name: 'Mostrar capas', exact: true })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  await openSettings(card(page));
  await openFirstSection(page);
  const settings = page.getByRole('region', { name: 'Configuración', exact: true });
  // Layers live in Settings › Appearance since #70.
  await showSection(settings, 'appearance-section');
  await settings.getByRole('checkbox', { name: /Mostrar capas/ }).uncheck();
  // Leaving Settings opened from ⚙ also leaves editing (#70).
  await settings.getByRole('button', { name: 'Volver', exact: true }).click();
  await expect(layers).toBeHidden();
  await page.reload();
  await page.waitForFunction(() => window.shellHarnessReady);
  await expect(layers).toBeHidden();
  await openSettings(card(page));
  await openFirstSection(page);
  await showSection(settings, 'appearance-section');
  await settings.getByRole('checkbox', { name: /Mostrar capas/ }).check();
  await settings.getByRole('button', { name: 'Volver', exact: true }).click();
  await expect(layers).toBeVisible();
});
test('holding a layer exposes its name without toggling it', async ({ page }) => {
  await start(page);
  const button = card(page).locator('.layers').getByRole('button', { name: 'Dispositivos', exact: true });
  await button.dispatchEvent('pointerdown', { pointerType: 'touch' });
  await expect(button).toHaveAttribute('data-tooltip', 'true');
  await button.dispatchEvent('pointerup', { pointerType: 'touch' });
  await button.dispatchEvent('click');
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  await card(page).evaluate(host => {
    const parent = host.parentElement;
    host.remove();
    parent.append(host);
  });
  await button.dispatchEvent('pointerdown', { pointerType: 'touch' });
  await expect(button).toHaveAttribute('data-tooltip', 'true');
  await button.dispatchEvent('pointercancel');
});
test('zero alerts stay discreet, real alerts turn red and reveal their hidden layer', async ({ page }) => {
  await start(page);
  const pill = card(page).getByRole('button', { name: 'Alertas', exact: true });
  // With no alerts the pill hides (#76, vision §3).
  await expect(pill).toBeHidden();
  await card(page).locator('.layers').getByRole('button', { name: 'Dispositivos', exact: true }).click();
  await page.evaluate(() =>
    window.testHarness.updateState('binary_sensor.synthetic_leak', 'on', { device_class: 'moisture' }),
  );
  await expect(pill).toHaveAttribute('data-active', 'true');
  await pill.click();
  await expect(card(page).locator('[data-id=leak] .primary')).toBeFocused();
  await expect(
    card(page).locator('.layers').getByRole('button', { name: 'Dispositivos', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await page.evaluate(() =>
    window.testHarness.updateState('binary_sensor.synthetic_leak', 'off', { device_class: 'moisture' }),
  );
  await expect(pill).toBeHidden();
});
test('healthy and intentionally unlinked symbols stay clean; unavailable and broken links stay visible', async ({
  page,
}) => {
  await start(page);
  await expect(card(page).locator('[data-id=lamp] .symbol-health')).toHaveCount(0);
  await expect(card(page).locator('[data-id=fan] .symbol-health')).toHaveCount(0);
  await expect(card(page).locator('[data-id=remote] .symbol-health')).toHaveCount(0);
  await page.evaluate(() => window.testHarness.updateState('light.synthetic_light', 'unavailable'));
  await expect(card(page).locator('[data-id=lamp] [data-health=unavailable]')).toHaveCount(1);
  await page.evaluate(() => {
    const { card, hass } = window.testHarness;
    delete hass.states['sensor.synthetic_temperature'];
    card.hass = { ...hass };
  });
  await expect(card(page).locator('[data-id=temperature] [data-health=unknown]')).toHaveCount(1);
});
test('Spanish and English visits use readable names, states, activity and layer labels', async ({ page }) => {
  await page.goto('/tests/browser/fixtures/device-screen.html');
  await page.waitForFunction(() => window.deviceScreenHarnessReady);
  await card(page).getByRole('button', { name: 'Encuadrar Dormitorio', exact: true }).click();
  await card(page).getByRole('button', { name: 'Aire Dormitorio', exact: true }).click();
  const view = page.locator('homemanager-insights');
  await expect(view.getByRole('button', { name: 'Calor', exact: true })).toBeVisible();
  await expect(view).not.toContainText(/fan_only|sensor\.|climate\.|Unknown|Toggle|Slider/);
  await page.evaluate(() =>
    window.testHarness.card.activity.record({
      type: 'command',
      commandId: 'example-error',
      status: 'error',
      deviceId: 'cooling',
      detail: 'ha-unavailable',
      at: Date.now(),
    }),
  );
  await expect(card(page).locator('.activity')).toContainText('Home Assistant no está conectado.');
  await expect(card(page).locator('.activity')).not.toContainText('ha-unavailable');
  await page.evaluate(() => {
    const { card, hass } = window.testHarness;
    hass.language = 'en';
    hass.locale.language = 'en-US';
    card.hass = { ...hass };
  });
  await card(page).getByRole('button', { name: 'Aire Dormitorio', exact: true }).click();
  await expect(view.getByRole('button', { name: 'Heat', exact: true })).toBeVisible();
  await expect(view.getByRole('button', { name: 'Fan only', exact: true })).toBeVisible();
  await expect(card(page).locator('.layers').getByRole('button', { name: 'Devices', exact: true })).toBeVisible();
});
