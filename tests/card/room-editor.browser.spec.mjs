import { test, expect } from '@playwright/test';

// Synthetic plan: Espacio A (living) on the left; B (kitchen) top right; C (office) bottom right.
const card = page => page.locator('homemanager-card');
const button = (page, name) => card(page).getByRole('button', { name, exact: true });
const draft = page => page.evaluate(() => window.testHarness.card.getDraftConfiguration());
const room = async (page, id) => (await draft(page)).rooms.find(item => item.id === id);
const begin = async page => {
  await card(page).locator('.hm-menu > summary').click();
  await button(page, 'Editar plano').click();
  await expect(button(page, 'Guardar cambios')).toBeVisible();
};
// The synthetic V1 card is relabelled once it is edited: read each label from the draft.
const openSpace = async (page, id) => {
  const label = (await room(page, id)).label;
  await card(page)
    .locator('.rooms')
    .getByRole('button', { name: `Encuadrar ${label}`, exact: true })
    .click();
  const dialog = page.getByRole('dialog', { name: label, exact: true });
  await expect(dialog).toBeVisible();
  return dialog;
};

test.beforeEach(async ({ page }) => {
  await page.goto('/tests/browser/fixtures/card.html');
  await page.waitForFunction(() => window.testHarnessReady);
  await page.evaluate(() => localStorage.removeItem('homemanager-room-nav'));
  await begin(page);
});

test('a space sets its framing, skipping and which arrows it shows, and the room view follows', async ({ page }) => {
  const dialog = await openSpace(page, 'office');
  const arrows = dialog.getByRole('group', { name: 'Flechas desde este espacio' });
  await expect(arrows.getByRole('checkbox')).toHaveCount(2);
  await arrows.getByRole('checkbox', { name: (await room(page, 'living')).label }).uncheck();
  await dialog.getByRole('group', { name: 'Encuadre al 100 %' }).getByRole('radio', { name: 'Amplio' }).check();
  await dialog.getByRole('button', { name: 'Aplicar', exact: true }).click();
  expect(await room(page, 'office')).toMatchObject({ frame: 'wide', nav: { hidden: ['living'] } });
  // B is a space you pass through: no arrow points to it.
  const kitchen = await openSpace(page, 'kitchen');
  await kitchen.getByRole('checkbox', { name: 'Saltear al navegar' }).check();
  await kitchen.getByRole('button', { name: 'Aplicar', exact: true }).click();
  expect((await room(page, 'kitchen')).nav).toEqual({ skip: true });
  await button(page, 'Salir de edición').click();
  await button(page, 'Encuadrar todo').click();
  // The view opens on the space at the centre once the whole plan is framed.
  await page.waitForTimeout(400);
  await button(page, 'Vista por espacio').click();
  await expect.poll(() => page.evaluate(() => window.testHarness.card.currentRoom)).toBe('office');
  // From C, A is hidden and B is skipped: no arrows at all.
  await expect(card(page).locator('.nav-arrow')).toHaveCount(0);
});

test('the shape is edited on the plan with handles, applied as its own shape, and can go back to the zone', async ({
  page,
}) => {
  const dialog = await openSpace(page, 'office');
  await dialog.getByRole('button', { name: 'Editar forma en el plano', exact: true }).click();
  const shape = card(page).locator('.shape-box');
  await expect(shape).toBeVisible();
  // Let the camera finish framing the space.
  await page.waitForTimeout(400);
  await expect(card(page).locator('homemanager-editor').getByRole('dialog')).toHaveCount(0);
  const before = await shape.boundingBox();
  const handle = await card(page).locator('.shape-handle[data-handle=se]').boundingBox();
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x - 20, handle.y - 20, { steps: 4 });
  await page.mouse.up();
  const after = await shape.boundingBox();
  expect(after.width).toBeLessThan(before.width);
  // Arrow keys move it; Escape would cancel.
  await shape.focus();
  await page.keyboard.press('ArrowLeft');
  await button(page, 'Aplicar forma').click();
  await expect(shape).toHaveCount(0);
  const edited = await room(page, 'office');
  expect(edited.shapeSource).toBe('app');
  expect(edited.shape.width).toBeGreaterThan(0.1);
  expect(edited.shape.x + edited.shape.width).toBeLessThanOrEqual(1);
  // One undo brings the zone back.
  await button(page, 'Deshacer').click();
  expect((await room(page, 'office')).shape?.shapeSource ?? null).toBe(null);
  await button(page, 'Rehacer').click();
  const again = await openSpace(page, 'office');
  await again.getByRole('button', { name: 'Volver a la zona del SVG', exact: true }).click();
  const zone = await room(page, 'office');
  expect(zone.shape).toBeUndefined();
  expect(zone.shapeSource).toBeUndefined();
});

test('cancelling leaves the space as it was', async ({ page }) => {
  const before = await room(page, 'living');
  const dialog = await openSpace(page, 'living');
  await dialog.getByRole('button', { name: 'Editar forma en el plano', exact: true }).click();
  await card(page).locator('.shape-box').focus();
  await page.keyboard.press('Shift+ArrowRight');
  await button(page, 'Cancelar').click();
  await expect(card(page).locator('.shape-box')).toHaveCount(0);
  expect(await room(page, 'living')).toEqual(before);
});
