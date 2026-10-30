import { test, expect } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';
import { picker } from '../browser/device-picker-helpers.mjs';
const card = page => page.locator('homemanager-card');
const editor = page => card(page).locator('homemanager-editor');
async function start(page) {
  await page.goto('/tests/browser/fixtures/picker.html');
  await page.waitForFunction(() => window.pickerHarnessReady);
  await card(page).locator('.hm-menu > summary').click();
  await card(page).getByRole('button', { name: 'Editar plano', exact: true }).click();
  await card(page).getByRole('button', { name: 'Agregar dispositivo', exact: true }).click();
  await card(page).getByRole('button', { name: 'Desde Home Assistant', exact: true }).click();
}
async function cleanText(page) {
  const text = await picker(page).evaluate(host =>
    [...host.shadowRoot.querySelectorAll('*')]
      .filter(node => node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden')
      .flatMap(node =>
        [...node.childNodes]
          .filter(child => child.nodeType === Node.TEXT_NODE)
          .map(child => child.textContent)
          .concat(node instanceof HTMLInputElement && ['search', 'text'].includes(node.type) ? [node.value] : []),
      )
      .join(' '),
  );
  expect(text).not.toMatch(/_|\b[a-z][a-z0-9_]*\.[a-z0-9_]+\b/);
  return text;
}
test('device-first search groups 15 devices and 91 entities without technical visible text', async ({ page }) => {
  await start(page);
  const host = picker(page);
  await expect(host.getByRole('button', { name: /Medidor de energía/ })).toHaveCount(1);
  const counts = await page.evaluate(() => [
    Object.keys(window.testHarness.hass.devices).length,
    Object.keys(window.testHarness.hass.entities).length,
  ]);
  expect(counts).toEqual([15, 91]);
  await cleanText(page);
  await host.getByRole('searchbox').fill('fabricante especial');
  await expect(host.locator('[data-action=device]')).toHaveCount(1);
  await host.getByRole('searchbox').fill('modelo 12');
  await expect(host.locator('[data-action=device]')).toHaveCount(1);
  await host.getByRole('searchbox').fill('Cocina');
  await expect(host.getByRole('button', { name: /Medidor de energía/ })).toBeVisible();
  await host.getByRole('button', { name: /Medidor de energía/ }).click();
  await expect(host.getByRole('radio', { name: /Potencia total/ })).toBeChecked();
  await page.evaluate(() => {
    window.testHarness.hass.states['sensor.energy_meter_6ch_total_power'].state = '1.82';
    window.testHarness.card.hass = { ...window.testHarness.hass };
  });
  await expect(host.getByRole('radio', { name: /Potencia total/ })).toHaveAccessibleName(/1,82/);
  await cleanText(page);
  await host.locator('.k-fold > summary').click();
  const text = await cleanText(page);
  expect(text).toContain('Canal 6 · Potencia');
  expect(text).not.toContain('DO NOT SHOW');
  await host.getByRole('checkbox', { name: /Canal 1 · Potencia/ }).check();
  await host.getByRole('checkbox', { name: /Canal 2 · Potencia/ }).check();
  await host.getByRole('checkbox', { name: /Canal 3 · Potencia/ }).check();
  await expect(host.getByRole('checkbox', { name: /Canal 4 · Potencia/ })).toBeDisabled();
  await host.getByRole('button', { name: 'Vincular', exact: true }).click();
  const device = await page.evaluate(() =>
    window.testHarness.card
      .getDraftConfiguration()
      .catalog.devices.find(device => device.bindings.deviceId === 'meter-six'),
  );
  expect(device.bindings.readings).toHaveLength(3);
  expect(device.bindings.entityId).toBe('sensor.energy_meter_6ch_total_power');
  expect(device.state).toEqual({ value: 'unknown', confidence: 'unknown' });
});
test('legacy entity-only binding offers its registry device, preserves unsaved fields and warns on live membership loss', async ({
  page,
}) => {
  await start(page);
  await picker(page).getByRole('button', { name: 'Cancelar', exact: true }).click();
  await editor(page).getByRole('button', { name: 'Cerrar', exact: true }).click();
  await card(page).getByRole('button', { name: 'Temperatura Living', exact: true }).click();
  await editor(page).getByLabel('Nombre del dispositivo', { exact: true }).fill('Nombre sin guardar');
  await editor(page).getByRole('button', { name: 'Vincular dispositivo', exact: true }).click();
  await expect(picker(page).getByRole('dialog', { name: 'Sensor de ambiente', exact: true })).toBeVisible();
  await cleanText(page);
  await picker(page)
    .getByRole('checkbox', { name: /Humedad/ })
    .check();
  await picker(page).getByRole('button', { name: 'Vincular', exact: true }).click();
  await expect(editor(page).getByLabel('Nombre del dispositivo', { exact: true })).toHaveValue('Nombre sin guardar');
  expect(
    await editor(page)
      .locator('#device-form')
      .evaluate(form =>
        [...form.elements]
          .filter(field => field.validity && !field.validity.valid)
          .map(field => ({ name: field.name, value: field.value, message: field.validationMessage })),
      ),
  ).toEqual([]);
  await editor(page).getByRole('button', { name: 'Guardar dispositivo', exact: true }).click();
  const device = await page.evaluate(() =>
    window.testHarness.card
      .getDraftConfiguration()
      .catalog.devices.find(device => device.bindings.deviceId === 'device-2'),
  );
  expect(device.bindings.readings).toEqual(['sensor.synthetic_2_humidity']);
  await expect(card(page).locator('.marker').filter({ hasText: '23,4 °C · 52 %' })).toHaveCount(1);
  await page.evaluate(() => {
    const hass = window.testHarness.hass,
      id = 'sensor.synthetic_2_humidity';
    hass.states[id] = { ...hass.states[id], state: '55' };
    window.testHarness.card.hass = { ...hass };
  });
  await expect(card(page).locator('.marker').filter({ hasText: '23,4 °C · 55 %' })).toHaveCount(1);
  await card(page).getByRole('button', { name: 'Nombre sin guardar', exact: true }).click();
  await page.evaluate(() => {
    window.testHarness.hass.entities['sensor.synthetic_2_humidity'].device_id = 'device-3';
    window.testHarness.card.hass = { ...window.testHarness.hass };
  });
  await expect(editor(page).getByRole('alert')).toContainText('ya no pertenece');
  expect(
    await page.evaluate(() =>
      window.testHarness.card
        .getDraftConfiguration()
        .catalog.devices.find(device => device.bindings.deviceId === 'device-2'),
    ),
  ).toEqual(device);
});
test('advanced entity search is the only place showing identifiers and cancellation has no draft effect', async ({
  page,
}) => {
  await start(page);
  const before = await page.evaluate(() => window.testHarness.card.getDraftConfiguration());
  await cleanText(page);
  await picker(page).getByRole('button', { name: 'Buscar cualquier entidad', exact: true }).click();
  await picker(page).getByRole('searchbox').fill('energy_meter_6ch_channel_1_power');
  await expect(picker(page).getByText('sensor.energy_meter_6ch_channel_1_power', { exact: true })).toBeVisible();
  await picker(page).getByRole('button', { name: 'Volver', exact: true }).first().click();
  await cleanText(page);
  await picker(page).getByRole('button', { name: 'Cancelar', exact: true }).click();
  expect(await page.evaluate(() => window.testHarness.card.getDraftConfiguration())).toEqual(before);
});
test('selector visual evidence at exact desktop/mobile sizes, including dark mode and empty state', async ({
  page,
}, testInfo) => {
  const mobile = testInfo.project.name === 'mobile';
  await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 });
  await start(page);
  const dir = process.env.HM_CAPTURE_VISUALS === '1' ? 'docs/evidence/0.8-picker' : testInfo.outputPath('visuals');
  await mkdir(dir, { recursive: true });
  const shot = async name => {
    const path = `${dir}/${mobile ? 'mobile' : 'desktop'}-${name}.png`;
    await page.screenshot({ path, scale: 'css' });
    const png = await readFile(path);
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual(mobile ? [390, 844] : [1440, 900]);
  };
  await shot('devices');
  await cleanText(page);
  await picker(page)
    .getByRole('button', { name: /Medidor de energía/ })
    .click();
  await picker(page)
    .getByRole('checkbox', { name: /Canal 1 · Potencia/ })
    .check();
  await shot('readings');
  await cleanText(page);
  await picker(page).getByRole('button', { name: 'Vincular', exact: true }).click();
  const zone = await card(page).locator('#room-living').boundingBox();
  await page.mouse.click(zone.x + zone.width * 0.35, zone.y + zone.height * 0.55);
  await expect(card(page).locator('.placing-hint')).toBeHidden();
  if (await editor(page).getByRole('button', { name: 'Cerrar', exact: true }).isVisible())
    await editor(page).getByRole('button', { name: 'Cerrar', exact: true }).click();
  await shot('plan');
  await card(page).getByRole('button', { name: 'Medidor de energía', exact: true }).click();
  await editor(page).getByRole('button', { name: 'Cambiar dispositivo', exact: true }).scrollIntoViewIfNeeded();
  if (mobile)
    await card(page)
      .locator('.workspace > .editor')
      .evaluate(node => {
        node.scrollTop += 160;
      });
  await shot('binding');
  await editor(page).getByRole('button', { name: 'Cambiar dispositivo', exact: true }).click();
  await picker(page).getByRole('button', { name: 'Volver', exact: true }).click();
  await picker(page).getByRole('button', { name: 'Buscar cualquier entidad', exact: true }).click();
  await picker(page).getByRole('searchbox').fill('energy_meter_6ch_channel_1_power');
  await shot('advanced');
  await picker(page).getByRole('button', { name: 'Volver', exact: true }).first().click();
  await page.evaluate(() => {
    window.testHarness.hass.themes = { darkMode: true };
    window.testHarness.card.hass = { ...window.testHarness.hass };
  });
  await expect(picker(page)).toHaveAttribute('data-theme', 'dark');
  await expect
    .poll(() =>
      picker(page)
        .locator('.k-row')
        .first()
        .evaluate(node => getComputedStyle(node).backgroundColor),
    )
    .toBe('rgb(27, 34, 30)');
  await shot('dark');
  await picker(page).getByRole('searchbox').fill('No existe');
  await shot('empty');
  await page.goto('/docs/vision-mockup.html#s7');
  await page.locator('#s7').evaluate(node => node.scrollIntoView({ block: 'start' }));
  await shot('reference-devices');
  await page
    .locator('#s7 + .note + .screens > .screen')
    .nth(1)
    .evaluate(node => node.scrollIntoView({ block: 'start' }));
  await shot('reference-readings');
  await page.locator('#s6').evaluate(node => node.scrollIntoView({ block: 'start' }));
  await shot('reference-components');
});
