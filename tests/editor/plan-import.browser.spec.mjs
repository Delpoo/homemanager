import { test, expect } from '../browser/local-test.mjs';
const card = page => page.locator('homemanager-card');
const editor = page => card(page).locator('homemanager-editor');
const draft = page => page.evaluate(() => window.testHarness.card.getDraftConfiguration());
const merged =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="10 20 1000 700"><path id="room-joined" d="M10 20H1010V720H10Z" fill="#e1e9df"><title>Estudio unido</title></path></svg>';
async function begin(page) {
  await card(page).locator('.hm-menu > summary').click();
  await card(page).getByRole('button', { name: 'Editar plano', exact: true }).click();
  await expect(card(page).getByRole('button', { name: 'Guardar cambios', exact: true })).toBeVisible();
}
async function settings(page) {
  await card(page).getByRole('button', { name: 'Ajustes del plano', exact: true }).click();
}
async function upload(page, svg = merged) {
  await settings(page);
  await editor(page).locator('[data-settings="import-section"]').click();
  await editor(page)
    .getByLabel('Importar JSON o SVG', { exact: true })
    .setInputFiles({ name: 'synthetic.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(svg) });
}
test.beforeEach(async ({ page }) => {
  await page.goto('/tests/browser/fixtures/card.html');
  await page.waitForFunction(() => window.testHarnessReady);
  await begin(page);
});

test('three orphan zones are reviewed, merged atomically and restored exactly by one undo', async ({ page }) => {
  const before = await draft(page);
  await upload(page);
  const review = page.getByRole('region', { name: 'Revisar cambios', exact: true });
  await expect(review).toBeVisible();
  await expect(review.locator('[data-orphan]')).toHaveCount(3);
  for (const select of await review.locator('[data-orphan]').all()) await expect(select).toHaveValue('merge:joined');
  await expect(review.locator('[data-zone]')).toBeChecked();
  await review.getByRole('button', { name: 'Aplicar', exact: true }).click();
  // The zone is copied as the space's own shape (D22), so a later plan without it loses nothing.
  expect((await draft(page)).rooms).toEqual([
    { id: 'joined', label: 'Estudio unido', shape: { x: 0, y: 0, width: 1, height: 1 }, shapeSource: 'svg' },
  ]);
  expect((await draft(page)).catalog.devices.every(device => device.roomId === 'joined')).toBe(true);
  await editor(page)
    .getByRole('button', { name: /^(Cerrar|Volver)$/, exact: true })
    .click();
  await card(page).getByRole('button', { name: 'Deshacer', exact: true }).click();
  expect(await draft(page)).toEqual(before);
});

test('plan-only import can be reconciled later against the saved geometry without reimporting', async ({ page }) => {
  const before = await draft(page);
  await upload(page);
  await page.getByRole('button', { name: 'Importar sólo el plano', exact: true }).click();
  expect((await draft(page)).catalog.devices.map(device => device.roomId)).toEqual(
    before.catalog.devices.map(device => device.roomId),
  );
  await editor(page)
    .getByRole('button', { name: /^(Cerrar|Volver)$/, exact: true })
    .click();
  await card(page).getByRole('button', { name: 'Guardar cambios', exact: true }).click();
  await expect(card(page).getByRole('button', { name: 'Guardar cambios', exact: true })).toBeDisabled();
  await card(page).getByRole('button', { name: 'Salir de edición', exact: true }).click();
  await begin(page);
  await settings(page);
  await editor(page).locator('[data-settings="rooms-section"]').click();
  await editor(page).getByRole('button', { name: 'Revisar espacios con el plano', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Revisar cambios', exact: true })).toBeVisible();
  await page
    .getByRole('region', { name: 'Revisar cambios', exact: true })
    .getByRole('button', { name: 'Aplicar', exact: true })
    .click();
  expect((await draft(page)).rooms.map(room => room.id)).toEqual(['joined']);
});

test('conflict-free plan imports directly and ambiguous or outside devices keep their room', async ({ page }) => {
  const original = await draft(page);
  await upload(page, original.architecture.content);
  await expect(page.getByRole('region', { name: 'Revisar cambios', exact: true })).toHaveCount(0);
  const overlap =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="10 20 1000 700"><rect id="room-one" x="10" y="20" width="500" height="500"/><rect id="room-two" x="10" y="20" width="500" height="500"/></svg>';
  await editor(page)
    .getByLabel('Importar JSON o SVG', { exact: true })
    .setInputFiles({ name: 'overlap.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(overlap) });
  const review = page.getByRole('region', { name: 'Revisar cambios', exact: true });
  await expect(review.getByText('Dispositivos ambiguos: conservan su espacio', { exact: true })).toBeVisible();
  // The first import copied each zone as its space's shape (D22): a plan without those zones
  // leaves no space orphaned, and devices keep their room.
  await expect(review.locator('[data-orphan]')).toHaveCount(0);
  await review.getByRole('button', { name: 'Aplicar', exact: true }).click();
  expect((await draft(page)).catalog.devices.map(device => device.roomId)).toEqual(
    original.catalog.devices.map(device => device.roomId),
  );
});

test('fixed device room is editable while its coordinates remain locked', async ({ page }) => {
  const before = (await draft(page)).catalog.devices.find(device => device.id === 'synthetic-fan');
  await card(page).getByRole('button', { name: 'Ventilador de prueba', exact: true }).click();
  await expect(editor(page).getByLabel('Habitación del dispositivo', { exact: true })).toBeEnabled();
  await editor(page).getByLabel('Habitación del dispositivo', { exact: true }).selectOption('living');
  await editor(page)
    .locator('#device-options')
    .evaluate(node => (node.open = true));
  await expect(editor(page).getByLabel('Posición X', { exact: true })).toBeDisabled();
  await editor(page)
    .getByRole('button', { name: /^(Guardar dispositivo|Listo)$/, exact: true })
    .click();
  const after = (await draft(page)).catalog.devices.find(device => device.id === 'synthetic-fan');
  expect(after.roomId).toBe('living');
  expect(after.position).toEqual(before.position);
});

test('editing rail supports rename, merge and explicit unassignment on removal', async ({ page }) => {
  const labels = Object.fromEntries((await draft(page)).rooms.map(room => [room.id, room.label]));
  await card(page)
    .getByRole('button', { name: `Encuadrar ${labels.living}`, exact: true })
    .click();
  let dialog = page.getByRole('region', { name: labels.living, exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Nombre del espacio', { exact: true }).fill('Sala nueva');
  await dialog.getByRole('button', { name: 'Icono del espacio', exact: true }).click();
  await dialog.getByRole('searchbox', { name: 'Buscar icono' }).fill('sofa');
  await dialog.getByRole('option', { name: 'mdi:sofa', exact: true }).click();
  await dialog.getByRole('button', { name: 'Aplicar', exact: true }).click();
  expect((await draft(page)).rooms.find(room => room.id === 'living').icon).toBe('mdi:sofa');
  await expect(card(page).getByRole('button', { name: 'Encuadrar Sala nueva', exact: true })).toBeVisible();
  await card(page).getByRole('button', { name: 'Encuadrar Sala nueva', exact: true }).click();
  dialog = page.getByRole('region', { name: 'Sala nueva', exact: true });
  await dialog.getByLabel('Fusionar en…', { exact: true }).selectOption('kitchen');
  await dialog.getByRole('button', { name: 'Fusionar', exact: true }).click();
  expect((await draft(page)).rooms.some(room => room.id === 'living')).toBe(false);
  await card(page)
    .getByRole('button', { name: `Encuadrar ${labels.kitchen}`, exact: true })
    .click();
  dialog = page.getByRole('region', { name: labels.kitchen, exact: true });
  await dialog.getByRole('button', { name: 'Quitar', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Elegí fusionar');
  await dialog.getByLabel('Al quitar este espacio', { exact: true }).selectOption('unassign');
  await dialog.getByRole('button', { name: 'Quitar', exact: true }).click();
  expect(
    (await draft(page)).catalog.devices
      .filter(device => device.id !== 'synthetic-sensor')
      .every(device => device.roomId === null),
  ).toBe(true);
});

const split =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="10 20 1000 700"><path id="room-west" d="M10 20H510V720H10Z"><title>Oeste</title></path><path id="room-east" d="M510 20H1010V720H510Z"><title>Este</title></path></svg>';
async function splitLiving(page) {
  // The living room's devices fall on both sides of the new plan.
  await page.evaluate(() =>
    window.testHarness.mutateRemote(dashboard => {
      const devices = dashboard.views[0].cards[0].configuration.catalog.devices;
      devices.at(-1).roomId = 'living';
    }),
  );
  await page.reload();
  await page.waitForFunction(() => window.testHarnessReady);
  await begin(page);
}

test('a space emptied by individual moves is removed by default, never kept without a zone', async ({ page }) => {
  await splitLiving(page);
  await upload(page, split);
  const review = page.getByRole('region', { name: 'Revisar cambios', exact: true });
  const living = review.locator('[data-orphan="living"]');
  await expect(living).toHaveValue('remove');
  // Keeping one of its devices makes Quitar unavailable and falls back to keeping the space.
  await review.locator('[data-move]').first().uncheck();
  await expect(living).toHaveValue('keep');
  expect(await living.locator('option[value=remove]').evaluate(option => option.disabled)).toBe(true);
  await review.locator('[data-move]').first().check();
  await expect(living).toHaveValue('remove');
  await review.getByRole('button', { name: 'Aplicar', exact: true }).click();
  const after = await draft(page);
  expect(after.rooms.map(room => room.id).sort()).toEqual(['east', 'west']);
  expect(after.catalog.devices.every(device => ['east', 'west'].includes(device.roomId))).toBe(true);
});

test('settings surface plan conflicts outside the folded sections', async ({ page }) => {
  await upload(page);
  await page.getByRole('button', { name: 'Importar sólo el plano', exact: true }).click();
  const notice = editor(page).locator('.plan-conflicts');
  await expect(notice).toContainText('3 espacios sin zona y 1 zonas sin espacio');
  await notice.getByRole('button', { name: 'Revisar', exact: true }).click();
  const review = page.getByRole('region', { name: 'Revisar cambios', exact: true });
  await review.getByRole('button', { name: 'Aplicar', exact: true }).click();
  await expect(editor(page).locator('.plan-conflicts')).toHaveCount(0);
});

test('a zone with nothing in it is offered, but only becomes a space if chosen', async ({ page }) => {
  const before = await draft(page);
  // The plan keeps its zones and adds one that holds no device.
  const svg = before.architecture.content.replace(
    '</svg>',
    '<rect id="room-trastero" x="11" y="21" width="2" height="2"/></svg>',
  );
  await upload(page, svg);
  const review = page.getByRole('region', { name: 'Revisar cambios', exact: true });
  await expect(review.locator('[data-zone="trastero"]')).not.toBeChecked();
  await review.getByRole('button', { name: 'Aplicar', exact: true }).click();
  expect((await draft(page)).rooms.some(room => room.id === 'trastero')).toBe(false);
});
