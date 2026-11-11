import { openSettings } from '../browser/shell-helpers.mjs';
import { test, expect } from '../browser/local-test.mjs';

// Synthetic plan: living on the left; kitchen top right; office bottom right. Zones in the SVG.
// 0.13: spaces are shapes with straight sides, edited like in a drawing program.
const card = page => page.locator('homemanager-card');
const tool = (page, command) => card(page).locator(`[data-command="${command}"]`).first();
const draft = page => page.evaluate(() => window.testHarness.card.getDraftConfiguration());
const room = async (page, id) => (await draft(page)).rooms.find(item => item.id === id);
const editing = page => page.evaluate(() => window.testHarness.card.zoneEdit);
const zones = async page => (await editing(page)).draft.zones.map(zone => zone.id);
const moves = page => page.getByRole('region', { name: 'Dispositivos que cambian de espacio', exact: true });
const openEditor = async page => {
  await openSettings(card(page), 'rooms-section');
  await card(page).locator('homemanager-editor').getByRole('button', { name: 'Editar zonas', exact: true }).click();
  await expect(card(page).locator('.zvtools')).toBeVisible();
};
/** A point of the plan (0 to 1) on the screen. */
const screen = (page, x, y) =>
  page.evaluate(
    ([x, y]) => {
      const c = window.testHarness.card;
      const r = c.viewport.getBoundingClientRect();
      return {
        x: r.left + c.camera.x + (c.box.x + x * c.box.width) * c.camera.scale,
        y: r.top + c.camera.y + (c.box.y + y * c.box.height) * c.camera.scale,
      };
    },
    [x, y],
  );
const tapOnPlan = async (page, x, y, modifiers = []) => {
  const point = await screen(page, x, y);
  for (const key of modifiers) await page.keyboard.down(key);
  await page.mouse.click(point.x, point.y);
  for (const key of modifiers) await page.keyboard.up(key);
};
const dragOnPlan = async (page, from, to) => {
  const a = await screen(page, ...from),
    b = await screen(page, ...to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 6 });
  await page.mouse.up();
};

test.beforeEach(async ({ page }) => {
  await page.goto('/tests/browser/fixtures/card.html');
  await page.waitForFunction(() => window.testHarnessReady);
  await card(page).getByRole('button', { name: 'Editar plano', exact: true }).click();
});

test('every space is a shape over the plan; a tap chooses it, Shift adds, the list does the same', async ({ page }) => {
  await openEditor(page);
  await expect(card(page).locator('.zshape')).toHaveCount(3);
  await expect(card(page).locator('.zlabel')).toHaveCount(3);
  await expect(card(page).locator('.rooms')).toBeHidden();
  await tapOnPlan(page, 0.72, 0.22);
  expect((await editing(page)).chosen).toEqual(['kitchen']);
  await tapOnPlan(page, 0.72, 0.72, ['Shift']);
  expect((await editing(page)).chosen).toEqual(['kitchen', 'office']);
  await expect(card(page).locator('.zctx [data-command=zone-union]')).toBeVisible();
  // The list of spaces (beside the plan on a wide screen) chooses the same way.
  const item = card(page).locator('[data-zone-item=living]');
  if (await item.isVisible()) await item.click();
  else await tapOnPlan(page, 0.2, 0.5);
  expect((await editing(page)).chosen).toEqual(['living']);
});

test('Unir leaves one outline with the first name; its devices follow; applying saves the outline', async ({
  page,
}) => {
  await openEditor(page);
  await tapOnPlan(page, 0.72, 0.22);
  await tapOnPlan(page, 0.72, 0.72, ['Shift']);
  await card(page).locator('.zctx [data-command=zone-union]').click();
  expect(await zones(page)).toEqual(['living', 'kitchen']);
  const kitchen = (await editing(page)).draft.zones.find(zone => zone.id === 'kitchen');
  expect(kitchen.geom).toHaveLength(1);
  await tool(page, 'zone-apply').click();
  await moves(page).getByRole('button', { name: 'Aplicar', exact: true }).click();
  await expect(card(page).locator('.zvtools')).toHaveCount(0);
  const saved = await room(page, 'kitchen');
  expect(saved.shapeSource).toBe('app');
  expect(saved.outline[0].length).toBeGreaterThanOrEqual(4);
  expect(await room(page, 'office')).toBeUndefined();
  expect((await draft(page)).catalog.devices.every(device => device.roomId !== 'office')).toBe(true);
});

test('a stroke cuts a space in two; undo and redo step through it', async ({ page }) => {
  await openEditor(page);
  await tool(page, 'zone-tool-cut').click();
  await dragOnPlan(page, [0.25, 0.01], [0.25, 0.99]);
  expect(await zones(page)).toEqual(['living', 'kitchen', 'office', 'living-2']);
  expect((await editing(page)).tool).toBe('select');
  await page.keyboard.press('Control+z');
  expect(await zones(page)).toEqual(['living', 'kitchen', 'office']);
  await page.keyboard.press('Control+Shift+z');
  expect(await zones(page)).toHaveLength(4);
});

test('a rectangle becomes a new space named right away; a free shape closes on its first point', async ({ page }) => {
  await openEditor(page);
  await tool(page, 'zone-tool-rect').click();
  await dragOnPlan(page, [0.05, 0.05], [0.2, 0.2]);
  const input = card(page).locator('[name="zone-rename"]');
  await expect(input).toBeFocused();
  await input.fill('Placard');
  await input.press('Enter');
  expect((await editing(page)).draft.zones.at(-1).label).toBe('Placard');
  await tool(page, 'zone-tool-poly').click();
  for (const [x, y] of [
    [0.3, 0.6],
    [0.45, 0.6],
    [0.45, 0.8],
    [0.3, 0.8],
    [0.3, 0.6],
  ])
    await tapOnPlan(page, x, y);
  await expect(card(page).locator('[name="zone-rename"]')).toBeFocused();
  await card(page).locator('[name="zone-rename"]').press('Escape');
  expect((await editing(page)).draft.zones.at(-1).geom[0]).toHaveLength(4);
});

test('points: a double tap edits them, the middle of a side adds one, Supr removes it', async ({ page }) => {
  await openEditor(page);
  // Away from the name tag, whose double tap renames.
  const p = await screen(page, 0.6, 0.08);
  await page.mouse.click(p.x, p.y);
  await page.mouse.click(p.x, p.y);
  expect((await editing(page)).tool).toBe('points');
  await expect(card(page).locator('.zv')).toHaveCount(4);
  await card(page).locator('.zmid').first().click();
  await expect(card(page).locator('.zv')).toHaveCount(5);
  await card(page).locator('[data-command=zone-vertex-delete]').click();
  await expect(card(page).locator('.zv')).toHaveCount(4);
});

test('arrows move the chosen space; Escape lets go; the top menu waits until it is applied or cancelled', async ({
  page,
}) => {
  await openEditor(page);
  // Name and list buttons rebuild the editor as well: neither may drop its keyboard focus.
  for (const selector of ['[data-zone-label=kitchen]', '[data-zone-item=kitchen]']) {
    const target = card(page).locator(selector);
    if (!(await target.isVisible())) continue;
    await target.click();
    const before = (await editing(page)).draft.zones.find(zone => zone.id === 'kitchen').geom[0][0];
    await page.keyboard.press('ArrowLeft');
    const after = (await editing(page)).draft.zones.find(zone => zone.id === 'kitchen').geom[0][0];
    expect(after[0]).toBeLessThan(before[0]);
  }
  await page.keyboard.press('Escape');
  expect((await editing(page)).chosen).toEqual([]);
  await page.evaluate(() => {
    const command = document.createElement('button');
    command.dataset.command = 'configuration';
    window.testHarness.card.root.append(command);
    command.click();
    command.remove();
  });
  await expect(card(page).locator('.shell > .status')).toContainText('Terminá de editar las zonas');
  // Cancelling with changes asks first; the plan stays as it was.
  await tool(page, 'zone-cancel').click();
  await page.getByRole('button', { name: 'Descartar cambios', exact: true }).click();
  await expect(card(page).locator('.zvtools')).toHaveCount(0);
  expect((await room(page, 'kitchen')).outline).toBeUndefined();
});

test('the rail plus opens the editor drawing a new space', async ({ page }) => {
  await card(page).getByRole('button', { name: 'Nuevo espacio', exact: true }).click();
  await expect(card(page).locator('.zvtools [data-command=zone-tool-rect]')).toHaveAttribute('aria-pressed', 'true');
  await expect(card(page).locator('.zones-draw')).toBeVisible();
});

test('0.13: the ruler sets the scale; then shapes show metres and spaces their m²', async ({ page }) => {
  await openEditor(page);
  // Without a scale nothing is measured.
  await expect(card(page).locator('.zitem small')).toHaveCount(0);
  await tool(page, 'zone-tool-measure').click();
  // Half the width of the plan is 6 m: the plan is 12 m wide.
  await dragOnPlan(page, [0.1, 0.5], [0.6, 0.5]);
  const ask = card(page).getByRole('spinbutton', { name: 'Metros de esa línea' });
  await expect(ask).toBeFocused();
  await ask.fill('6');
  await ask.press('Enter');
  expect((await editing(page)).metres).toBeCloseTo(12, 1);
  // Each space in the list says its area, and a chosen one its size.
  await expect(card(page).locator('.zitem small').first()).toContainText('m²');
  await tapOnPlan(page, 0.72, 0.22);
  await expect(card(page).locator('.zmeas.under')).toContainText(/× .* m · .* m²/);
  // Applying keeps the scale in the plan, even when no space changed.
  await tool(page, 'zone-apply').click();
  await expect.poll(async () => (await draft(page)).planWidthMetres).toBeCloseTo(12, 1);
  // Opened again it remembers it: a rectangle being drawn shows its size in metres.
  await openEditor(page);
  await tool(page, 'zone-tool-rect').click();
  const a = await screen(page, 0.05, 0.05),
    b = await screen(page, 0.3, 0.3);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 4 });
  await expect(card(page).locator('.zmeas').first()).toContainText(/3[.,]0\d × .* m/);
  await page.mouse.up();
});
