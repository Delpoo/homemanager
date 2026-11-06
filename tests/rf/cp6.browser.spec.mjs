import { showSection } from '../browser/shell-helpers.mjs';
import { test, expect } from '../browser/local-test.mjs';
import { mkdir, readFile } from 'node:fs/promises';
import { setup, ceiling } from '../browser/rf-helpers.mjs';
const rf = page => page.locator('homemanager-rf');

/** Scan composed visible text, selected option labels and editable values, not hidden API attributes. */
async function readable(host) {
  const text = await host.evaluate(host => {
    const values = [];
    const visit = root => {
      for (const node of root.querySelectorAll('*')) {
        if (
          !node.getClientRects().length ||
          getComputedStyle(node).visibility === 'hidden' ||
          node.closest('pre[data-yaml]')
        )
          continue;
        for (const child of node.childNodes) if (child.nodeType === Node.TEXT_NODE) values.push(child.textContent);
        if (node instanceof HTMLInputElement && ['text', 'search'].includes(node.type)) values.push(node.value);
        if (node instanceof HTMLSelectElement) values.push(...[...node.selectedOptions].map(option => option.text));
        if (node.shadowRoot) visit(node.shadowRoot);
      }
    };
    visit(host.shadowRoot);
    return values.join(' ');
  });
  expect(text).not.toMatch(
    /_|\b[a-z][a-z0-9_]*\.[a-z0-9_]+\b|\b(?:entity.?id|payload|protocolo|protocol|tramas?|frames?|kebab.case|substitutions|packages|nbits|pulse_us|wait_us|candidate_id|fingerprint)\b/i,
  );
}
async function home(page, dark, existing) {
  await page.evaluate(
    ({ dark, existing }) => {
      const { hass, card } = window.testHarness;
      const configuration = card.getConfiguration(),
        prior = hass.callWS.bind(hass);
      const summary = {
        home_id: 'casa-prueba',
        title: 'Casa de prueba',
        revision: 1,
        updated_at: new Date().toISOString(),
        plan_sha256: 'fictional',
        rooms: configuration.rooms.length,
        devices: configuration.catalog.devices.length,
      };
      hass.themes = { darkMode: dark };
      hass.callWS = async message =>
        message.type === 'homemanager/homes'
          ? { homes: existing ? [summary] : [] }
          : message.type === 'homemanager/home/get'
            ? { ...summary, configuration }
            : prior(message);
      const app = document.createElement('homemanager-app');
      document.querySelector('#mount').replaceChildren(app);
      app.hass = hass;
    },
    { dark, existing },
  );
  const app = page.locator('homemanager-app');
  if (existing) {
    // New home is in Settings › Homes since #70.
    await app.locator('homemanager-card .hm-tools [data-command=configuration]').click();
    await showSection(app.locator('homemanager-editor'), 'homes-section');
    await app.getByRole('button', { name: 'Nuevo hogar', exact: true }).click();
  }
  await expect(app.getByRole('textbox', { name: 'Nombre del hogar', exact: true })).toBeVisible();
  return app;
}

for (const dark of [false, true])
  test(`CP6 ${dark ? 'dark' : 'light'}: RF, learning, designer, dialogs and homes keep the shared design`, async ({
    page,
  }, info) => {
    test.setTimeout(90000);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize(
      info.project.name === 'mobile' ? { width: 390, height: 844 } : { width: 1440, height: 900 },
    );
    await page.goto(`/tests/browser/fixtures/rf-cp6.html?theme=${dark ? 'dark' : 'light'}`);
    await page.waitForFunction(() => window.cp6Ready);
    const folder = process.env.HM_CAPTURE_CP6 ? 'docs/evidence/0.9-cp6' : info.outputPath('visuals');
    await mkdir(folder, { recursive: true });
    const prefix = `${info.project.name}-${dark ? 'dark' : 'light'}`;
    const shot = async name => {
      const path = `${folder}/${prefix}-${name}.png`;
      await page.screenshot({ path, scale: 'css', animations: 'disabled' });
      const bytes = await readFile(path);
      expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual(
        info.project.name === 'mobile' ? [390, 844] : [1440, 900],
      );
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        info.project.name === 'mobile' ? 390 : 1440,
      );
    };
    await expect(rf(page).locator('[data-open=techo]')).toBeVisible();
    await readable(rf(page));
    await shot('list');
    await rf(page).getByRole('button', { name: 'Nuevo control', exact: true }).click();
    await expect(rf(page).getByRole('textbox', { name: 'Nombre', exact: true })).toBeVisible();
    // 0.13: names and kinds as symbols, nothing to explain.
    await expect(rf(page).locator('.k-field-title homemanager-help-tip')).toHaveCount(0);
    await readable(rf(page));
    await shot('new');
    await rf(page).getByRole('button', { name: 'Volver', exact: true }).click();
    await rf(page).locator('[data-open=techo]').click();
    await readable(rf(page));
    await shot('remote');
    await rf(page).locator('homemanager-rf-remote').getByRole('button', { name: 'Apagar', exact: true }).click();
    await expect(rf(page).getByText('Enviado: Apagar', { exact: true })).toBeVisible();
    await expect(rf(page).getByText('confirmado', { exact: true })).toHaveCount(0);
    await rf(page).getByRole('button', { name: 'Aprender botones', exact: true }).click();
    await rf(page).getByRole('button', { name: 'Modo libre', exact: true }).click();
    const learn = rf(page).locator('homemanager-rf-learn');
    await expect(learn.getByText('Pulsá un botón del control', { exact: true })).toBeVisible();
    await readable(rf(page));
    await shot('learn');
    await page.evaluate(() =>
      window.rfServer.heard({ frames: 3, burst_frames: 3, confirmed: true, confirmed_by: 'frames' }),
    );
    await expect(learn.getByText('Señal reconocida', { exact: true })).toBeVisible();
    await readable(rf(page));
    await shot('candidate');
    await learn.locator('summary').click();
    await readable(rf(page));
    await learn.getByLabel('Nombre del botón').fill('Temporizador');
    await learn.getByRole('button', { name: 'Probar', exact: true }).click();
    await expect(learn.getByText('¿El equipo reaccionó?', { exact: true })).toBeVisible();
    await readable(rf(page));
    await shot('trial');
    await learn.getByRole('button', { name: 'Listo', exact: true }).click();
    await rf(page).getByRole('button', { name: 'Diseñar', exact: true }).click();
    await readable(rf(page));
    await shot('designer');
    // 0.13: pieces are added from the designer's panel; brands open their own row.
    const designer = rf(page).locator('homemanager-control-designer');
    await designer.getByRole('button', { name: 'Marca', exact: true }).click();
    await expect(designer.getByRole('group', { name: 'Marca' })).toBeVisible();
    await readable(rf(page));
    await shot('widget');
    await designer.getByRole('button', { name: 'Marca', exact: true }).click();
    await rf(page).locator('.dfoot [data-command=edit]').click();
    await rf(page).getByRole('button', { name: 'En Home Assistant', exact: true }).click();
    await rf(page).getByRole('button', { name: 'Agregar ventilador', exact: true }).click();
    await expect(rf(page).locator('.part')).toBeVisible();
    await rf(page)
      .locator('.part')
      .evaluate(node => node.scrollIntoView({ block: 'center' }));
    await readable(rf(page));
    await shot('roles');
    await rf(page).getByRole('button', { name: 'Volver', exact: true }).click();
    await rf(page).getByRole('button', { name: 'Emisor y ajustes', exact: true }).click();
    await rf(page)
      .locator('form.settings')
      .evaluate(node => node.scrollIntoView({ block: 'center' }));
    await readable(rf(page));
    await shot('settings');
    await expect(rf(page).locator('form.settings .k-field-title homemanager-help-tip')).toHaveCount(1);
    await rf(page).getByRole('button', { name: 'Volver', exact: true }).click();
    const configBefore = await page.evaluate(() => structuredClone(window.rfServer.library));
    await rf(page).getByRole('button', { name: 'Eliminar control', exact: true }).click();
    const confirm = rf(page).getByRole('dialog');
    await expect(confirm).toBeVisible();
    await expect(confirm.locator('.solid-danger')).toBeVisible();
    await readable(rf(page));
    await shot('confirm');
    await confirm.getByRole('button', { name: 'Cancelar', exact: true }).click();
    expect(await page.evaluate(() => window.rfServer.library)).toEqual(configBefore);
    await rf(page).getByRole('button', { name: 'Volver', exact: true }).click();
    await rf(page).getByRole('button', { name: 'Equipos RF', exact: true }).click();
    const devices = rf(page).locator('homemanager-rf-devices');
    await expect(devices.getByText('Falta el paquete', { exact: true })).toBeVisible();
    await readable(rf(page));
    await shot('devices');
    await devices
      .locator('[data-device=sensor_b]')
      .getByRole('button', { name: 'Cómo agregarlo', exact: true })
      .click();
    await expect(devices.locator('pre[data-yaml]')).toContainText('hm_rf_transmitter: rf_transmitter');
    await readable(rf(page));
    await shot('yaml');
    const app = await home(page, dark, true);
    await readable(app);
    await shot('new-home');
    const empty = await home(page, dark, false);
    await readable(empty);
    await shot('empty-home');
    await setup(page);
    await rf(page).evaluate((element, dark) => {
      element.hass = { ...window.testHarness.hass, themes: { darkMode: dark } };
    }, dark);
    await readable(rf(page));
    await shot('empty');
    await page.goto('/docs/vision-mockup.html');
    if (dark)
      await page
        .locator('.app,.pane,.k-dialog')
        .evaluateAll(nodes => nodes.forEach(node => node.classList.add('dark')));
    for (const [id, name] of [
      ['s6', 'reference-components'],
      ['s10', 'reference-rf'],
      ['s11', 'reference-dialogs'],
    ]) {
      const reference =
        id === 's6' && info.project.name === 'mobile'
          ? page.locator(dark ? '.kit-pane.dark' : '.kit-pane:not(.dark)')
          : page.locator(`#${id}`);
      await reference.evaluate(node => node.scrollIntoView({ block: 'start' }));
      await shot(name);
    }
  });

test('readable RF fields preserve stored names when only an icon or role changes', async ({ page }) => {
  await setup(page, {
    remotes: [
      ceiling({
        name: 'Techo_azul',
        buttons: [{ id: 'off', name: 'Apagar_luz', icon: null, fingerprint: 'abcd1234' }],
        parts: [{ id: 'fan', kind: 'fan', name: 'Ventilador_del_techo', speeds: null, roles: {} }],
      }),
    ],
  });
  await rf(page).locator('[data-open=techo]').click();
  await readable(rf(page));
  const initial = await page.evaluate(() => structuredClone(window.rfServer.library));
  const picker = rf(page).locator('[data-button=off] homemanager-icon-picker');
  await picker.locator('.trigger').click();
  await picker.getByRole('searchbox').fill('power-off');
  await picker.getByRole('option', { name: 'power-off', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.rfServer.library[0].buttons[0].icon)).toBe('mdi:power-off');
  initial[0].buttons[0].icon = 'mdi:power-off';
  expect(await page.evaluate(() => window.rfServer.library)).toEqual(initial);
  expect(await page.evaluate(() => window.rfServer.library[0].buttons[0].name)).toBe('Apagar_luz');
  await rf(page).getByRole('button', { name: 'En Home Assistant', exact: true }).click();
  await rf(page).locator('[data-part=fan] [data-role=off]').selectOption('off');
  await expect.poll(() => page.evaluate(() => window.rfServer.library[0].parts[0].roles.off)).toBe('off');
  initial[0].parts[0].roles.off = 'off';
  expect(await page.evaluate(() => window.rfServer.library)).toEqual(initial);
  expect(await page.evaluate(() => window.rfServer.library[0].parts[0].name)).toBe('Ventilador_del_techo');
  expect(await page.evaluate(() => window.rfServer.library[0].name)).toBe('Techo_azul');
  await readable(rf(page));
});

test('RF follows the global theme choice and cancellation restores logical focus after rendering', async ({ page }) => {
  await page.goto('/tests/browser/fixtures/rf-cp6.html?theme=light');
  await page.waitForFunction(() => window.cp6Ready);
  const app = page.locator('homemanager-app');
  const initial = await page.evaluate(() => structuredClone(window.rfServer.library));
  // Appearance lives in Settings (#70); RF opens again from Settings › Controls.
  const choose = async value => {
    // Without a home yet, ⚙ opens the basic Settings: Appearance, RF and Storage.
    await app.locator('.hm-tools:visible [data-command=configuration]').click();
    const settings = app.getByRole('region', { name: 'Configuración', exact: true });
    await settings.locator('homemanager-theme-choice').getByRole('combobox').selectOption(value);
    await settings.getByRole('button', { name: 'Abrir controles RF', exact: true }).click();
  };
  const background = () =>
    rf(page)
      .locator('.panel')
      .evaluate(node => getComputedStyle(node).backgroundColor);
  await choose('dark');
  await expect.poll(background).toBe('rgb(27, 34, 30)');
  await app.evaluate(node => {
    node.hass = { ...window.testHarness.hass, themes: { darkMode: true } };
  });
  await choose('light');
  await expect.poll(background).toBe('rgb(255, 255, 255)');
  await choose('auto');
  await expect.poll(background).toBe('rgb(27, 34, 30)');
  await rf(page).locator('[data-open=techo]').click();
  const trigger = rf(page).getByRole('button', { name: 'Eliminar control', exact: true });
  await trigger.click();
  const dialog = rf(page).getByRole('dialog');
  const cancel = dialog.getByRole('button', { name: 'Cancelar', exact: true });
  await expect(cancel).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: 'Eliminar', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(cancel).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click();
  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(trigger).toBeFocused();
  expect(await page.evaluate(() => window.rfServer.library)).toEqual(initial);
});
