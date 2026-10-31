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
  for (const label of ['Controles', 'Sensores', 'Energía', 'Infraestructura']) {
    await expect(layers.getByRole('button', { name: label, exact: true })).toHaveAttribute('title', label);
  }
  await expect(layers.getByRole('button', { name: 'Infraestructura', exact: true })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await layers.getByRole('button', { name: 'Sensores', exact: true }).click();
  await expect(card(page).locator('[data-id=leak]')).toHaveCount(0);
  await layers.getByRole('button', { name: 'Minimizar capas', exact: true }).click();
  await expect(layers.getByRole('button', { name: 'Controles', exact: true })).toBeHidden();
  await page.reload();
  await page.waitForFunction(() => window.shellHarnessReady);
  await expect(layers.getByRole('button', { name: 'Mostrar capas', exact: true })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  await card(page).locator('.hm-menu > summary').click();
  await card(page).getByRole('button', { name: 'Ajustes del plano', exact: true }).click();
  const settings = page.getByRole('region', { name: 'Ajustes del plano', exact: true });
  await settings.getByRole('checkbox', { name: /Mostrar capas/ }).uncheck();
  await settings.getByRole('button', { name: 'Volver', exact: true }).click();
  await card(page).getByRole('button', { name: 'Salir de edición', exact: true }).click();
  await expect(layers).toBeHidden();
  await page.reload();
  await page.waitForFunction(() => window.shellHarnessReady);
  await expect(layers).toBeHidden();
  await card(page).locator('.hm-menu > summary').click();
  await card(page)
    .getByRole('checkbox', { name: /Mostrar capas/ })
    .check();
  await page.keyboard.press('Escape');
  await expect(layers).toBeVisible();
});
test('holding a layer exposes its name without toggling it', async ({ page }) => {
  await start(page);
  const button = card(page).locator('.layers').getByRole('button', { name: 'Sensores', exact: true });
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
  await expect(pill).toBeVisible();
  await expect(pill).toHaveAttribute('data-active', 'false');
  const quiet = await card(page).evaluate(host => {
    const reference = document.createElement('span');
    reference.style.color = 'var(--hm-surface-2)';
    host.shadowRoot.append(reference);
    const color = getComputedStyle(reference).color;
    reference.remove();
    return color;
  });
  await expect(pill).toHaveCSS('background-color', quiet);
  await pill.click();
  await expect(page.getByRole('region', { name: 'Alertas', exact: true })).toContainText('Sin alertas');
  await page
    .getByRole('region', { name: 'Alertas', exact: true })
    .getByRole('button', { name: 'Volver', exact: true })
    .click();
  await card(page).locator('.layers').getByRole('button', { name: 'Sensores', exact: true }).click();
  await page.evaluate(() =>
    window.testHarness.updateState('binary_sensor.synthetic_leak', 'on', { device_class: 'moisture' }),
  );
  await expect(pill).toHaveAttribute('data-active', 'true');
  await pill.click();
  await expect(card(page).locator('[data-id=leak] .primary')).toBeFocused();
  await expect(card(page).locator('.layers').getByRole('button', { name: 'Sensores', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.evaluate(() =>
    window.testHarness.updateState('binary_sensor.synthetic_leak', 'off', { device_class: 'moisture' }),
  );
  await expect(pill).toBeVisible();
  await expect(pill).toHaveAttribute('data-active', 'false');
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
  await expect(card(page).locator('.layers').getByRole('button', { name: 'Sensors', exact: true })).toBeVisible();
});
