import { test, expect } from '@playwright/test';

const card = page => page.locator('homemanager-card');
const editor = page => card(page).locator('homemanager-editor');
const button = (page, name) => card(page).getByRole('button', { name, exact: true });
const draft = page => page.evaluate(() => window.testHarness.card.getDraftConfiguration());
const begin = async page => {
  await card(page).locator('.hm-menu > summary').click();
  await button(page, 'Editar plano').click();
  await expect(button(page, 'Guardar cambios')).toBeVisible();
};
/** Replaces the synthetic card with a V2 plan built from its own draft. */
const replace = async (page, change) => {
  await page.evaluate(change => {
    const configuration = window.testHarness.card.getDraftConfiguration();
    new Function('configuration', change)(configuration);
    window.testHarness.mutateRemote(dashboard => {
      dashboard.views[0].cards[0].configuration = configuration;
    });
  }, change);
  await page.reload();
  await page.waitForFunction(() => window.testHarnessReady);
};
const naked =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="10 20 1000 700"><rect x="20" y="30" width="980" height="680" fill="#f7f5ee" stroke="#415d51" stroke-width="5"/><path d="M480 30V710M480 360H1000" stroke="#415d51" stroke-width="5"/></svg>';
/** Drags a rectangle over a part of the plan (0 to 1) and names it. */
const draw = async (page, name, [x, y]) => {
  await expect(card(page).locator('.zones-draw')).toBeVisible();
  const at = (x, y) =>
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
  const from = await at(x, y),
    to = await at(x + 0.2, y + 0.2);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 4 });
  await page.mouse.up();
  await card(page).getByRole('textbox', { name: 'Nombre de la zona', exact: true }).fill(name);
};

test.beforeEach(async ({ page }) => {
  await page.goto('/tests/browser/fixtures/card.html');
  await page.waitForFunction(() => window.testHarnessReady);
});

test('a plan without zones offers to draw, and ends with three spaces drawn in the app', async ({ page }) => {
  await replace(
    page,
    `configuration.architecture.content = ${JSON.stringify(naked)};
     configuration.rooms = [];
     for (const device of configuration.catalog.devices) device.roomId = null;`,
  );
  await begin(page);
  const offer = page.getByRole('dialog', { name: 'Este plano no tiene zonas', exact: true });
  await expect(offer).toBeVisible();
  await offer.getByRole('button', { name: 'Dibujar el primero', exact: true }).click();
  await draw(page, 'Living', [0.05, 0.05]);
  await button(page, 'Nueva zona').click();
  await draw(page, 'Cocina', [0.4, 0.05]);
  await button(page, 'Nueva zona').click();
  await draw(page, 'Baño Norte', [0.05, 0.5]);
  await button(page, 'Aplicar').click();
  await expect(card(page).locator('.zones-bar')).toHaveCount(0);
  const rooms = (await draft(page)).rooms;
  expect(rooms.map(room => [room.id, room.label, room.shapeSource])).toEqual([
    ['living', 'Living', 'app'],
    ['cocina', 'Cocina', 'app'],
    ['bano-norte', 'Baño Norte', 'app'],
  ]);
  expect(rooms.every(room => room.shape.width > 0 && room.shape.x + room.shape.width <= 1)).toBe(true);
  expect(rooms.map(room => room.icon)).toEqual(['mdi:sofa', 'mdi:pot-steam', 'mdi:shower']);
  await expect(
    card(page).locator('.rooms').getByRole('button', { name: 'Encuadrar Baño Norte', exact: true }),
  ).toBeVisible();
});

test('importing a plan never changes a space drawn by hand unless that is chosen', async ({ page }) => {
  const drawn = { x: 0.6, y: 0.6, width: 0.2, height: 0.2 };
  await replace(
    page,
    `configuration.rooms.find(room => room.id === 'office').shape = ${JSON.stringify(drawn)};
     configuration.rooms.find(room => room.id === 'office').shapeSource = 'app';`,
  );
  await begin(page);
  const upload = async () => {
    await button(page, 'Ajustes del plano').click();
    await editor(page).locator('[data-settings="import-section"]').click();
    const svg = (await draft(page)).architecture.content;
    await editor(page)
      .getByLabel('Importar JSON o SVG', { exact: true })
      .setInputFiles({ name: 'same.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(svg) });
    return page.getByRole('dialog', { name: 'Revisar cambios', exact: true });
  };
  const office = () => draft(page).then(configuration => configuration.rooms.find(room => room.id === 'office'));
  let review = await upload();
  const choice = review.getByRole('checkbox', { name: /Usar la zona del plano/ });
  await expect(choice).not.toBeChecked();
  await review.getByRole('button', { name: 'Aplicar', exact: true }).click();
  expect(await office()).toMatchObject({ shape: drawn, shapeSource: 'app' });
  // The other spaces got a copy of their zone.
  expect((await draft(page)).rooms.find(room => room.id === 'kitchen').shapeSource).toBe('svg');
  await editor(page).getByRole('button', { name: 'Cerrar', exact: true }).click();
  review = await upload();
  await review.getByRole('checkbox', { name: /Usar la zona del plano/ }).check();
  await review.getByRole('button', { name: 'Aplicar', exact: true }).click();
  const taken = await office();
  expect(taken.shapeSource).toBe('svg');
  expect(taken.shape).not.toEqual(drawn);
});

test('plan settings list the spaces: reorder with the keyboard or by dragging, open one, or draw a new one', async ({
  page,
}) => {
  await begin(page);
  await button(page, 'Ajustes del plano').click();
  const settings = editor(page).getByRole('dialog', { name: 'Ajustes del plano' });
  const ids = async () => (await draft(page)).rooms.map(room => room.id);
  const first = (await draft(page)).rooms[0];
  await settings.getByRole('button', { name: `Mover ${first.label}: flechas arriba y abajo`, exact: true }).focus();
  await page.keyboard.press('ArrowDown');
  expect(await ids()).toEqual(['kitchen', 'living', 'office']);
  // Dragging the last grip to the top.
  const grips = settings.locator('[data-room-grip]');
  const last = await grips.nth(2).boundingBox();
  const top = await grips.nth(0).boundingBox();
  await page.mouse.move(last.x + last.width / 2, last.y + last.height / 2);
  await page.mouse.down();
  await page.mouse.move(top.x + top.width / 2, top.y + 2, { steps: 6 });
  await page.mouse.up();
  expect(await ids()).toEqual(['office', 'kitchen', 'living']);
  const office = (await draft(page)).rooms[0].label;
  await settings.getByRole('button', { name: `Editar ${office}`, exact: true }).click();
  await expect(editor(page).getByRole('dialog', { name: office, exact: true })).toBeVisible();
  await editor(page)
    .getByRole('dialog', { name: office, exact: true })
    .getByRole('button', { name: 'Cancelar', exact: true })
    .click();
  await settings.getByRole('button', { name: 'Editar zonas', exact: true }).click();
  await expect(settings).toHaveCount(0);
  await button(page, 'Nueva zona').click();
  await draw(page, 'Garaje', [0.02, 0.02]);
  await button(page, 'Aplicar').click();
  await expect(card(page).locator('.zones-bar')).toHaveCount(0);
  expect(await ids()).toEqual(['office', 'kitchen', 'living', 'garaje']);
});

test('an L-shaped zone of the SVG becomes two rectangles, and its hole belongs to the neighbour', async ({ page }) => {
  await begin(page);
  await button(page, 'Ajustes del plano').click();
  await editor(page).locator('[data-settings="import-section"]').click();
  // viewBox 10 20 1000 700. Living is an L: full left column, top right part. Office fills the hole.
  const plan =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="10 20 1000 700"><path id="room-living" d="M10 20H1010V370H510V720H10Z"/><rect id="room-office" x="510" y="370" width="500" height="350"/><rect id="room-kitchen" x="1009" y="719" width="1" height="1"/></svg>';
  await editor(page)
    .getByLabel('Importar JSON o SVG', { exact: true })
    .setInputFiles({ name: 'l.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(plan) });
  const review = page.getByRole('dialog', { name: 'Revisar cambios', exact: true });
  await review.getByRole('button', { name: 'Aplicar', exact: true }).click();
  const rooms = (await draft(page)).rooms;
  const living = rooms.find(room => room.id === 'living');
  expect(living.rects).toHaveLength(2);
  expect(living.shape).toEqual({ x: 0, y: 0, width: 1, height: 1 });
  expect(living.shapeSource).toBe('svg');
  // The sum of its parts is the L: three quarters of the plan.
  const area = living.rects.reduce((sum, rect) => sum + rect.width * rect.height, 0);
  expect(area).toBeGreaterThan(0.72);
  expect(area).toBeLessThan(0.78);
  // A plain zone has no parts.
  expect(rooms.find(room => room.id === 'office').rects).toBeUndefined();
});

test('a zone drawn as two rectangles is framed and highlighted as one, without a seam', async ({ page }) => {
  await replace(
    page,
    `const room = configuration.rooms.find(item => item.id === 'living');
     room.shape = { x: 0, y: 0, width: 0.5, height: 0.8 };
     room.rects = [{ x: 0, y: 0, width: 0.5, height: 0.4 }, { x: 0, y: 0.4, width: 0.25, height: 0.4 }];
     room.shapeSource = 'app';`,
  );
  const label = (await draft(page)).rooms.find(room => room.id === 'living').label;
  await card(page)
    .getByRole('button', { name: `Encuadrar ${label}`, exact: true })
    .click();
  const highlight = card(page).locator('.room-highlight');
  await expect(highlight).toHaveAttribute('data-room', 'living');
  // One outline: a single path, not a rectangle per part.
  await expect(highlight.locator('.room-contour path')).toHaveCount(1);
  await expect(highlight.locator('.room-contour rect')).toHaveCount(0);
});
