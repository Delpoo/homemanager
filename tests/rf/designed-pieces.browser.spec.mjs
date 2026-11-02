import { test, expect } from '../browser/local-test.mjs';
import { setup, ceiling, calls } from '../browser/rf-helpers.mjs';
test('a designed RF cycle advances after each send and a slider sends only on release', async ({ page }) => {
  const base = { x: 0, h: 1, label: null, icon: null };
  const rf = await setup(page, {
    remotes: [
      ceiling({
        layout: [
          { ...base, id: 'cycle', type: 'cycle', y: 0, w: 2, buttons: ['v1', 'v2'] },
          { ...base, id: 'slider', type: 'slider', y: 1, w: 4, buttons: ['v1', 'v2', 'v3'] },
        ],
      }),
    ],
  });
  await rf.locator('[data-open=techo]').click();
  const remote = rf.locator('homemanager-rf-remote');
  await remote.locator('[data-cycle=cycle]').click();
  await expect(remote.locator('[data-cycle=cycle]')).toHaveAttribute('data-send', 'v2');
  await remote.locator('[data-cycle=cycle]').click();
  await expect
    .poll(async () => (await calls(page, 'homemanager/rf/press')).map(c => c.button_id))
    .toEqual(['v1', 'v2']);
  const range = await remote.locator('[data-discrete=slider]').boundingBox();
  await page.mouse.move(range.x + 5, range.y + range.height / 2);
  await page.mouse.down();
  await page.mouse.move(range.x + range.width - 5, range.y + range.height / 2, { steps: 6 });
  expect((await calls(page, 'homemanager/rf/press')).length).toBe(2);
  await page.mouse.up();
  await expect
    .poll(async () => (await calls(page, 'homemanager/rf/press')).map(c => c.button_id))
    .toEqual(['v1', 'v2', 'v3']);
});
