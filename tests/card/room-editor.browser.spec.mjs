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
