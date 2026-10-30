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
const draw = async (page, name) => {
  await expect(card(page).locator('.shape-box')).toBeVisible();
  await card(page).getByRole('textbox', { name: 'Nombre del espacio', exact: true }).fill(name);
  await button(page, 'Crear espacio').click();
  await expect(card(page).locator('.shape-box')).toHaveCount(0);
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
  // A space needs a name: without one, drawing goes on.
  await button(page, 'Crear espacio').click();
  await expect(card(page).locator('.shell > .status')).toContainText('Escribí el nombre');
  await expect(card(page).locator('.shape-box')).toBeVisible();
  await draw(page, 'Living');
  await button(page, 'Nuevo espacio').click();
  await draw(page, 'Cocina');
  await button(page, 'Nuevo espacio').click();
  await draw(page, 'Baño Eze');
  const rooms = (await draft(page)).rooms;
  expect(rooms.map(room => [room.id, room.label, room.shapeSource])).toEqual([
    ['living', 'Living', 'app'],
    ['cocina', 'Cocina', 'app'],
    ['bano-eze', 'Baño Eze', 'app'],
  ]);
  expect(rooms.every(room => room.shape.width > 0 && room.shape.x + room.shape.width <= 1)).toBe(true);
  expect(rooms.map(room => room.icon)).toEqual(['mdi:sofa', 'mdi:pot-steam', 'mdi:shower']);
  await expect(
    card(page).locator('.rooms').getByRole('button', { name: 'Encuadrar Baño Eze', exact: true }),
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
  await settings.getByRole('button', { name: 'Nuevo espacio', exact: true }).click();
  await expect(settings).toHaveCount(0);
  await draw(page, 'Garaje');
  expect(await ids()).toEqual(['office', 'kitchen', 'living', 'garaje']);
});
