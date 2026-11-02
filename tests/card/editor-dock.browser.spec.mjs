import { test, expect } from '../browser/local-test.mjs';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

// Serve the synthetic test application in-process: no external HA, network or server required.
test.beforeEach(async ({ page }) => {
  const root = process.cwd();
  await page.route('**/*', async route => {
    const relative = decodeURIComponent(new URL(route.request().url()).pathname).slice(1);
    const file = path.resolve(root, relative);
    if (!file.startsWith(root + path.sep) || !/^(tests\/browser\/fixtures\/|dist\/|\.work\/)/.test(relative))
      return route.abort();
    try {
      const contentType =
        { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' }[
          path.extname(file)
        ] || 'application/octet-stream';
      await route.fulfill({ status: 200, contentType, body: await readFile(file) });
    } catch {
      await route.fulfill({ status: 404, body: 'Missing synthetic fixture' });
    }
  });
  await page.goto('/tests/browser/fixtures/shell.html');
  await page.waitForFunction(() => window.shellHarnessReady);
});

test('dock opens and previews without saving, then reverts this device', async ({ page }, info) => {
  await page.setViewportSize(
    info.project.name === 'mobile' ? { width: 390, height: 844 } : { width: 1440, height: 900 },
  );
  const card = page.locator('homemanager-card');
  await card.locator('.hm-menu > summary').click();
  await card.getByRole('button', { name: 'Editar plano', exact: true }).click();
  await card.locator('[data-id=fan] .primary').click();
  const editor = card.locator('homemanager-editor');
  await expect(editor.locator('[name=label]')).toBeFocused();
  await editor.locator('[name=label]').fill('Ventilador cambiado');
  await expect(card.locator('[data-id=fan] .primary')).toHaveAttribute('aria-label', 'Ventilador cambiado');
  const result = await card.evaluate(node => ({
    dock: node.shadowRoot.querySelector('.workspace > .editor').getBoundingClientRect().toJSON(),
    viewport: node.viewport.getBoundingClientRect().toJSON(),
    ws: window.testHarness.wsCalls.filter(call => call.type === 'lovelace/config/save').length,
    height: document.documentElement.scrollHeight,
  }));
  expect(result.ws).toBe(0);
  expect(result.height).toBeLessThanOrEqual(900);
  if (info.project.name === 'desktop') {
    expect(result.dock.width).toBe(380);
    expect(result.viewport.right).toBeLessThanOrEqual(result.dock.left + 1);
  } else {
    expect(result.dock.height).toBeLessThanOrEqual(result.viewport.height * 0.55 + 1);
    const size = await editor.getByRole('button', { name: 'Grande', exact: true }).boundingBox();
    const footer = await editor.locator('.sheet-tools').boundingBox();
    expect(size.y + size.height).toBeLessThanOrEqual(footer.y);
    await editor.getByRole('button', { name: 'Ampliar ficha' }).click();
    await expect(editor.getByRole('button', { name: 'Reducir ficha' })).toBeVisible();
  }
  await editor.getByRole('button', { name: 'Deshacer cambios de este dispositivo' }).click();
  await expect(editor.locator('[name=label]')).toHaveValue('Ventilador Living');
  await expect(card.locator('[data-id=fan] .primary')).toHaveAttribute('aria-label', 'Ventilador Living');
  await page.keyboard.press('Escape');
  await expect(editor).toBeHidden();
});

async function edit(page, id = 'fan') {
  const card = page.locator('homemanager-card');
  await card.locator('.hm-menu > summary').click();
  await card.getByRole('button', { name: 'Editar plano', exact: true }).click();
  await card.locator(`[data-id=${id}] .primary`).click();
  return card.locator('homemanager-editor');
}

test('valid previews survive switching, undo together and discard without saving', async ({ page }) => {
  const editor = await edit(page);
  const card = page.locator('homemanager-card');
  await editor.locator('[name=label]').fill('Borrador sintético');
  await editor.getByRole('button', { name: 'Grande', exact: true }).click();
  await expect(card.locator('[data-id=fan]')).toHaveClass(/size-l/);
  await card.evaluate(node => node.select('lamp'));
  await editor.locator('[name=label]').fill('Otra luz');
  await card.evaluate(node => node.select('fan'));
  await expect(editor.locator('[name=label]')).toHaveValue('Borrador sintético');
  await editor.getByRole('button', { name: 'Deshacer cambios de este dispositivo' }).click();
  // Reopening starts a new device session; the other device's draft is kept.
  await expect(card.locator('[data-id=lamp] .primary')).toHaveAttribute('aria-label', 'Otra luz');
  await editor.locator('[name=label]').fill('Primero');
  await editor.locator('[name=label]').fill('Segundo');
  await card.getByRole('button', { name: 'Deshacer', exact: true }).click();
  await expect(editor.locator('[name=label]')).toHaveValue('Borrador sintético');
  await card.evaluate(node => node.discard());
  await expect(card.locator('[data-id=fan] .primary')).toHaveAttribute('aria-label', 'Ventilador Living');
  expect(
    await page.evaluate(() => window.testHarness.wsCalls.filter(call => call.type === 'lovelace/config/save').length),
  ).toBe(0);
});

test('advanced fields stay available and invalid drafts cannot overwrite the plan', async ({ page }) => {
  const editor = await edit(page);
  await editor.locator('details.advanced > summary').click();
  for (const name of ['id', 'mobility', 'x', 'y', 'panelId'])
    await expect(editor.locator(`[name=${name}]`)).toBeVisible();
  await editor.locator('[name=x]').fill('0.4');
  await expect
    .poll(() =>
      page
        .locator('homemanager-card')
        .evaluate(node => node.draft.catalog.devices.find(d => d.id === 'fan').position.x),
    )
    .toBe(0.4);
  await editor.locator('[name=label]').fill('');
  await page.locator('homemanager-card').evaluate(node => node.select('lamp'));
  await expect(editor.locator('[name=label]')).toHaveValue('');
  expect(await page.locator('homemanager-card').evaluate(node => node.selected)).toBe('fan');
  await editor.locator('[name=label]').fill('Nombre válido');
  await editor.getByRole('button', { name: 'Listo', exact: true }).click();
  await expect(editor).toBeHidden();
});

test('live controls, icons, category and HA updates retain the unsaved device', async ({ page }) => {
  const editor = await edit(page, 'lamp');
  const card = page.locator('homemanager-card');
  await editor.locator('#device-controls-section > summary').click();
  await expect(editor.locator('.ctl-host')).toBeVisible();
  await editor.getByRole('button', { name: 'Icono del dispositivo', exact: true }).click();
  await editor.getByRole('searchbox', { name: 'Buscar icono' }).fill('purificador');
  await editor.getByRole('option', { name: 'mdi:air-purifier', exact: true }).click();
  await expect
    .poll(() => card.evaluate(node => node.draft.catalog.devices.find(d => d.id === 'lamp').display.icon))
    .toBe('mdi:air-purifier');
  await editor.locator('[name=label]').fill('Nombre conservado');
  await card.evaluate(node => {
    window.testHarness.updateState('light.synthetic_light', 'off');
    node.hass = { ...window.testHarness.hass };
  });
  await expect(editor.locator('[name=label]')).toHaveValue('Nombre conservado');
  await editor.locator('#device-category > summary').click();
  await editor.getByRole('radio', { name: 'Medidor', exact: true }).check();
  await expect(editor.locator('.ctl-host')).toBeHidden();
  await expect(editor.getByRole('button', { name: 'Grande', exact: true })).toBeVisible();
  await editor.getByRole('button', { name: 'Grande', exact: true }).click();
  await expect(card.locator('[data-id=lamp]')).toHaveClass(/size-l/);
  expect(await page.evaluate(() => window.testHarness.calls.length)).toBe(0);
});

test('settings and fullscreen remain reachable while the dock is open', async ({ page }, info) => {
  test.skip(
    info.project.name === 'mobile',
    'Fullscreen API is checked in desktop Chrome; real phone remains an audit item.',
  );
  await edit(page);
  const card = page.locator('homemanager-card');
  await card.locator('.hm-menu > summary').click();
  await card.getByRole('button', { name: 'Pantalla completa', exact: true }).click();
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
  await expect(card.locator('homemanager-editor [name=label]')).toBeVisible();
  await page.evaluate(() => document.exitFullscreen());
  await card.getByRole('button', { name: 'Ajustes del plano', exact: true }).click();
  await expect(card.getByRole('region', { name: 'Ajustes del plano', exact: true })).toBeVisible();
});

test('selected marker stays centred through sidebar, resize and mobile expansion; visual evidence', async ({
  page,
}, info) => {
  const mobile = info.project.name === 'mobile';
  await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 });
  const editor = await edit(page);
  const card = page.locator('homemanager-card');
  const centred = async () => {
    const p = await card.evaluate(node => {
      const v = node.viewport.getBoundingClientRect();
      const s = node.shadowRoot.querySelector('.workspace > .editor').getBoundingClientRect();
      const d = node.shadowRoot.querySelector(`[data-id="${node.selected}"] .primary`).getBoundingClientRect();
      const bottom = s.left < v.right ? s.top : v.bottom;
      return {
        dx: Math.abs(d.x + d.width / 2 - (v.x + v.width / 2)),
        dy: Math.abs(d.y + d.height / 2 - (v.top + bottom) / 2),
        overflow: document.documentElement.scrollHeight - innerHeight,
      };
    });
    return Math.max(p.dx, p.dy, p.overflow);
  };
  await expect.poll(centred).toBeLessThan(3);
  const folder = process.env.HM_CAPTURE_E01 ? 'docs/evidence/rediseno-e01' : info.outputPath('visuals');
  await mkdir(folder, { recursive: true });
  for (const theme of ['light', 'dark']) {
    await card.evaluate((node, dark) => {
      const h = window.testHarness.hass;
      h.themes = { darkMode: dark };
      node.hass = { ...h };
    }, theme === 'dark');
    await page.screenshot({
      path: `${folder}/${info.project.name}-${theme}-ficha.png`,
      animations: 'disabled',
      scale: 'css',
    });
  }
  if (!mobile) {
    await page.setViewportSize({ width: 1278, height: 900 });
    await page.locator('#mount').evaluate(node => {
      node.style.width = '1012px';
      node.style.marginLeft = '256px';
    });
    await expect.poll(centred).toBeLessThan(3);
    await page.screenshot({ path: `${folder}/desktop-dark-sidebar.png`, animations: 'disabled', scale: 'css' });
  } else {
    await editor.getByRole('button', { name: 'Ampliar ficha' }).click();
    await expect.poll(centred).toBeLessThan(3);
    await page.screenshot({ path: `${folder}/mobile-dark-ampliada.png`, animations: 'disabled', scale: 'css' });
    await editor.getByRole('button', { name: 'Reducir ficha' }).click();
    const h = await editor.locator('.sheet-handle').boundingBox();
    await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
    await page.mouse.down();
    await page.mouse.move(h.x + h.width / 2, h.y - 80, { steps: 5 });
    await page.mouse.up();
    await expect(editor.getByRole('button', { name: 'Reducir ficha' })).toBeVisible();
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await card.evaluate(node => node.select('lamp'));
  await expect.poll(centred).toBeLessThan(3);
});
