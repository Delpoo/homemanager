import { test, expect } from '../browser/local-test.mjs';

test('legacy primaryAction keeps its sent note and never implies physical confirmation', async ({ page }) => {
  await page.goto('/tests/browser/fixtures/card.html');
  await page.waitForFunction(() => window.testHarnessReady);
  const card = page.locator('homemanager-card');
  await card.locator('[data-id=synthetic-light] .primary').click();
  await expect(card.locator('.sent-note')).toContainText('Enviado');
  await expect.poll(() => page.evaluate(() => window.testHarness.calls.length)).toBe(1);
  expect(await card.evaluate(c => c.activity.entries.at(-1).status)).toBe('sent');
  expect(await card.evaluate(c => c.activity.entries.some(entry => entry.status === 'confirmed'))).toBe(false);
});
