// Plan 0.12, lote B (#59, #76): full control, alerts and history beside the plan on a wide screen.
import { test, expect } from '../browser/local-test.mjs';

const card = page => page.locator('homemanager-card');

test.beforeEach(async ({ page }) => {
  await page.goto('/tests/browser/fixtures/card.html');
  await page.waitForFunction(() => window.testHarnessReady);
});

test('the full control opens beside the plan on a wide screen, and Escape returns to the symbol (#59)', async ({
  page,
}, testInfo) => {
  const symbol = card(page).locator('[data-id="synthetic-light"] .primary');
  await symbol.focus();
  await page.keyboard.press('Shift+Enter');
  const panel = card(page).locator('homemanager-panel');
  await expect(panel).toBeVisible();
  if (testInfo.project.name === 'desktop') {
    await expect(panel).toHaveAttribute('data-dock', 'side');
    // The plan stays in view and the symbol is outside the panel.
    await expect(card(page).locator('.viewport')).toBeVisible();
    const a = await symbol.boundingBox(),
      b = await panel.boundingBox();
    expect(a.x + a.width <= b.x || a.x >= b.x + b.width).toBe(true);
    // One way out: the ← (no ×).
    await expect(panel.locator('.close')).toBeHidden();
  } else await expect(panel).not.toHaveAttribute('data-dock', /./);
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
  await expect(symbol).toBeFocused();
});

test('alerts and history open beside the plan, and the empty pill hides (#76)', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', 'a phone keeps its sheet');
  await expect(card(page).locator('.alert-pill')).toBeHidden();
  await card(page).locator('.activity').click();
  const side = card(page).locator('.workspace > .side-dock homemanager-task-screen');
  await expect(side).toBeVisible();
  await expect(card(page).locator('.viewport')).toBeVisible();
  await side.locator('.task-back').click();
  await expect(card(page).locator('.side-dock')).toHaveCount(0);
});

test('an unlinked symbol says so and offers Vincular to an administrator (#76)', async ({ page }) => {
  await page.evaluate(() =>
    window.testHarness.mutateRemote(dashboard => {
      const devices = dashboard.views[0].cards[0].configuration.catalog.devices;
      devices.push({
        id: 'synthetic-unlinked',
        roomId: 'office',
        kind: 'light',
        position: { x: 0.45, y: 0.12 },
        mobility: 'editable',
        display: { label: 'Lámpara sin vincular', icon: 'mdi:lamp' },
        bindings: { entityId: null, primaryAction: null, advancedPopupId: null },
        state: { value: 'unknown', confidence: 'unknown' },
      });
    }),
  );
  await page.reload();
  await page.waitForFunction(() => window.testHarnessReady);
  await card(page).locator('[data-id="synthetic-unlinked"] .primary').click({ button: 'right' });
  const page2 = card(page).getByRole('region', { name: 'Lámpara sin vincular' });
  await expect(page2).toContainText('Este símbolo todavía no está conectado a un dispositivo.');
  await expect(page2).not.toContainText('entidad');
  await page2.getByRole('button', { name: 'Vincular', exact: true }).click();
  await expect(card(page).locator('.editor-wrap')).toBeVisible();
  await expect(card(page).locator('homemanager-editor details#device-binding')).toHaveAttribute('open', '');
});
