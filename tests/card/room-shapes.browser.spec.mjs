import { test, expect } from '../browser/local-test.mjs';

const card = page => page.locator('homemanager-card');
const rail = page => card(page).locator('.rooms');
const current = page => page.evaluate(() => window.testHarness.card.currentRoom);
const camera = page => page.evaluate(() => ({ ...window.testHarness.card.camera }));

test.beforeEach(async ({ page }) => {
  await page.goto('/tests/browser/fixtures/card.html');
  await page.waitForFunction(() => window.testHarnessReady);
  // Two spaces without a zone in the synthetic SVG: one drawn in the app, one that kept a copy.
  await page.evaluate(() => {
    // The synthetic card starts as V1; its migrated V2 draft carries the spaces.
    const configuration = window.testHarness.card.getDraftConfiguration();
    configuration.rooms.push(
      {
        id: 'studio',
        label: 'Estudio',
        icon: 'mdi:desk',
        shape: { x: 0.05, y: 0.1, width: 0.15, height: 0.2 },
        shapeSource: 'app',
      },
      { id: 'garage', label: 'Garaje', shape: { x: 0.6, y: 0.6, width: 0.3, height: 0.3 }, shapeSource: 'svg' },
    );
    window.testHarness.mutateRemote(dashboard => {
      dashboard.views[0].cards[0].configuration = configuration;
    });
  });
  await page.reload();
  await page.waitForFunction(() => window.testHarnessReady);
});

test('a space with its own shape is on the rail, is framed and highlighted without an SVG zone', async ({ page }) => {
  const before = await camera(page);
  await rail(page).getByRole('button', { name: 'Encuadrar Estudio', exact: true }).click();
  await expect.poll(() => current(page)).toBe('studio');
  await expect.poll(async () => (await camera(page)).scale).toBeGreaterThan(before.scale);
  await expect(card(page).locator('.room-highlight')).toHaveCount(1);
  await expect(card(page).locator('.room-highlight')).toHaveAttribute('data-room', 'studio');
  // A zone that the plan dropped: the copy still frames the space.
  await rail(page).getByRole('button', { name: 'Encuadrar Garaje', exact: true }).click();
  await expect.poll(() => current(page)).toBe('garage');
  await expect(card(page).locator('.room-highlight')).toHaveAttribute('data-room', 'garage');
  await expect(card(page).locator('.status')).not.toContainText('zona SVG');
});

test('an own shape is not reported as a space without a zone in plan settings', async ({ page }) => {
  await card(page).locator('.hm-menu > summary').click();
  await card(page).getByRole('button', { name: 'Editar plano', exact: true }).click();
  await card(page).getByRole('button', { name: 'Ajustes del plano', exact: true }).click();
  await expect(card(page).locator('homemanager-editor .plan-conflicts')).toHaveCount(0);
});
