import { openCardMenu } from '../browser/shell-helpers.mjs';
import { test, expect } from '../browser/local-test.mjs';
test.beforeEach(async ({ page }) => {
  await page.goto('/tests/browser/fixtures/card.html');
  await page.waitForFunction(() => window.testHarnessReady);
});
test('two real touch points zoom the SVG while keeping normalized device coordinates unchanged', async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, 'Requires the touch viewport.');
  const before = await page.evaluate(() =>
    window.testHarness.card.getDraftConfiguration().catalog.devices.map(d => d.position),
  );
  const stage = page.locator('homemanager-card').locator('.architecture');
  const initial = await stage.evaluate(node => new DOMMatrix(getComputedStyle(node).transform).a);
  const box = await page.getByRole('group', { name: 'Plano interactivo' }).boundingBox();
  const x = box.x + box.width / 2,
    y = box.y + box.height / 2;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [
      { x: x - 25, y, id: 1 },
      { x: x + 25, y, id: 2 },
    ],
  });
  for (let distance = 30; distance <= 65; distance += 5)
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        { x: x - distance, y, id: 1 },
        { x: x + distance, y, id: 2 },
      ],
    });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect
    .poll(() => stage.evaluate(node => new DOMMatrix(getComputedStyle(node).transform).a))
    .toBeGreaterThan(initial * 1.5);
  expect(
    await page.evaluate(() => window.testHarness.card.getDraftConfiguration().catalog.devices.map(d => d.position)),
  ).toEqual(before);
});
test('a real touch drag in edit mode creates a saveable draft without executing a service', async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, 'Requires the touch viewport.');
  await openCardMenu(page);
  await page.getByRole('button', { name: 'Editar plano', exact: true }).tap();
  const marker = page.getByRole('button', { name: 'Luz de prueba', exact: true });
  await marker.scrollIntoViewIfNeeded();
  const box = await marker.boundingBox();
  const x = box.x + box.width / 2,
    y = box.y + box.height / 2;
  const before = await page.evaluate(() => window.testHarness.card.getDraftConfiguration().catalog.devices[0].position);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
  for (let n = 1; n <= 6; n++)
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: x + n * 4, y: y + n * 3, id: 1 }],
    });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const save = page.getByRole('button', { name: 'Guardar cambios', exact: true });
  await expect(save).toHaveAttribute('data-dirty', 'true');
  await expect(save).toBeEnabled();
  expect(
    await page.evaluate(() => window.testHarness.card.getDraftConfiguration().catalog.devices[0].position),
  ).not.toEqual(before);
  expect(await page.evaluate(() => window.testHarness.calls.length)).toBe(0);
});
