// Plan 0.12, lote B (#70, #61, #90): settings, full screen and a visible edit mode.
import { test, expect } from '../browser/local-test.mjs';

const card = page => page.locator('homemanager-card');
const editor = page => card(page).locator('homemanager-editor');
const draft = page => page.evaluate(() => window.testHarness.card.getDraftConfiguration());
const backend = page => page.evaluate(() => window.testHarness.config.configuration);
const tool = (page, name) => card(page).locator('.hm-tools').getByRole('button', { name, exact: true });

test.beforeEach(async ({ page }) => {
  await page.goto('/tests/browser/fixtures/card.html');
  await page.waitForFunction(() => window.testHarnessReady);
});

test('the top bar has edit, full screen and settings, and no ⋮ menu (#70)', async ({ page }) => {
  await expect(card(page).locator('.hm-menu')).toHaveCount(0);
  for (const name of ['Editar plano', 'Pantalla completa', 'Configuración'])
    await expect(tool(page, name)).toBeVisible();
  await expect(card(page).getByText('Modo pared')).toHaveCount(0);
});

test('Settings is one page with one bar, grouped sections and Save only after a change (#70)', async ({
  page,
}, testInfo) => {
  await tool(page, 'Configuración').click();
  const screen = editor(page).locator('homemanager-task-screen.settings-dialog');
  await expect(screen.locator('.task-head h2')).toHaveText('Configuración');
  // No edit bar behind it and no second Save; 0.13: the plan stays in view beside it.
  await expect(card(page).locator('.editbar')).toBeHidden();
  await expect(card(page).locator('.viewport')).toBeVisible();
  const save = screen.getByRole('button', { name: 'Guardar', exact: true });
  await expect(save).toBeHidden();
  const nav = screen.locator('.settings-nav');
  for (const group of ['Mi casa', 'Pantallas', 'Reglas', 'Mantenimiento', 'Ayuda'])
    await expect(nav.getByRole('group', { name: group })).toBeVisible();
  // Duplicates are gone: one Rules, layers only under Appearance.
  await expect(nav.getByRole('button', { name: 'Reglas' })).toHaveCount(1);
  if (testInfo.project.name === 'mobile') {
    // Nothing scrolls sideways on a phone.
    const overflow = await screen.evaluate(node => node.scrollWidth - node.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  }
  await nav.locator('[data-settings="appearance-section"]').click();
  await expect(screen.locator('homemanager-layer-choice')).toBeVisible();
  await expect(screen.locator('#settings-title')).toHaveText('Apariencia');
  await nav.locator('[data-settings="rooms-section"]').click();
  // A change makes Save appear; leaving asks before discarding it.
  await page.evaluate(() => {
    const harness = window.testHarness;
    const next = structuredClone(harness.card.getDraftConfiguration());
    next.catalog.devices[0].display.label = 'Luz renombrada';
    harness.card.change(next);
  });
  await expect(save).toBeVisible();
  await screen.locator('.task-back').click();
  await card(page).getByRole('dialog').getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(screen).toBeVisible();
  await screen.locator('.task-back').click();
  await card(page).getByRole('dialog').getByRole('button', { name: 'Descartar cambios', exact: true }).click();
  await expect(screen).toBeHidden();
  // Back on the plan, out of edit mode, nothing saved.
  await expect(card(page).locator('.editor-wrap')).toBeHidden();
  expect((await backend(page)).catalog.devices[0].display.label).not.toBe('Luz renombrada');
});

test('without permission to edit, Settings offers Appearance and Help only (#70)', async ({ page }) => {
  await page.evaluate(() => {
    const { hass, card } = window.testHarness;
    hass.user.is_admin = false;
    card.hass = { ...hass };
  });
  await expect(tool(page, 'Editar plano')).toHaveCount(0);
  await tool(page, 'Configuración').click();
  const screen = card(page).getByRole('region', { name: 'Configuración' });
  await expect(screen.getByRole('heading', { name: 'Apariencia' })).toBeVisible();
  await expect(screen.getByRole('heading', { name: 'Ayuda' })).toBeVisible();
  await expect(screen.locator('homemanager-theme-choice')).toBeVisible();
});

test('full screen works even when the browser refuses it, and Escape leaves (#61)', async ({ page }) => {
  await page.evaluate(() => {
    Element.prototype.requestFullscreen = () => Promise.reject(new Error('Synthetic refusal'));
  });
  await tool(page, 'Pantalla completa').click();
  await expect(card(page)).toHaveAttribute('data-fullscreen', 'window');
  const box = await card(page).locator('.shell').boundingBox();
  const size = page.viewportSize();
  expect(Math.round(box.width)).toBe(size.width);
  expect(Math.round(box.height)).toBe(size.height);
  await expect(tool(page, 'Salir de pantalla completa')).toHaveAttribute('aria-pressed', 'true');
  await card(page).locator('.viewport').focus();
  await page.keyboard.press('Escape');
  await expect(card(page)).not.toHaveAttribute('data-fullscreen', /./);
  await tool(page, 'Pantalla completa').click();
  await tool(page, 'Salir de pantalla completa').click();
  await expect(card(page)).not.toHaveAttribute('data-fullscreen', /./);
});

test('native full screen is used when allowed and the old wall list survives a save (#61)', async ({ page }) => {
  await page.evaluate(() =>
    window.testHarness.mutateRemote(dashboard => {
      dashboard.views[0].cards[0].configuration.nowPanels = { wall: [] };
    }),
  );
  await page.reload();
  await page.waitForFunction(() => window.testHarnessReady);
  await tool(page, 'Pantalla completa').click();
  await expect(card(page)).toHaveAttribute('data-fullscreen', /native|window/);
  await tool(page, 'Salir de pantalla completa').click();
  await expect(card(page)).not.toHaveAttribute('data-fullscreen', /./);
  await tool(page, 'Editar plano').click();
  await page.evaluate(() => {
    const harness = window.testHarness;
    const next = structuredClone(harness.card.getDraftConfiguration());
    next.catalog.devices[0].display.label = 'Luz guardada';
    harness.card.change(next);
  });
  await card(page).getByRole('button', { name: 'Guardar cambios', exact: true }).click();
  await expect(card(page).getByRole('button', { name: 'Guardar cambios', exact: true })).toHaveAttribute(
    'data-dirty',
    'false',
  );
  expect((await backend(page)).nowPanels).toEqual({ wall: [] });
});

test('edit mode is amber with a strip that counts unsaved changes (#90)', async ({ page }) => {
  await tool(page, 'Editar plano').click();
  const strip = card(page).locator('.edit-title');
  await expect(strip).toContainText('Editando el plano');
  await expect(strip).toContainText('Todo guardado');
  const amber = await card(page)
    .locator('.editbar')
    .evaluate(node => getComputedStyle(node).borderBottomColor);
  expect(amber).not.toBe('rgba(0, 0, 0, 0)');
  await card(page).locator('[data-id="synthetic-light"] .primary').focus();
  await page.keyboard.press('ArrowRight');
  await expect(strip).toContainText('1 cambio sin guardar');
});

test('dragging lands on the grid, Alt moves freely, and the grid shows only while moving (#90)', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', 'a mouse drag; touch is covered below');
  await tool(page, 'Editar plano').click();
  const symbol = card(page).locator('[data-id="synthetic-light"] .primary');
  // Entering edit mode reframes the plan: let the camera settle first.
  await page.waitForTimeout(600);
  const drag = async (dx, dy, alt = false) => {
    const box = await symbol.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    if (alt) await page.keyboard.down('Alt');
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy, { steps: 6 });
    await expect(card(page).locator('.move-grid')).toBeVisible();
    await page.mouse.up();
    if (alt) await page.keyboard.up('Alt');
    await expect(card(page).locator('.move-grid')).toBeHidden();
    await page.waitForTimeout(600);
    return (await draft(page)).catalog.devices.find(d => d.id === 'synthetic-light').position;
  };
  const onGrid = value => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6;
  const snapped = await drag(37, 23);
  expect(onGrid(snapped.x) && onGrid(snapped.y)).toBe(true);
  const free = await drag(13.3, 7.7, true);
  expect(onGrid(free.x) && onGrid(free.y)).toBe(false);
});

test('on a touch screen a short tap selects and a press and hold moves (#90)', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'needs a touch screen');
  await tool(page, 'Editar plano').click();
  const symbol = card(page).locator('[data-id="synthetic-sensor"] .primary');
  const before = (await draft(page)).catalog.devices.find(d => d.id === 'synthetic-sensor').position;
  const cdp = await page.context().newCDPSession(page);
  const touch = async (type, x, y) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  const box = await symbol.boundingBox();
  const x = box.x + box.width / 2,
    y = box.y + box.height / 2;
  // A quick swipe that starts on the symbol pans the plan; the symbol stays.
  await touch('touchStart', x, y);
  await touch('touchMove', x + 40, y + 10);
  await touch('touchMove', x + 60, y + 20);
  await touch('touchEnd');
  expect((await draft(page)).catalog.devices.find(d => d.id === 'synthetic-sensor').position).toEqual(before);
  // Press, wait, then drag: it moves.
  const again = await symbol.boundingBox();
  const ax = again.x + again.width / 2,
    ay = again.y + again.height / 2;
  await touch('touchStart', ax, ay);
  await page.waitForTimeout(550);
  await touch('touchMove', ax - 30, ay - 20);
  await touch('touchMove', ax - 60, ay - 40);
  await touch('touchEnd');
  const after = (await draft(page)).catalog.devices.find(d => d.id === 'synthetic-sensor').position;
  expect(after).not.toEqual(before);
});
