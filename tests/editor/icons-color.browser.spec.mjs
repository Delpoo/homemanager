import { test, expect } from '../browser/local-test.mjs';
import { setup, calls } from '../browser/rf-helpers.mjs';
test('full icon index is paged, bilingual, prefix-free, accepts unknown saved names and stays responsive', async ({
  page,
}, info) => {
  await page.goto('/tests/browser/fixtures/shell.html');
  await page.waitForFunction(() => window.shellHarnessReady);
  const card = page.locator('homemanager-card');
  await card.locator('.hm-menu > summary').click();
  await card.getByRole('button', { name: 'Editar plano', exact: true }).click();
  await card.locator('[data-id=fan] .primary').click();
  const picker = card.locator('homemanager-icon-picker[data-device-icon]');
  const elapsed = await picker.evaluate(async element => {
    const start = performance.now();
    element.shadowRoot.querySelector('.trigger').click();
    await new Promise(requestAnimationFrame);
    return performance.now() - start;
  });
  info.annotations.push({ type: 'icon-picker-open-ms', description: String(Math.round(elapsed)) });
  expect(elapsed).toBeLessThan(250);
  await expect(picker.getByRole('option')).toHaveCount(96);
  await expect(picker.locator('.count')).toContainText('7447');
  for (const query of ['lock', 'cerradura', 'mdi:lock']) {
    await picker.getByRole('searchbox').fill(query);
    await expect(picker.getByRole('option', { name: 'lock', exact: true })).toBeVisible();
  }
  expect(
    await picker
      .getByRole('option')
      .evaluateAll(nodes => nodes.every(node => !node.getAttribute('title').includes('mdi:'))),
  ).toBe(true);
  await picker.getByRole('searchbox').fill('rocket-launch');
  await picker.getByRole('option', { name: 'rocket-launch', exact: true }).click();
  await expect(picker).toHaveAttribute('value', 'mdi:rocket-launch');
  await picker.evaluate(element => (element.value = 'mdi:invented-test-glyph'));
  await picker.locator('.trigger').click();
  await picker.getByRole('searchbox').fill('invented-test-glyph');
  await expect(picker.getByRole('option', { name: 'invented-test-glyph', exact: true })).toBeVisible();
});
test('custom color previews in both themes and automatic removes the optional value', async ({ page }) => {
  await page.goto('/tests/browser/fixtures/shell.html');
  await page.waitForFunction(() => window.shellHarnessReady);
  const card = page.locator('homemanager-card');
  await card.locator('.hm-menu > summary').click();
  await card.getByRole('button', { name: 'Editar plano', exact: true }).click();
  await card.locator('[data-id=fan] .primary').click();
  const editor = card.locator('homemanager-editor');
  await editor.locator('.symbol-color > summary').click();
  await editor.getByLabel('Color libre', { exact: true }).fill('#7655a6');
  await editor.getByLabel('Color libre', { exact: true }).dispatchEvent('change');
  await expect
    .poll(() => card.evaluate(c => c.getDraftConfiguration().catalog.devices.find(d => d.id === 'fan').display.color))
    .toBe('#7655a6');
  const light = await card.locator('[data-id=fan] .symbol-body').evaluate(n => getComputedStyle(n).color);
  await card.evaluate(c => {
    window.testHarness.hass.themes = { darkMode: true };
    c.hass = { ...window.testHarness.hass };
  });
  await expect(card).toHaveAttribute('data-theme', 'dark');
  const dark = await card.locator('[data-id=fan] .symbol-body').evaluate(n => getComputedStyle(n).color);
  expect(light).not.toBe(dark);
  await editor.locator('[data-command=color-auto]').click();
  await expect
    .poll(() => card.evaluate(c => c.getDraftConfiguration().catalog.devices.find(d => d.id === 'fan').display.color))
    .toBeUndefined();
});
test('RF uses the same full picker and saves exact identifiers without transmitting', async ({ page }) => {
  const rf = await setup(page);
  await rf.getByRole('button', { name: 'Nuevo control', exact: true }).click();
  const picker = rf.locator('homemanager-icon-picker[data-rf-icon=new]');
  await picker.locator('.trigger').click();
  await picker.getByRole('searchbox').fill('rocket-launch');
  await picker.getByRole('option', { name: 'rocket-launch', exact: true }).click();
  await expect(picker).toHaveAttribute('value', 'mdi:rocket-launch');
  expect(await calls(page, 'homemanager/rf/press')).toEqual([]);
  expect(await calls(page, 'homemanager/rf/remote/save')).toEqual([]);
});
