import { test, expect } from '@playwright/test';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { setup, ceiling } from '../browser/rf-helpers.mjs';

// All application modules and invented HA sessions are served by Playwright,
// so this suite also works on hosts whose test-server sockets are unavailable.
test.beforeEach(async ({ page }, info) => {
  await page.setViewportSize(
    info.project.name === 'mobile' ? { width: 390, height: 844 } : { width: 1440, height: 900 },
  );
  const root = process.cwd();
  await page.route('**/*', async route => {
    const relative = decodeURIComponent(new URL(route.request().url()).pathname).slice(1);
    const file = path.resolve(root, relative);
    if (!file.startsWith(root + path.sep) || !/^(tests\/browser\/fixtures\/|dist\/|docs\/rediseno\/)/.test(relative))
      return route.abort();
    try {
      await route.fulfill({
        status: 200,
        contentType:
          { '.html': 'text/html', '.js': 'text/javascript', '.svg': 'image/svg+xml' }[path.extname(file)] ??
          'application/octet-stream',
        body: await readFile(file),
      });
    } catch {
      await route.fulfill({ status: 404, body: 'Missing fictional fixture' });
    }
  });
});
const card = page => page.locator('homemanager-card');
const editor = page => card(page).locator('homemanager-editor');
const screen = (page, name) => page.getByRole('region', { name, exact: true });
async function begin(page, fixture = 'card') {
  await page.goto(`/tests/browser/fixtures/${fixture}.html`);
  await page.waitForFunction(() => window.testHarnessReady);
  await card(page).locator('.hm-menu > summary').click();
  await card(page).getByRole('button', { name: 'Editar plano', exact: true }).click();
}
async function settings(page) {
  await card(page).getByRole('button', { name: 'Ajustes del plano', exact: true }).click();
  await expect(screen(page, 'Ajustes del plano')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}
async function noOverflow(page) {
  const result = await page.evaluate(() => {
    const failures = [];
    const visit = root => {
      for (const element of root.querySelectorAll('*')) {
        if (element.shadowRoot) visit(element.shadowRoot);
        if (
          element.localName === 'homemanager-task-screen' &&
          element.hasAttribute('open') &&
          getComputedStyle(element).visibility !== 'hidden'
        ) {
          const box = element.getBoundingClientRect();
          if (box.left < -1 || box.right > innerWidth + 1 || element.scrollWidth > element.clientWidth + 1)
            failures.push(element.getAttribute('aria-label'));
          const host = element.getRootNode().host;
          if (host?.localName === 'homemanager-device-picker') {
            const dock = host.getRootNode().host.getBoundingClientRect();
            if (box.top < dock.top - 1 || box.bottom > dock.bottom + 1) failures.push('clipped-picker');
          }
          const body = element.querySelector('.task-body');
          if (body && body.scrollWidth > body.clientWidth + 1)
            failures.push('body:' + element.getAttribute('aria-label'));
        }
      }
    };
    visit(document);
    return failures;
  });
  expect(result).toEqual([]);
}

test('settings is a page; sections and Back keep fields without saving', async ({ page }) => {
  await begin(page);
  await settings(page);
  await editor(page).locator('[data-settings=actions-section]').click();
  const field = editor(page).locator('#action-form [name=actionId]');
  await field.fill('accion-pendiente');
  await editor(page).locator('[data-settings=rooms-section]').click();
  await editor(page).locator('[data-settings=actions-section]').click();
  await expect(field).toHaveValue('accion-pendiente');
  await screen(page, 'Ajustes del plano').locator('.task-back').click();
  await settings(page);
  await expect(field).toHaveValue('accion-pendiente');
  expect(
    await page.evaluate(() => window.testHarness.wsCalls.filter(call => call.type === 'lovelace/config/save').length),
  ).toBe(0);
  await noOverflow(page);
});

test('room form returns to settings, resumes its draft and confirms cancellation', async ({ page }) => {
  await begin(page);
  await settings(page);
  const label = await page.evaluate(
    () => window.testHarness.card.getDraftConfiguration().rooms.find(room => room.id === 'living').label,
  );
  await editor(page).locator('[data-command=room-open][data-room=living]').click();
  let room = screen(page, label);
  await room.getByLabel('Nombre del espacio', { exact: true }).fill('Nombre sin aplicar');
  await room.locator('.task-back').click();
  await expect(screen(page, 'Ajustes del plano')).toBeVisible();
  await editor(page).locator('[data-command=room-open][data-room=living]').click();
  room = screen(page, label);
  await expect(room.getByLabel('Nombre del espacio', { exact: true })).toHaveValue('Nombre sin aplicar');
  await room.getByLabel('Nombre del espacio', { exact: true }).fill('Otra edición');
  await room.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await page.getByRole('dialog').getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(room.getByLabel('Nombre del espacio', { exact: true })).toHaveValue('Otra edición');
  await noOverflow(page);
  await room.getByRole('button', { name: 'Aplicar', exact: true }).click();
  expect(
    await page.evaluate(
      () => window.testHarness.card.getDraftConfiguration().rooms.find(room => room.id === 'living').label,
    ),
  ).toBe('Otra edición');
});

test('linking uses the dock or mobile page and preserves search, readings and the symbol draft', async ({
  page,
}, info) => {
  await begin(page, 'picker');
  await card(page).getByRole('button', { name: 'Agregar dispositivo', exact: true }).click();
  await editor(page).getByRole('button', { name: 'Desde Home Assistant', exact: true }).click();
  const picker = page.locator('homemanager-device-picker');
  await picker.getByRole('searchbox').fill('Medidor');
  await picker.getByRole('button', { name: /Medidor de energía/ }).click();
  await picker.getByRole('checkbox', { name: /Canal 1 · Potencia/ }).check();
  await picker.locator('.task-back').click();
  await expect(picker.getByRole('searchbox')).toHaveValue('Medidor');
  await picker.getByRole('button', { name: /Medidor de energía/ }).click();
  await expect(picker.getByRole('checkbox', { name: /Canal 1 · Potencia/ })).toBeChecked();
  const box = await picker.boundingBox();
  expect(Math.abs(box.width - (info.project.name === 'desktop' ? 380 : 390))).toBeLessThanOrEqual(2);
  if (info.project.name === 'mobile') expect(box.height).toBeGreaterThan(450);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await noOverflow(page);
  await picker.getByRole('button', { name: 'Vincular', exact: true }).click();
  expect(
    await page.evaluate(
      () =>
        window.testHarness.card
          .getDraftConfiguration()
          .catalog.devices.find(device => device.bindings.deviceId === 'meter-six').bindings.readings,
    ),
  ).toContain('sensor.energy_meter_6ch_channel_1_power');
});

test('plan review preserves choices on Back and import is exactly one undo step', async ({ page }) => {
  await begin(page);
  const before = await page.evaluate(() => window.testHarness.card.getDraftConfiguration());
  await settings(page);
  await editor(page).locator('[data-settings=import-section]').click();
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="10 20 1000 700"><rect id="room-joined" x="10" y="20" width="1000" height="700"><title>Estudio unido</title></rect></svg>';
  const upload = () =>
    editor(page)
      .getByLabel('Importar JSON o SVG', { exact: true })
      .setInputFiles({ name: 'fictional.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(svg) });
  await upload();
  let review = screen(page, 'Revisar cambios');
  await expect(review).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const move = review.locator('[data-move]').first();
  await move.uncheck();
  const id = await move.getAttribute('data-move');
  await review.locator('.task-back').click();
  await upload();
  review = screen(page, 'Revisar cambios');
  await expect(review.locator(`[data-move="${id}"]`)).not.toBeChecked();
  await review.locator(`[data-move="${id}"]`).check();
  await noOverflow(page);
  await review.getByRole('button', { name: 'Aplicar', exact: true }).click();
  await screen(page, 'Ajustes del plano').locator('.task-back').click();
  await card(page).getByRole('button', { name: 'Deshacer', exact: true }).click();
  expect(await page.evaluate(() => window.testHarness.card.getDraftConfiguration())).toEqual(before);
});

test('help, activity, alert lists and overlapping symbols use task screens', async ({ page }) => {
  await begin(page, 'shell');
  for (const [method, title, args] of [
    ['info', 'HomeManager', []],
    ['chooseDevice', 'Dispositivos en este lugar', [['fan', 'lamp']]],
  ]) {
    await card(page).evaluate((node, { method, args }) => node[method](...args), { method, args });
    await expect(screen(page, title)).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await noOverflow(page);
    await screen(page, title).locator('.task-back').click();
  }
});

test('native controls replace the plan and Back restores the trigger', async ({ page }) => {
  await page.goto('/tests/browser/fixtures/card.html');
  await page.waitForFunction(() => window.testHarnessReady);
  const trigger = card(page).locator('[data-id=synthetic-light] .primary');
  await trigger.click({ button: 'right' });
  const native = page.locator('homemanager-panel');
  await expect(native.locator('homemanager-task-screen')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await noOverflow(page);
  await native.locator('.task-back').click();
  await expect(native).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test('RF element Back resumes its fields and only cancellation opens a dialog', async ({ page }) => {
  const rf = await setup(page, { remotes: [ceiling()] });
  await rf.locator('[data-open]').first().click();
  await rf.locator('[data-command=edit]').click();
  await rf.locator('[data-command=add-widget]').click();
  let widget = screen(page, 'Agregar elemento');
  await widget.locator('[name=widget-label]').fill('Etiqueta pendiente');
  await widget.locator('.task-back').click();
  await rf.locator('[data-command=add-widget]').click();
  widget = screen(page, 'Agregar elemento');
  await expect(widget.locator('[name=widget-label]')).toHaveValue('Etiqueta pendiente');
  await noOverflow(page);
  await widget.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(widget).toBeVisible();
});

test('leaving an edited plan asks before discarding and cancellation keeps the draft', async ({ page }) => {
  await begin(page, 'shell');
  await card(page).locator('[data-id=fan] .primary').click();
  await editor(page).locator('[name=label]').fill('Cambio sin guardar');
  await editor(page).getByRole('button', { name: 'Listo', exact: true }).click();
  await card(page).evaluate(node => {
    void node.toggleEdit();
  });
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(card(page).locator('[data-id=fan] .primary')).toHaveAttribute('aria-label', 'Cambio sin guardar');
});

test('learning Back keeps the candidate and button name; storage uses one explicit confirmation', async ({ page }) => {
  const rf = await setup(page, { remotes: [ceiling()] });
  await rf.locator('[data-open]').first().click();
  await rf.locator('[data-command=learn]').click();
  const learn = rf.locator('homemanager-rf-learn');
  await expect(learn.getByText('Pulsá un botón del control', { exact: true })).toBeVisible();
  await page.evaluate(() =>
    window.rfServer.heard({ frames: 3, burst_frames: 3, confirmed: true, confirmed_by: 'frames' }),
  );
  await expect(learn.getByText('Señal reconocida', { exact: true })).toBeVisible();
  await learn.getByLabel('Nombre del botón').fill('Nombre pendiente');
  await rf.locator('homemanager-task-screen.learning-page .task-back').click();
  await rf.locator('[data-command=learn]').click();
  await expect(learn.getByLabel('Nombre del botón')).toHaveValue('Nombre pendiente');
  await expect(learn.getByText(/Lista para aprender/)).toBeVisible();
  await expect(learn.getByRole('button', { name: 'Probar', exact: true })).toBeEnabled();
  await noOverflow(page);
  await page.evaluate(() => {
    const { hass } = window.testHarness;
    const prior = hass.callWS.bind(hass);
    window.purged = 0;
    hass.callWS = async message =>
      message.type === 'homemanager/homes'
        ? { homes: [] }
        : message.type === 'homemanager/storage/status'
          ? { bytes: 1024, retained_home_ids: window.purged ? [] : ['fictional-deleted'] }
          : message.type === 'homemanager/history/purge'
            ? (++window.purged, {})
            : prior(message);
    const app = document.createElement('homemanager-app');
    document.querySelector('#mount').replaceChildren(app);
    app.hass = hass;
    void app.openStorage();
  });
  const storage = screen(page, 'Almacenamiento');
  await expect(storage.getByText('fictional-deleted', { exact: false })).toBeVisible();
  await storage.getByRole('button', { name: 'Eliminar historial', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => window.purged)).toBe(0);
  await storage.getByRole('button', { name: 'Eliminar historial', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Eliminar', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.purged)).toBe(1);
  await noOverflow(page);
});

for (const dark of [false, true])
  test(`visual evidence ${dark ? 'dark' : 'light'}: converted screens at the requested sizes`, async ({
    page,
  }, info) => {
    test.setTimeout(90000);
    const directory = '.work/e02-captures';
    await mkdir(directory, { recursive: true });
    const theme = async () =>
      page.evaluate(dark => {
        const { hass, card } = window.testHarness;
        hass.themes = { darkMode: dark };
        card.hass = { ...hass };
      }, dark);
    const shot = async name => {
      if (name.startsWith('link-')) {
        const picker = page.locator('homemanager-device-picker');
        await expect(picker.locator('.task-head')).toBeVisible();
        await expect(picker.locator('.pane-body')).toBeVisible();
        if (name === 'link-devices')
          await expect(picker.getByRole('button', { name: /Medidor de energía/ })).toBeVisible();
      }
      if (name === 'review') await expect(editor(page).locator('homemanager-task-screen.plan-review')).toBeVisible();
      if (name === 'native') await expect(page.locator('homemanager-panel homemanager-task-screen')).toBeVisible();
      if (name === 'rf-learn') await expect(page.locator('homemanager-rf-learn')).toBeVisible();
      await noOverflow(page);
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await page.screenshot({ path: `${directory}/${info.project.name}-${dark ? 'dark' : 'light'}-${name}.png` });
    };
    await begin(page, 'picker');
    await theme();
    await settings(page);
    for (const section of ['rooms', 'connect', 'health', 'actions', 'panels', 'pending', 'import']) {
      await editor(page).locator(`[data-settings=${section}-section]`).click();
      await shot(`settings-${section}`);
    }
    await editor(page).locator('[data-settings=rooms-section]').click();
    await editor(page).locator('[data-command=room-open][data-room=living]').click();
    await shot('room');
    await editor(page).locator('homemanager-task-screen.room-actions .task-back').click();
    await screen(page, 'Ajustes del plano').locator('.task-back').click();
    await card(page).getByRole('button', { name: 'Agregar dispositivo', exact: true }).click();
    await shot('add');
    await editor(page).getByRole('button', { name: 'Desde Home Assistant', exact: true }).click();
    await shot('link-devices');
    const picker = page.locator('homemanager-device-picker');
    await picker.getByRole('button', { name: /Medidor de energía/ }).click();
    await shot('link-readings');
    await picker.locator('.task-back').click();
    await picker.getByRole('button', { name: 'Buscar cualquier entidad', exact: true }).click();
    await shot('link-advanced');
    await picker.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await editor(page).getByRole('button', { name: 'Cerrar', exact: true }).click();
    await card(page).getByRole('button', { name: 'Historial de actividad', exact: true }).click();
    await shot('activity');
    await screen(page, 'Historial de actividad').locator('.task-back').click();
    await card(page).evaluate(node => node.info());
    await shot('help');
    await screen(page, 'HomeManager').locator('.task-back').click();
    await page.evaluate(() => localStorage.clear());
    await begin(page);
    await theme();
    await settings(page);
    await editor(page).locator('[data-settings=import-section]').click();
    await editor(page)
      .getByLabel('Importar JSON o SVG', { exact: true })
      .setInputFiles({
        name: 'fictional.svg',
        mimeType: 'image/svg+xml',
        buffer: Buffer.from(
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="10 20 1000 700"><rect id="room-joined" x="10" y="20" width="1000" height="700"/></svg>',
        ),
      });
    await shot('review');
    await page.evaluate(() => localStorage.clear());
    await begin(page);
    await theme();
    await card(page).evaluate(node => {
      node.discard();
      node.editing = false;
      node.updateControls();
      node.showDetails('synthetic-light', node.root.querySelector('[data-id=synthetic-light] .primary'));
    });
    await shot('native');
    const rf = await setup(page, { remotes: [ceiling()] });
    await page.evaluate(dark => {
      window.testHarness.hass.themes = { darkMode: dark };
      document.querySelector('homemanager-rf').hass = window.testHarness.hass;
    }, dark);
    await rf.locator('[data-open]').first().click();
    await rf.locator('[data-command=edit]').click();
    await rf.locator('[data-command=add-widget]').click();
    await shot('rf-widget');
    await screen(page, 'Agregar elemento').locator('.task-back').click();
    await rf.locator('[data-command=edit]').click();
    await rf.locator('[data-command=learn]').click();
    await shot('rf-learn');
  });
