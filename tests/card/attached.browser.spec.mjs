import { test, expect } from '../browser/local-test.mjs';
import { setup, ceiling, calls } from '../browser/rf-helpers.mjs';

// 0.13: a piece of the device's RF remote drawn next to its symbol on the plan.
const speed = {
  id: 'speed',
  type: 'updown',
  x: 0,
  y: 0,
  w: 2,
  h: 1,
  buttons: ['off', 'v1'],
  label: 'Vel',
  icon: null,
  values: { min: 1, max: 3, step: 1 },
};
const draft = page => page.evaluate(() => window.testHarness.card.getDraftConfiguration());
const attached = async page =>
  (await draft(page)).catalog.devices.find(d => d.id === 'synthetic-light').display.attached;

test.beforeEach(async ({ page }) => {
  await setup(page, { remotes: [ceiling({ layout: [speed] })] });
  await page.evaluate(() => {
    const h = window.testHarness;
    const config = structuredClone(h.original);
    const change = configuration => {
      const light = configuration.catalog.devices.find(d => d.id === 'synthetic-light');
      light.bindings.remoteId = 'techo';
      light.display.attached = [{ id: 'w1', piece: 'speed', dx: 30, dy: -24, w: 120, h: 48 }];
      light.display.modules = [...(light.display.modules ?? ['device', 'control']), 'pinned'].filter(
        (item, index, list) => list.indexOf(item) === index,
      );
    };
    change(config.configuration);
    // Editing starts from what is saved in Home Assistant.
    h.mutateRemote(dashboard => change(dashboard.views[0].cards[0].configuration));
    h.card.setConfig(config);
    h.card.hass = { ...h.hass };
    document.querySelector('#mount').replaceChildren(h.card);
  });
});

test('a pinned piece works on the plan like in its control, and sends', async ({ page }) => {
  const card = page.locator('homemanager-card');
  const box = card.locator('.attached[data-att=w1]');
  await expect(box.locator('homemanager-rf-remote')).toContainText('Vel');
  const size = await box.boundingBox();
  expect(Math.round(size.width)).toBe(120);
  await box.getByRole('button', { name: 'Subir Vel', exact: true }).click();
  await expect.poll(async () => (await calls(page, 'homemanager/rf/press')).map(c => c.button_id)).toEqual(['v1']);
});

test('in edit mode it is dragged, resized with the same numbers as the panel, and locked', async ({ page }) => {
  const card = page.locator('homemanager-card');
  await card.getByRole('button', { name: 'Editar plano', exact: true }).click();
  const box = card.locator('.attached[data-att=w1]');
  await expect(box.locator('homemanager-rf-remote')).toContainText('Vel');
  // The first tap chooses it and opens its symbol's sheet on "On the plan".
  await box.click();
  await expect(box).toHaveClass(/chosen/);
  const editor = card.locator('homemanager-editor');
  const width = editor.locator('[data-att-num=w]');
  await expect(width).toHaveValue('120');
  // Dragging moves it; the offset is saved.
  let at = await box.boundingBox();
  await page.mouse.move(at.x + 20, at.y + 20);
  await page.mouse.down();
  await page.mouse.move(at.x - 20, at.y + 80, { steps: 6 });
  await page.mouse.up();
  await expect.poll(async () => (await attached(page))[0].dy).toBeGreaterThan(20);
  expect((await attached(page))[0].dx).toBeLessThan(0);
  // Its corner resizes it; the panel shows the same width.
  at = await box.boundingBox();
  const grip = await box.locator('[data-agrip]').boundingBox();
  await page.mouse.move(grip.x + 7, grip.y + 7);
  await page.mouse.down();
  await page.mouse.move(grip.x + 47, grip.y + 7, { steps: 6 });
  await page.mouse.up();
  await expect.poll(async () => (await attached(page))[0].w).toBe(160);
  await expect(editor.locator('[data-att-num=w]')).toHaveValue('160');
  // The panel's slider resizes it too.
  await editor.locator('[data-att-num=w]').evaluate(input => {
    input.value = '200';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  // While it slides, the plan follows before anything is saved.
  await expect.poll(async () => Math.round((await box.boundingBox()).width)).toBe(200);
  expect((await attached(page))[0].w).toBe(160);
  await editor.locator('[data-att-num=w]').dispatchEvent('change');
  await expect.poll(async () => (await attached(page))[0].w).toBe(200);
  // Locked, it stays where it is.
  // Locked from its row in the panel (the plan has the same lock above the piece).
  await expect(card.locator('.attached[data-att=w1] [data-alock]')).toHaveCount(1);
  await editor.getByRole('button', { name: 'Fijar en su lugar', exact: true }).click();
  await expect.poll(async () => (await attached(page))[0].locked).toBe(true);
  const dx = (await attached(page))[0].dx;
  at = await box.boundingBox();
  await page.mouse.move(at.x + 20, at.y + 20);
  await page.mouse.down();
  await page.mouse.move(at.x + 90, at.y + 20, { steps: 6 });
  await page.mouse.up();
  expect((await attached(page))[0].dx).toBe(dx);
  // A look of its own on the plan: background colour.
  await editor.getByRole('button', { name: 'Fondo #3F7FBF', exact: true }).click();
  await expect.poll(async () => (await attached(page))[0].look?.bg).toBe('#3F7FBF');
  expect(await calls(page, 'homemanager/rf/press')).toEqual([]);
});

test('the panel pins another piece of the control and removes it', async ({ page }) => {
  const card = page.locator('homemanager-card');
  await card.getByRole('button', { name: 'Editar plano', exact: true }).click();
  await card.locator('.attached[data-att=w1]').click();
  const editor = card.locator('homemanager-editor');
  await editor.getByRole('button', { name: 'Pegar un elemento del control', exact: true }).click();
  await editor.getByRole('group', { name: 'Elementos del control' }).getByRole('button', { name: 'Vel' }).click();
  await expect.poll(async () => (await attached(page)).map(item => item.id)).toEqual(['w1', 'w2']);
  await expect(card.locator('.attached[data-att=w2] homemanager-rf-remote')).toContainText('Vel');
  await editor.getByRole('button', { name: 'Quitar del plano', exact: true }).first().click();
  await expect.poll(async () => (await attached(page)).map(item => item.id)).toEqual(['w2']);
});
