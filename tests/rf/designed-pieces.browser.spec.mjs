import { test, expect } from '../browser/local-test.mjs';
import { setup, ceiling, calls } from '../browser/rf-helpers.mjs';

test('the opened RF design displays the same live estimated reading as its designer', async ({ page }) => {
  await setup(page, {
    remotes: [
      ceiling({
        layout: [
          {
            id: 'value',
            type: 'indicator',
            x: 0,
            y: 0,
            w: 4,
            h: 1,
            buttons: [],
            label: 'Nivel',
            icon: null,
            reading: 'sensor.synthetic_temperature',
          },
        ],
      }),
    ],
  });
  await page.evaluate(() => {
    const h = window.testHarness;
    const config = structuredClone(h.original);
    config.configuration.catalog.devices[0].bindings.remoteId = 'techo';
    h.card.setConfig(config);
    h.card.hass = { ...h.hass };
    document.querySelector('#mount').replaceChildren(h.card);
  });
  const card = page.locator('homemanager-card');
  await card.locator('[data-id=synthetic-light] .primary').click({ button: 'right' });
  const panel = page.locator('homemanager-panel');
  const remote = panel.locator('.remote homemanager-rf-remote');
  // 0.13: the reading carries its unit.
  await expect(remote.locator('[data-reading=value]')).toHaveText('23 °C');
  await page.evaluate(() => window.testHarness.updateState('sensor.synthetic_temperature', '24'));
  await expect(remote.locator('[data-reading=value]')).toHaveText(/^24/);
  await expect(panel.locator('.additional-controls')).not.toHaveAttribute('open', '');
});
test('a designed RF cycle advances after each send and a bar goes straight to the level tapped', async ({ page }) => {
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
  const cycle = remote.locator('[data-widget=cycle] [data-op=cycle]');
  await cycle.click();
  await expect(cycle).toHaveAttribute('aria-label', 'Velocidad 1');
  await cycle.click();
  await expect(cycle).toHaveAttribute('aria-label', 'Velocidad 2');
  await expect
    .poll(async () => (await calls(page, 'homemanager/rf/press')).map(c => c.button_id))
    .toEqual(['v1', 'v2']);
  // One button per level: a tap near the end of the bar sends that level only.
  const track = await remote.locator('[data-widget=slider] .ktrack').boundingBox();
  await page.mouse.click(track.x + track.width - 2, track.y + track.height / 2);
  await expect
    .poll(async () => (await calls(page, 'homemanager/rf/press')).map(c => c.button_id))
    .toEqual(['v1', 'v2', 'v3']);
  await expect(remote.locator('[data-widget=slider] .ktrack')).toHaveAttribute('aria-valuenow', '2');
});
