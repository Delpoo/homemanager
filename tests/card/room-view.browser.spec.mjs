import { test, expect } from '../browser/local-test.mjs';

// Synthetic plan: Espacio A (living) on the left; B (kitchen) top right; C (office) bottom right.
const card = page => page.locator('homemanager-card');
const button = (page, name) => card(page).getByRole('button', { name, exact: true });
const current = page => page.evaluate(() => window.testHarness.card.currentRoom);
const arrows = page => card(page).locator('.nav-arrow');
const enter = async page => {
  await button(page, 'Vista por espacio').click();
  // The view opens on the space at the centre of the plan: C, the office.
  await expect.poll(() => current(page)).toBe('office');
  await expect(arrows(page)).toHaveCount(2);
};
const centre = async locator => {
  const box = await locator.boundingBox();
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};

test.beforeEach(async ({ page }) => {
  await page.goto('/tests/browser/fixtures/card.html');
  await page.waitForFunction(() => window.testHarnessReady);
  await page.evaluate(() => localStorage.removeItem('homemanager-room-nav'));
});

test('room view frames the centred space, with one arrow per reachable space and a way out', async ({ page }) => {
  await enter(page);
  await expect(button(page, 'Vista por espacio')).toHaveAttribute('aria-pressed', 'true');
  await expect(button(page, 'Ir a Espacio B')).toBeVisible();
  await expect(button(page, 'Ir a Espacio A')).toBeVisible();
  // The arrow to B sits above C, pointing up.
  const office = await card(page).locator('.room-highlight').boundingBox();
  const up = await centre(button(page, 'Ir a Espacio B'));
  expect(up.y).toBeLessThan((await centre(card(page).locator('.viewport'))).y);
  expect(office).not.toBeNull();
  await expect(card(page).getByRole('group', { name: 'Navegación por espacios' })).toBeVisible();
  // The whole plan ends the room view.
  await card(page).locator('.rooms .all').click();
  await expect.poll(() => current(page)).toBe(null);
  await expect(arrows(page)).toHaveCount(0);
  await expect(card(page).getByRole('group', { name: 'Navegación por espacios' })).toBeHidden();
});

test('a tap on an arrow does not travel; holding shows the name; pulling it back travels', async ({ page }) => {
  await enter(page);
  const arrow = button(page, 'Ir a Espacio B');
  await arrow.click();
  await page.waitForTimeout(400);
  expect(await current(page)).toBe('office');
  await expect(card(page).locator('.status')).toContainText('Tirá de la flecha');
  // Hold: the destination's name appears, and releasing in place goes nowhere.
  const point = await centre(arrow);
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await expect(arrow.locator('.nav-name')).toBeVisible();
  await page.mouse.up();
  expect(await current(page)).toBe('office');
  // Pull: against the arrow (it points up, so down) past 40 px.
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.mouse.move(point.x, point.y + 30, { steps: 4 });
  await page.mouse.move(point.x, point.y + 60, { steps: 4 });
  await page.mouse.up();
  await expect.poll(() => current(page)).toBe('kitchen');
});

test('Enter on an arrow and the arrow keys travel, for keyboard and screen readers', async ({ page }) => {
  await enter(page);
  await button(page, 'Ir a Espacio B').focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => current(page)).toBe('kitchen');
  await card(page).locator('.viewport').focus();
  await page.keyboard.press('ArrowDown');
  await expect.poll(() => current(page)).toBe('office');
});

test('a quick swipe pushes the plan to the space on the other side, or bounces back', async ({ page }) => {
  await enter(page);
  const viewport = await centre(card(page).locator('.viewport'));
  // Finger down: the plan moves down and the space above (B) comes in.
  await page.mouse.move(viewport.x, viewport.y - 80);
  await page.mouse.down();
  await page.mouse.move(viewport.x, viewport.y + 60, { steps: 3 });
  await page.mouse.up();
  await expect.poll(() => current(page)).toBe('kitchen');
  // Nothing above B within 35°: it bounces and stays.
  await page.mouse.move(viewport.x, viewport.y - 80);
  await page.mouse.down();
  await page.mouse.move(viewport.x, viewport.y + 60, { steps: 3 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  expect(await current(page)).toBe('kitchen');
});

test('arrows and swipe are switched off separately and remembered in this browser', async ({ page }) => {
  await enter(page);
  await button(page, 'Flechas').click();
  await expect(button(page, 'Flechas')).toHaveAttribute('aria-pressed', 'false');
  await expect(arrows(page)).toHaveCount(0);
  await button(page, 'Deslizar').click();
  // With swipe off a quick drag only pans: nothing travels. (Panning may still make the
  // space at the centre the current one, which is not a journey.)
  await page.evaluate(() => {
    const card = window.testHarness.card;
    const travel = card.travel;
    window.journeys = 0;
    card.travel = id => {
      window.journeys++;
      travel(id);
    };
  });
  const viewport = await centre(card(page).locator('.viewport'));
  await page.mouse.move(viewport.x, viewport.y - 80);
  await page.mouse.down();
  await page.mouse.move(viewport.x, viewport.y + 60, { steps: 3 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => window.journeys)).toBe(0);
  await page.reload();
  await page.waitForFunction(() => window.testHarnessReady);
  await button(page, 'Vista por espacio').click();
  await expect.poll(() => current(page)).toBe('office');
  await expect(button(page, 'Flechas')).toHaveAttribute('aria-pressed', 'false');
  await expect(button(page, 'Deslizar')).toHaveAttribute('aria-pressed', 'false');
  await expect(arrows(page)).toHaveCount(0);
});
