import { test, expect } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';
const card = page => page.locator('homemanager-card');
const view = page => page.locator('homemanager-insights');
async function start(page) {
  await page.goto('/tests/browser/fixtures/device-screen.html');
  await page.waitForFunction(() => window.deviceScreenHarnessReady);
}
async function now(page) {
  const handle = view(page).getByRole('button', { name: 'Mostrar Ahora', exact: true });
  if ((await handle.isVisible()) && (await handle.getAttribute('aria-expanded')) === 'false') await handle.click();
}
async function openMeter(page) {
  await now(page);
  await view(page).locator('[data-action=device][data-key=power]').click();
  await expect(view(page).getByRole('heading', { name: 'Medidor de energía', exact: true })).toBeVisible();
}
async function cleanText(page) {
  const text = await card(page).evaluate(host => {
    const texts = [];
    function walk(root) {
      for (const node of root.querySelectorAll('*')) {
        if (
          !node.getClientRects().length ||
          getComputedStyle(node).visibility === 'hidden' ||
          node.closest('[data-advanced=true]')
        )
          continue;
        for (const child of node.childNodes) if (child.nodeType === Node.TEXT_NODE) texts.push(child.textContent);
        if (node.shadowRoot) walk(node.shadowRoot);
      }
    }
    walk(host.shadowRoot);
    return texts.join(' ');
  });
  expect(text).not.toMatch(/_|\b[a-z][a-z0-9_]*\.[a-z0-9_]+\b/);
  return text;
}
test('six-channel screen, live values, folds, admin link and readable text on desktop and phone', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await start(page);
  await cleanText(page);
  await openMeter(page);
  await expect(view(page).getByRole('rowheader')).toHaveCount(6);
  await expect(view(page).getByRole('cell', { name: '640 W', exact: true })).toHaveCount(1);
  await expect(view(page).getByRole('link', { name: 'Abrir en Home Assistant' })).toHaveAttribute(
    'href',
    '/config/devices/device/meter-six',
  );
  const bounds = await card(page).locator('.viewport').boundingBox(),
    panel = await view(page).boundingBox();
  if (info.project.name === 'desktop') expect(bounds.x + bounds.width).toBeLessThanOrEqual(panel.x + 1);
  else expect(panel.width).toBeLessThanOrEqual(390);
  await view(page).locator('summary').filter({ hasText: 'Diagnóstico' }).click();
  await cleanText(page);
  await page.evaluate(() => {
    const { hass, card } = window.testHarness;
    hass.states['sensor.energy_meter_6ch_total_power'].state = '2.15';
    hass.states['sensor.energy_meter_6ch_channel_6_power'].state = '50';
    card.hass = { ...hass };
  });
  await expect(view(page).locator('.device-value strong').first()).toHaveText('2,15 kW');
  await expect(view(page).getByRole('cell', { name: '50 W', exact: true })).toHaveCount(1);
  await expect(view(page).locator('details').filter({ hasText: 'Diagnóstico' })).toHaveAttribute('open', '');
  await cleanText(page);
  await page.evaluate(() => {
    const { hass, card } = window.testHarness;
    hass.user = { id: 'synthetic-viewer', is_admin: false };
    card.hass = { ...hass };
  });
  await expect(view(page).getByRole('link', { name: 'Abrir en Home Assistant' })).toHaveCount(0);
  expect(errors).toEqual([]);
});
test('symbols open sensor, equipment and infrastructure screens; actuator tap preserves D18', async ({ page }) => {
  await start(page);
  await card(page).getByRole('button', { name: 'Sensor de ambiente', exact: true }).click();
  await expect(view(page).getByRole('heading', { name: 'Sensor de ambiente', exact: true })).toBeVisible();
  await view(page).getByRole('button', { name: 'Cerrar', exact: true }).click();
  await card(page).getByRole('button', { name: 'Encuadrar Dormitorio', exact: true }).click();
  await card(page).getByRole('button', { name: 'Aire Dormitorio', exact: true }).click();
  await expect(view(page).getByRole('heading', { name: 'Aire Dormitorio', exact: true })).toBeVisible();
  await view(page).getByRole('button', { name: 'Cerrar', exact: true }).click();
  await card(page).getByRole('button', { name: 'Infraestructura', exact: true }).click();
  await card(page).getByRole('button', { name: 'Encuadrar Balcón', exact: true }).click();
  await card(page).getByRole('button', { name: 'Puente de prueba', exact: true }).click();
  await expect(view(page).getByRole('heading', { name: 'Puente de prueba', exact: true })).toBeVisible();
  await view(page).getByRole('button', { name: 'Cerrar', exact: true }).click();
  await card(page).getByRole('button', { name: 'Encuadrar Living', exact: true }).click();
  await card(page).getByRole('button', { name: 'Luz Living', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.testHarness.calls.length)).toBe(1);
  await expect(view(page).getByRole('heading', { name: 'Luz Living', exact: true })).toHaveCount(0);
});
test('climate controls send supported commands and keep the measured setpoint until a fresh state arrives', async ({
  page,
}) => {
  await start(page);
  await card(page).getByRole('button', { name: 'Encuadrar Dormitorio', exact: true }).click();
  await card(page).getByRole('button', { name: 'Aire Dormitorio', exact: true }).click();
  await expect(view(page).locator('.device-stepper output')).toHaveText('22°C');
  for (const mode of ['Frío', 'Calor', 'Seco', 'Ventilar'])
    await expect(view(page).getByRole('button', { name: mode, exact: true })).toBeVisible();
  await view(page).getByRole('button', { name: 'Subir temperatura', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.testHarness.calls.at(-1)))
    .toMatchObject({ domain: 'climate', service: 'set_temperature', data: { temperature: 22.5 } });
  await expect(view(page).locator('.device-stepper output')).toHaveText('22°C');
  await expect(view(page).locator('.insights-feedback')).toContainText('Enviado');
  await view(page).getByRole('button', { name: 'Calor', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.testHarness.calls.at(-1)))
    .toMatchObject({ service: 'set_hvac_mode', data: { hvac_mode: 'heat' } });
  await page.evaluate(() => {
    const { hass, card } = window.testHarness;
    hass.states['climate.synthetic_air'].attributes.temperature = 22.5;
    hass.states['climate.synthetic_air'].last_updated = new Date().toISOString();
    card.hass = { ...hass };
  });
  await expect(view(page).locator('.device-stepper output')).toHaveText('22.5°C');
  await cleanText(page);
});
test('Ahora filters rooms, hides empty sections and quick-off never claims confirmation', async ({ page }) => {
  await start(page);
  await now(page);
  await expect(view(page).getByRole('heading', { name: 'Alertas', exact: true })).toBeVisible();
  await expect(view(page).getByRole('heading', { name: 'Clima', exact: true })).toBeVisible();
  await view(page).getByRole('button', { name: 'Apagar Luz Living', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.testHarness.calls.at(-1)))
    .toMatchObject({ domain: 'light', service: 'turn_off' });
  await expect(view(page).getByRole('button', { name: 'Apagar Luz Living', exact: true })).toBeVisible();
  await expect(view(page).locator('.insights-feedback')).toContainText('Enviado');
  await card(page).getByRole('button', { name: 'Encuadrar Living', exact: true }).click();
  await expect(view(page).getByRole('heading', { name: 'Alertas', exact: true })).toHaveCount(0);
  await expect(view(page).getByRole('heading', { name: 'Energía', exact: true })).toHaveCount(0);
  await cleanText(page);
  await card(page).getByRole('button', { name: 'Encuadrar Entrada', exact: true }).click();
  await expect(view(page).locator('.k-group-section')).toHaveCount(0);
});
test('Light, Dark and Auto persist across reloads and override/follow HA across surfaces', async ({ page }) => {
  await start(page);
  const menu = card(page).locator('.hm-menu > summary');
  await menu.click();
  const theme = page.locator('homemanager-theme-choice').getByRole('combobox', { name: 'Apariencia' });
  await expect(theme).toHaveValue('auto');
  await theme.selectOption('dark');
  const bg = () => view(page).evaluate(node => getComputedStyle(node).backgroundColor);
  await expect.poll(bg).toBe('rgb(27, 34, 30)');
  await page.evaluate(() => {
    const { hass, card } = window.testHarness;
    hass.themes.darkMode = false;
    card.hass = { ...hass };
  });
  await expect.poll(bg).toBe('rgb(27, 34, 30)');
  await page.reload();
  await page.waitForFunction(() => window.deviceScreenHarnessReady);
  await menu.click();
  await expect(theme).toHaveValue('dark');
  await theme.selectOption('light');
  await page.evaluate(() => {
    const { hass, card } = window.testHarness;
    hass.themes.darkMode = true;
    card.hass = { ...hass };
  });
  await expect.poll(bg).toBe('rgb(255, 255, 255)');
  await theme.selectOption('auto');
  await expect.poll(bg).toBe('rgb(27, 34, 30)');
  await page.evaluate(() => {
    const { hass, card } = window.testHarness;
    hass.themes.darkMode = false;
    card.hass = { ...hass };
  });
  await expect.poll(bg).toBe('rgb(255, 255, 255)');
  await theme.selectOption('dark');
  await card(page).getByRole('button', { name: 'Editar plano', exact: true }).click();
  await card(page).getByRole('button', { name: 'Sensor de ambiente', exact: true }).click();
  await page.getByRole('button', { name: 'Cambiar dispositivo', exact: true }).click();
  await expect
    .poll(() =>
      page
        .locator('homemanager-device-picker')
        .locator('.k-pane')
        .evaluate(node => getComputedStyle(node).backgroundColor),
    )
    .toBe('rgb(18, 23, 20)');
});
test('mobile sheet slides from its handle and closes with Escape, with visible text free of identifiers', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'mobile', 'Touch sheet only');
  await start(page);
  const handle = view(page).getByRole('button', { name: 'Mostrar Ahora', exact: true });
  const box = await handle.boundingBox();
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: box.x + box.width / 2, y: box.y + 20 }],
  });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: box.x + box.width / 2, y: box.y - 70 }],
  });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(handle).toHaveAttribute('aria-expanded', 'true');
  await cleanText(page);
  await handle.press('Escape');
  await expect(handle).toHaveAttribute('aria-expanded', 'false');
});
test('theme selection remains usable when preference storage is denied, including keyboard input', async ({ page }) => {
  await page.addInitScript(() => {
    const get = Storage.prototype.getItem,
      set = Storage.prototype.setItem;
    Storage.prototype.getItem = function (key) {
      if (key === 'homemanager-ui-theme') throw new DOMException('Denied', 'SecurityError');
      return get.call(this, key);
    };
    Storage.prototype.setItem = function (key, value) {
      if (key === 'homemanager-ui-theme') throw new DOMException('Denied', 'SecurityError');
      return set.call(this, key, value);
    };
  });
  await start(page);
  await card(page).locator('.hm-menu > summary').click();
  const field = page.locator('homemanager-theme-choice').getByRole('combobox', { name: 'Apariencia' });
  await field.focus();
  await field.press('ArrowDown');
  await expect(field).toHaveValue('light');
  await field.press('ArrowDown');
  await expect(field).toHaveValue('dark');
  await expect.poll(() => view(page).evaluate(node => getComputedStyle(node).backgroundColor)).toBe('rgb(27, 34, 30)');
});

test('a device screen preserves configured panel actions from an older plan', async ({ page }) => {
  await start(page);
  await page.evaluate(() => {
    const { card, hass } = window.testHarness,
      configuration = card.getConfiguration();
    configuration.catalog.devices.find(device => device.id === 'power').bindings.advancedPopupId = 'legacy-meter';
    configuration.panels['legacy-meter'] = {
      kind: 'device-controls',
      title: 'Panel anterior',
      controls: [{ id: 'legacy', label: 'Acción anterior', actionId: 'synthetic-fan-command' }],
    };
    card.setConfig({
      type: 'custom:homemanager-card',
      card_id: 'legacy-actions',
      dashboard_mode: 'storage',
      configuration,
    });
    card.hass = { ...hass };
  });
  await openMeter(page);
  await view(page).getByRole('button', { name: 'Acción anterior', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.testHarness.calls.at(-1)))
    .toMatchObject({ domain: 'script', service: 'turn_on', target: { entity_id: 'script.synthetic_fan' } });
  await cleanText(page);
});

test('a narrow Lovelace card uses a sheet even inside a wide desktop window', async ({ page }) => {
  await start(page);
  await card(page).evaluate(node => {
    node.style.maxWidth = '500px';
  });
  await expect(view(page).getByRole('button', { name: 'Mostrar Ahora', exact: true })).toBeVisible();
  const bounds = await card(page).boundingBox(),
    plan = await card(page).locator('.viewport').boundingBox();
  expect(plan.width).toBeGreaterThan(bounds.width - 6);
  await openMeter(page);
  await cleanText(page);
  const panel = await view(page).boundingBox();
  expect(panel.width).toBeLessThanOrEqual(bounds.width);
});

test('evidence: every changed screen at 1440x900 / 390x844 alongside its mockup', async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize(
    info.project.name === 'mobile' ? { width: 390, height: 844 } : { width: 1440, height: 900 },
  );
  const folder = process.env.HM_CAPTURE_VISUALS ? 'docs/evidence/0.8-device-screen' : info.outputPath('visuals');
  await mkdir(folder, { recursive: true });
  const shot = async name => {
    const path = `${folder}/${info.project.name}-${name}.png`;
    await page.screenshot({ path, scale: 'css', animations: 'disabled' });
    const bytes = await readFile(path);
    expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual(
      info.project.name === 'mobile' ? [390, 844] : [1440, 900],
    );
  };
  await start(page);
  await shot('plan');
  await now(page);
  await shot('now');
  await openMeter(page);
  await shot('meter');
  await view(page).getByRole('button', { name: 'Cerrar', exact: true }).click();
  await card(page).getByRole('button', { name: 'Encuadrar Dormitorio', exact: true }).click();
  await card(page).getByRole('button', { name: 'Aire Dormitorio', exact: true }).click();
  await shot('climate');
  await view(page).getByRole('button', { name: 'Cerrar', exact: true }).click();
  await card(page).getByRole('button', { name: 'Encuadrar Living', exact: true }).click();
  await card(page).getByRole('button', { name: 'Sensor de ambiente', exact: true }).click();
  await shot('sensor');
  await view(page).getByRole('button', { name: 'Cerrar', exact: true }).click();
  await card(page).getByRole('button', { name: 'Infraestructura', exact: true }).click();
  await card(page).getByRole('button', { name: 'Encuadrar Balcón', exact: true }).click();
  await card(page).getByRole('button', { name: 'Puente de prueba', exact: true }).click();
  await shot('infrastructure');
  await view(page).getByRole('button', { name: 'Cerrar', exact: true }).click();
  await card(page).getByRole('button', { name: 'Encuadrar todo', exact: true }).click();
  await card(page).locator('.hm-menu > summary').click();
  await page.locator('homemanager-theme-choice').getByRole('combobox', { name: 'Apariencia' }).selectOption('dark');
  await shot('appearance');
  await card(page).locator('.hm-menu > summary').click();
  await openMeter(page);
  await shot('meter-dark');
  await view(page).getByRole('button', { name: 'Cerrar', exact: true }).click();
  await now(page);
  await shot('now-dark');
  await view(page).locator('[data-action=device][data-key=leak]').click();
  await shot('alert');
  await view(page).getByRole('button', { name: 'Cerrar', exact: true }).click();
  await card(page).getByRole('button', { name: 'Encuadrar Entrada', exact: true }).click();
  await now(page);
  await shot('empty');
  await page.goto('/docs/vision-mockup.html#s8');
  if (info.project.name === 'mobile')
    await page
      .locator('#s8 ~ .phones .phone')
      .first()
      .evaluate(node => node.scrollIntoView({ block: 'start' }));
  else await page.locator('#s8').evaluate(node => node.scrollIntoView({ block: 'start' }));
  await shot('reference-device');
  await page.goto('/docs/vision-mockup.html#s1');
  if (info.project.name === 'mobile')
    await page.locator('#phone').evaluate(node => node.scrollIntoView({ block: 'start' }));
  else await page.locator('#s1').evaluate(node => node.scrollIntoView({ block: 'start' }));
  await shot('reference-now');
  await page.goto('/docs/vision-mockup.html#s6');
  await page.locator('#s6').evaluate(node => node.scrollIntoView({ block: 'start' }));
  await shot('reference-components');
});
