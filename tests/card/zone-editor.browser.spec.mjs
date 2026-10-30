import { test, expect } from '@playwright/test';

// Synthetic plan: living on the left; kitchen top right; office bottom right. Zones in the SVG.
const card = page => page.locator('homemanager-card');
const button = (page, name) => card(page).getByRole('button', { name, exact: true });
const draft = page => page.evaluate(() => window.testHarness.card.getDraftConfiguration());
const room = async (page, id) => (await draft(page)).rooms.find(item => item.id === id);
const roomOf = async (page, id) => (await draft(page)).catalog.devices.find(item => item.id === id).roomId;
const pick = page => card(page).getByRole('combobox', { name: 'Zona', exact: true });
const nameField = page => card(page).getByRole('textbox', { name: 'Nombre de la zona', exact: true });
const moves = page => page.getByRole('dialog', { name: 'Dispositivos que cambian de espacio', exact: true });
const confirmMoves = async page => {
  await moves(page).getByRole('button', { name: 'Aplicar', exact: true }).click();
  await expect(card(page).locator('.zones-bar')).toHaveCount(0);
};
const begin = async page => {
  await card(page).locator('.hm-menu > summary').click();
  await button(page, 'Editar plano').click();
  await expect(button(page, 'Guardar cambios')).toBeVisible();
};
const openEditor = async page => {
  await button(page, 'Ajustes del plano').click();
  await card(page).locator('homemanager-editor').getByRole('button', { name: 'Editar zonas', exact: true }).click();
  await expect(card(page).locator('.zones-bar')).toBeVisible();
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
const dragOnPlan = async (page, from, to) => {
  const a = await screen(page, ...from),
    b = await screen(page, ...to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 5 });
  await page.mouse.up();
};
const tapOnPlan = async (page, x, y) => {
  const point = await screen(page, x, y);
  await page.mouse.click(point.x, point.y);
};
const dragHandle = async (page, handle, dx, dy) => {
  const box = await card(page).locator(`.zone-rect[data-active] .zone-handle[data-handle=${handle}]`).boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy, { steps: 4 });
  await page.mouse.up();
};

test.beforeEach(async ({ page }) => {
  await page.goto('/tests/browser/fixtures/card.html');
  await page.waitForFunction(() => window.testHarnessReady);
  await begin(page);
});

test('the editor shows every zone over the plan, and a tap picks one', async ({ page }) => {
  await openEditor(page);
  // Three zones, each with its name; the plan's own controls step aside.
  await expect(card(page).locator('.zone-name')).toHaveCount(3);
  await expect(card(page).locator('.zones-outline path')).toHaveCount(3);
  await expect(button(page, 'Guardar cambios')).toBeHidden();
  await expect(card(page).locator('.rooms')).toBeHidden();
  await expect(pick(page)).toHaveValue('');
  await tapOnPlan(page, 0.72, 0.22);
  await expect(pick(page)).toHaveValue('kitchen');
  await expect(card(page).locator('.zone-rect')).toHaveCount(1);
  await tapOnPlan(page, 0.72, 0.72);
  await expect(pick(page)).toHaveValue('office');
  // Choosing from the list is the same.
  await pick(page).selectOption('living');
  await expect(nameField(page)).toHaveValue((await room(page, 'living')).label);
});

test('two rectangles merged into an L stay one zone, with no seam, and answer by their parts', async ({ page }) => {
  await openEditor(page);
  await button(page, 'Nueva zona').click();
  await dragOnPlan(page, [0.1, 0.1], [0.3, 0.2]);
  await expect(nameField(page)).toBeFocused();
  await page.keyboard.type('Baño Sur');
  await button(page, 'Agregar rectángulo').click();
  await expect(button(page, 'Agregar rectángulo')).toHaveAttribute('aria-pressed', 'true');
  await dragOnPlan(page, [0.1, 0.2], [0.18, 0.35]);
  await expect(card(page).locator('.zone-rect')).toHaveCount(2);
  await button(page, 'Aplicar').click();
  await expect(card(page).locator('.zones-bar')).toHaveCount(0);
  const zone = await room(page, 'bano-sur');
  expect(zone.label).toBe('Baño Sur');
  expect(zone.shapeSource).toBe('app');
  expect(zone.rects).toHaveLength(2);
  expect(zone.shape.width).toBeCloseTo(0.2, 2);
  expect(zone.shape.height).toBeCloseTo(0.25, 2);
  // The new part caught the first one's edge: they touch, with no gap.
  expect(zone.rects[1].y).toBeCloseTo(zone.rects[0].y + zone.rects[0].height, 6);
  // Reopened, it is still one zone of two rectangles, and Save keeps it valid.
  await openEditor(page);
  await pick(page).selectOption('bano-sur');
  await expect(card(page).locator('.zone-rect')).toHaveCount(2);
  await button(page, 'Cancelar').click();
  await button(page, 'Guardar cambios').click();
  await expect(card(page).locator('.shell > .status')).not.toContainText('no válid');
});

test('a resize stops following the SVG, in one undo step; going back to the zone still works', async ({ page }) => {
  await openEditor(page);
  await tapOnPlan(page, 0.72, 0.72);
  const rect = card(page).locator('.zone-rect[data-active]');
  const before = await rect.boundingBox();
  await dragHandle(page, 'se', -20, -20);
  const after = await rect.boundingBox();
  expect(after.width).toBeLessThan(before.width);
  await button(page, 'Aplicar').click();
  await expect(card(page).locator('.zones-bar')).toHaveCount(0);
  const edited = await room(page, 'office');
  expect(edited.shapeSource).toBe('app');
  expect(edited.shape.x + edited.shape.width).toBeLessThanOrEqual(1);
  // Coordinates stay on the fine grid: this is what used to block a save.
  for (const value of Object.values(edited.shape)) expect(Math.round(value * 1e6) / 1e6).toBe(value);
  await button(page, 'Deshacer').click();
  expect((await room(page, 'office')).shapeSource).toBeUndefined();
  await button(page, 'Rehacer').click();
  const label = (await room(page, 'office')).label;
  await card(page)
    .locator('.rooms')
    .getByRole('button', { name: `Encuadrar ${label}`, exact: true })
    .click();
  const dialog = page.getByRole('dialog', { name: label, exact: true });
  await dialog.getByRole('button', { name: 'Volver a la zona del SVG', exact: true }).click();
  expect((await room(page, 'office')).shape).toBeUndefined();
});

test('a drag holds on to its rectangle even when the pointer leaves it', async ({ page }) => {
  await openEditor(page);
  await tapOnPlan(page, 0.72, 0.72);
  const rect = card(page).locator('.zone-rect[data-active]');
  await rect.evaluate(element => (element.dataset.same = 'yes'));
  const box = await rect.boundingBox();
  const handle = await card(page).locator('.zone-rect[data-active] .zone-handle[data-handle=nw]').boundingBox();
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  // Far out of the rectangle, in several steps: it keeps following.
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 3 });
  await page.mouse.move(box.x - 40, box.y - 40, { steps: 6 });
  await page.mouse.up();
  const after = await rect.boundingBox();
  expect(after.x).toBeLessThan(box.x - 20);
  expect(after.width).toBeGreaterThan(box.width + 20);
  // The same element: nothing was rebuilt under the finger.
  await expect(rect).toHaveAttribute('data-same', 'yes');
  await expect(button(page, 'Deshacer')).toBeEnabled();
});

test('the top menu cannot drop zones that are not applied yet', async ({ page }) => {
  await openEditor(page);
  await pick(page).selectOption('kitchen');
  await button(page, 'Eliminar zona').click();
  await page.evaluate(() => {
    const command = document.createElement('button');
    command.dataset.command = 'plan-settings';
    window.testHarness.card.root.append(command);
    command.click();
    command.remove();
  });
  await expect(card(page).locator('.shell > .status')).toContainText('Terminá de editar las zonas');
  await expect(card(page).locator('.zones-bar')).toBeVisible();
  await expect(card(page).locator('.zone-name')).toHaveCount(2);
});

test('renaming alone keeps the zone on the SVG', async ({ page }) => {
  await openEditor(page);
  await pick(page).selectOption('kitchen');
  await nameField(page).fill('  Cocina grande ');
  await button(page, 'Aplicar').click();
  await expect(moves(page)).toHaveCount(0);
  const kitchen = await room(page, 'kitchen');
  expect(kitchen.label).toBe('Cocina grande');
  expect(kitchen.shape).toBeUndefined();
  expect(kitchen.shapeSource).toBeUndefined();
});

test('a zone needs a name', async ({ page }) => {
  await openEditor(page);
  await pick(page).selectOption('kitchen');
  await nameField(page).fill('   ');
  await button(page, 'Aplicar').click();
  await expect(card(page).locator('.shell > .status')).toContainText('Escribí el nombre');
  await expect(card(page).locator('.zones-bar')).toBeVisible();
  await expect(nameField(page)).toBeFocused();
});

test('merging two zones keeps the name of the one in hand, and its devices follow', async ({ page }) => {
  await openEditor(page);
  await pick(page).selectOption('office');
  await card(page).getByRole('combobox', { name: 'Fusionar con', exact: true }).selectOption('kitchen');
  await expect(card(page).locator('.zone-rect')).toHaveCount(2);
  await expect(card(page).locator('.zone-name')).toHaveCount(2);
  await button(page, 'Aplicar').click();
  // The fan was in the kitchen: it is told, and it goes.
  await expect(moves(page).getByRole('checkbox')).toHaveCount(1);
  await confirmMoves(page);
  const after = await draft(page);
  expect(after.rooms.map(item => item.id).sort()).toEqual(['living', 'office']);
  const office = after.rooms.find(item => item.id === 'office');
  expect(office.rects).toHaveLength(2);
  expect(await roomOf(page, 'synthetic-fan')).toBe('office');
  // One undo brings it all back.
  await button(page, 'Deshacer').click();
  expect((await draft(page)).rooms.map(item => item.id).sort()).toEqual(['kitchen', 'living', 'office']);
  expect(await roomOf(page, 'synthetic-fan')).toBe('kitchen');
});

test('deleting a zone leaves its devices without a space, and says so first', async ({ page }) => {
  await openEditor(page);
  await pick(page).selectOption('office');
  await button(page, 'Eliminar zona').click();
  await expect(pick(page)).toHaveValue('');
  await button(page, 'Aplicar').click();
  await expect(moves(page)).toContainText('Sin espacio');
  // It cannot stay in a space that is gone.
  await expect(moves(page).getByRole('checkbox')).toBeDisabled();
  await confirmMoves(page);
  expect((await draft(page)).rooms.some(item => item.id === 'office')).toBe(false);
  expect(await roomOf(page, 'synthetic-sensor')).toBe(null);
});

test('a zone that grows over a device offers to move it; unticked, it stays where it was', async ({ page }) => {
  await openEditor(page);
  await pick(page).selectOption('office');
  // A new part of the office, small and right over the light in the living.
  await button(page, 'Agregar rectángulo').click();
  await dragOnPlan(page, [0.2, 0.28], [0.3, 0.38]);
  await button(page, 'Aplicar').click();
  await expect(moves(page)).toBeVisible();
  // Going back keeps the work.
  await moves(page).getByRole('button', { name: 'Volver', exact: true }).click();
  await expect(card(page).locator('.zone-rect')).toHaveCount(2);
  await button(page, 'Aplicar').click();
  const light = moves(page).getByRole('checkbox');
  await expect(light).toBeChecked();
  await light.uncheck();
  await confirmMoves(page);
  expect((await room(page, 'office')).rects).toHaveLength(2);
  expect(await roomOf(page, 'synthetic-light')).toBe('living');
  await button(page, 'Deshacer').click();
  await openEditor(page);
  await pick(page).selectOption('office');
  await button(page, 'Agregar rectángulo').click();
  await dragOnPlan(page, [0.2, 0.28], [0.3, 0.38]);
  await button(page, 'Aplicar').click();
  await confirmMoves(page);
  expect(await roomOf(page, 'synthetic-light')).toBe('office');
});

test('the keyboard moves and resizes; its own undo steps back; Escape leaves the tool', async ({ page }) => {
  await openEditor(page);
  await tapOnPlan(page, 0.72, 0.72);
  const rect = card(page).locator('.zone-rect[data-active]');
  await rect.focus();
  const before = await rect.boundingBox();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Shift+ArrowLeft');
  const after = await rect.boundingBox();
  expect(after.x).toBeLessThan(before.x);
  expect(after.width).toBeLessThan(before.width);
  // Control-Z steps inside the editor, not the plan behind it.
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  const back = await rect.boundingBox();
  expect(back.x).toBeCloseTo(before.x, 1);
  expect(back.width).toBeCloseTo(before.width, 1);
  await button(page, 'Agregar rectángulo').click();
  await expect(card(page).locator('.zones-draw')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(card(page).locator('.zones-draw')).toHaveCount(0);
});

test('a drag too small draws nothing, and cancelling leaves the plan as it was', async ({ page }) => {
  const before = await draft(page);
  await openEditor(page);
  // Nothing edited: it just closes.
  await button(page, 'Cancelar').click();
  await expect(card(page).locator('.zones-bar')).toHaveCount(0);
  await openEditor(page);
  await button(page, 'Nueva zona').click();
  await dragOnPlan(page, [0.5, 0.5], [0.505, 0.505]);
  await expect(card(page).locator('.shell > .status')).toContainText('Arrastrá un poco más');
  await dragOnPlan(page, [0.1, 0.1], [0.3, 0.3]);
  await pick(page).selectOption('kitchen');
  await button(page, 'Eliminar zona').click();
  // With work in it, it asks first.
  await button(page, 'Cancelar').click();
  await page.getByRole('button', { name: 'Descartar cambios', exact: true }).last().click();
  await expect(card(page).locator('.zones-bar')).toHaveCount(0);
  expect(await draft(page)).toEqual(before);
  await expect(button(page, 'Guardar cambios')).toBeVisible();
});

test('the space window opens the editor on that zone; a space with no shape starts drawing', async ({ page }) => {
  const label = (await room(page, 'office')).label;
  await card(page)
    .locator('.rooms')
    .getByRole('button', { name: `Encuadrar ${label}`, exact: true })
    .click();
  await page
    .getByRole('dialog', { name: label, exact: true })
    .getByRole('button', { name: 'Editar forma en el plano', exact: true })
    .click();
  await expect(pick(page)).toHaveValue('office');
  await expect(card(page).locator('.zone-rect')).toHaveCount(1);
  await expect(card(page).locator('homemanager-editor').getByRole('dialog')).toHaveCount(0);
  await button(page, 'Cancelar').click();
  // The rail's plus starts a new zone.
  await button(page, 'Nuevo espacio').click();
  await expect(button(page, 'Nueva zona')).toHaveAttribute('aria-pressed', 'true');
  await expect(card(page).locator('.zones-draw')).toBeVisible();
});
