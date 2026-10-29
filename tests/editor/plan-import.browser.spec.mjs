import { test, expect } from '@playwright/test';
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
  await editor(page)
    .locator('#import-section')
    .evaluate(node => (node.open = true));
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
  const review = page.getByRole('dialog', { name: 'Revisar cambios', exact: true });
  await expect(review).toBeVisible();
  await expect(review.locator('[data-orphan]')).toHaveCount(3);
  for (const select of await review.locator('[data-orphan]').all()) await expect(select).toHaveValue('merge:joined');
  await expect(review.locator('[data-zone]')).toBeChecked();
  await review.getByRole('button', { name: 'Aplicar', exact: true }).click();
  expect((await draft(page)).rooms).toEqual([{ id: 'joined', label: 'Estudio unido' }]);
  expect((await draft(page)).catalog.devices.every(device => device.roomId === 'joined')).toBe(true);
  await editor(page).getByRole('button', { name: 'Cerrar', exact: true }).click();
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
  await editor(page).getByRole('button', { name: 'Cerrar', exact: true }).click();
  await card(page).getByRole('button', { name: 'Guardar cambios', exact: true }).click();
  await expect(card(page).getByRole('button', { name: 'Guardar cambios', exact: true })).toBeDisabled();
  await card(page).getByRole('button', { name: 'Salir de edición', exact: true }).click();
  await begin(page);
  await settings(page);
  await editor(page)
    .locator('#rooms-section')
    .evaluate(node => (node.open = true));
  await editor(page).getByRole('button', { name: 'Revisar espacios con el plano', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Revisar cambios', exact: true })).toBeVisible();
  await page
    .getByRole('dialog', { name: 'Revisar cambios', exact: true })
    .getByRole('button', { name: 'Aplicar', exact: true })
    .click();
  expect((await draft(page)).rooms.map(room => room.id)).toEqual(['joined']);
});

test('conflict-free plan imports directly and ambiguous or outside devices keep their room', async ({ page }) => {
  const original = await draft(page);
  await upload(page, original.architecture.content);
  await expect(page.getByRole('dialog', { name: 'Revisar cambios', exact: true })).toHaveCount(0);
  const overlap =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="10 20 1000 700"><rect id="room-one" x="10" y="20" width="500" height="500"/><rect id="room-two" x="10" y="20" width="500" height="500"/></svg>';
  await editor(page)
    .getByLabel('Importar JSON o SVG', { exact: true })
    .setInputFiles({ name: 'overlap.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(overlap) });
  const review = page.getByRole('dialog', { name: 'Revisar cambios', exact: true });
  await expect(review.getByText('Dispositivos ambiguos: conservan su espacio', { exact: true })).toBeVisible();
  await expect(review.getByText('Fuera de zona: conservan su espacio', { exact: true })).toBeVisible();
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
  await editor(page).getByRole('button', { name: 'Guardar dispositivo', exact: true }).click();
  const after = (await draft(page)).catalog.devices.find(device => device.id === 'synthetic-fan');
  expect(after.roomId).toBe('living');
  expect(after.position).toEqual(before.position);
});

test('editing rail supports rename, merge and explicit unassignment on removal', async ({ page }) => {
  const labels = Object.fromEntries((await draft(page)).rooms.map(room => [room.id, room.label]));
  await card(page)
    .getByRole('button', { name: `Encuadrar ${labels.living}`, exact: true })
    .click();
  let dialog = page.getByRole('dialog', { name: labels.living, exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Nombre del espacio', { exact: true }).fill('Sala nueva');
  await dialog.getByLabel('Icono del espacio', { exact: true }).fill('mdi:sofa');
  await dialog.getByRole('button', { name: 'Aplicar', exact: true }).click();
  await expect(card(page).getByRole('button', { name: 'Encuadrar Sala nueva', exact: true })).toBeVisible();
  await card(page).getByRole('button', { name: 'Encuadrar Sala nueva', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Sala nueva', exact: true });
  await dialog.getByLabel('Fusionar en…', { exact: true }).selectOption('kitchen');
  await dialog.getByRole('button', { name: 'Fusionar', exact: true }).click();
  expect((await draft(page)).rooms.some(room => room.id === 'living')).toBe(false);
  await card(page)
    .getByRole('button', { name: `Encuadrar ${labels.kitchen}`, exact: true })
    .click();
  dialog = page.getByRole('dialog', { name: labels.kitchen, exact: true });
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
