import { test, expect } from '@playwright/test';

const card = page => page.locator('homemanager-card');
const button = (page, name) => card(page).getByRole('button', { name, exact: true });
const draft = page => page.evaluate(() => window.testHarness.card.getDraftConfiguration());
const light = async page => (await draft(page)).catalog.devices.find(device => device.id === 'synthetic-light');
const decimals = value => (String(value).split('.')[1] ?? '').length;

test.beforeEach(async ({ page }) => {
  await page.goto('/tests/browser/fixtures/card.html');
  await page.waitForFunction(() => window.testHarnessReady);
  await card(page).locator('.hm-menu > summary').click();
  await button(page, 'Editar plano').click();
  await expect(button(page, 'Guardar cambios')).toBeVisible();
});

test('a moved icon keeps a short position, and its sheet saves without a validation error', async ({ page }) => {
  const marker = await button(page, 'Luz de prueba').boundingBox();
  const x = marker.x + marker.width / 2,
    y = marker.y + marker.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  // Uneven steps: the raw result of a drag has many decimals.
  await page.mouse.move(x + 13, y + 7, { steps: 3 });
  await page.mouse.move(x + 37, y + 23, { steps: 3 });
  await page.mouse.up();
  const moved = await light(page);
  expect(decimals(moved.position.x)).toBeLessThanOrEqual(6);
  expect(decimals(moved.position.y)).toBeLessThanOrEqual(6);
  await button(page, 'Luz de prueba').click();
  await button(page, 'Guardar dispositivo').click();
  await expect(button(page, 'Guardar dispositivo')).toHaveCount(0);
  await button(page, 'Guardar cambios').click();
  await expect(button(page, 'Guardar cambios')).toHaveAttribute('data-dirty', 'false');
});

test('a plan saved with long positions by an earlier version opens and saves too', async ({ page }) => {
  await page.evaluate(() => {
    const card = window.testHarness.card;
    const next = card.getDraftConfiguration();
    next.catalog.devices.find(device => device.id === 'synthetic-light').position = {
      x: 0.2512345678912345,
      y: 0.3398765432109876,
    };
    card.change(next);
  });
  await button(page, 'Luz de prueba').click();
  await button(page, 'Guardar dispositivo').click();
  await expect(button(page, 'Guardar dispositivo')).toHaveCount(0);
  expect((await light(page)).position).toEqual({ x: 0.251235, y: 0.339877 });
});

test('the arrow keys keep positions short as well', async ({ page }) => {
  await button(page, 'Luz de prueba').focus();
  for (let i = 0; i < 7; i++) await page.keyboard.press('ArrowRight');
  const moved = await light(page);
  expect(decimals(moved.position.x)).toBeLessThanOrEqual(6);
});
