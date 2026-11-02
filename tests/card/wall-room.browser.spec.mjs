import { test, expect } from '../browser/local-test.mjs';
import { openCardMenu } from '../browser/shell-helpers.mjs';
for (const width of [1440, 1920])
  test(`desktop ${width}: click and keyboard navigate while names clear`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 1080 });
    await page.goto('/tests/browser/fixtures/card.html');
    await page.waitForFunction(() => window.testHarnessReady);
    const card = page.locator('homemanager-card');
    await card.getByRole('button', { name: 'Vista por espacio', exact: true }).click();
    await expect.poll(() => card.evaluate(c => c.currentRoom)).toBe('office');
    await card.getByRole('button', { name: 'Ir a Espacio B', exact: true }).click();
    await expect.poll(() => card.evaluate(c => c.currentRoom)).toBe('kitchen');
    await card.locator('.viewport').focus();
    await page.keyboard.press('ArrowDown');
    await expect.poll(() => card.evaluate(c => c.currentRoom)).toBe('office');
    await expect(card.locator('.nav-name:visible')).toHaveCount(0);
    await expect(card.locator('.status')).not.toHaveText(/^Espacio [ABC]$/, { timeout: 3000 });
    for (const arrow of await card.locator('.nav-arrow').all()) {
      const a = await arrow.boundingBox(),
        v = await card.locator('.viewport').boundingBox();
      await expect
        .poll(async () => {
          const a = await arrow.boundingBox(),
            v = await card.locator('.viewport').boundingBox();
          return a.x >= v.x && a.x + a.width <= v.x + v.width;
        })
        .toBe(true);
    }
  });
test('wall mode enters actual fullscreen, uses a separate Now panel and restores the home', async ({ page }) => {
  await page.goto('/tests/browser/fixtures/card.html');
  await page.waitForFunction(() => window.testHarnessReady);
  const card = page.locator('homemanager-card');
  await card.evaluate(c => {
    const config = structuredClone(c.config);
    config.configuration.nowPanels = {
      home: [{ id: 'home', type: 'readings', title: 'Casa', readings: ['sensor.synthetic_temperature'] }],
      wall: [{ id: 'wall', type: 'alerts', title: 'Sólo pared' }],
    };
    c.setConfig(config);
  });
  await openCardMenu(page);
  await card.getByRole('button', { name: 'Modo pared', exact: true }).click();
  await expect(card).toHaveAttribute('data-wall', 'true');
  expect(await page.evaluate(() => !!document.fullscreenElement)).toBe(true);
  await expect(card.locator('homemanager-insights')).toContainText('Sólo pared');
  await card.getByRole('button', { name: 'Salir del modo pared', exact: true }).click();
  await expect(card).not.toHaveAttribute('data-wall', 'true');
  expect(await page.evaluate(() => document.fullscreenElement)).toBe(null);
  await expect(card.locator('homemanager-insights')).toContainText('Casa');
});
