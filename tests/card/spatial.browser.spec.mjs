import { openCardMenu } from '../browser/shell-helpers.mjs';
import { chooseAnyEntity } from '../browser/device-picker-helpers.mjs';
import { test, expect } from '@playwright/test';

// Spatial interaction and capability-aware panels, on the synthetic harness.
const fixture = '/tests/browser/fixtures/card.html';
const card = page => page.locator('homemanager-card');
const action = (page, label) => card(page).getByRole('button', { name: label, exact: true });
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.removeItem('homemanager-synthetic-dashboard'));
  await page.goto(fixture);
  await page.waitForFunction(() => window.testHarnessReady === true);
});
async function crowd(page) {
  // Four devices within a few pixels of each other at the overview zoom.
  await page.evaluate(() => {
    const config = structuredClone(window.testHarness.config);
    const base = config.configuration.catalog.devices[0];
    for (let i = 0; i < 3; i++)
      config.configuration.catalog.devices.push({
        ...structuredClone(base),
        id: `crowd-${i}`,
        position: { x: 0.25 + (i + 1) * 0.012, y: 0.33 + (i + 1) * 0.009 },
        display: { label: `Grupo ${i}`, icon: 'mdi:lightbulb' },
        bindings: { entityId: null, primaryAction: null, advancedPopupId: null },
      });
    window.testHarness.card.setConfig(config);
    window.testHarness.card.hass = window.testHarness.hass;
  });
}

test('overlapping devices are grouped and a tap frames them until they separate', async ({ page }) => {
  await crowd(page);
  const group = card(page).locator('.cluster');
  await expect(group).toHaveCount(1);
  await expect(group).toHaveText('4');
  await expect(group).toHaveAttribute('aria-label', /4 dispositivos: .*Luz de prueba/);
  await expect(action(page, 'Luz de prueba')).toBeHidden();
  await group.click();
  await expect(group).toHaveCount(0, { timeout: 3000 });
  await expect(action(page, 'Luz de prueba')).toBeVisible();
  await expect(action(page, 'Grupo 2')).toBeVisible();
  // Visible markers never overlap once separated.
  const boxes = await card(page)
    .locator('.marker:not([hidden]) .primary')
    .evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().toJSON()));
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i],
        b = boxes[j];
      expect(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top).toBe(true);
    }
});

test('framing a space highlights it and the choice is reflected in the chips', async ({ page }) => {
  await card(page).getByRole('button', { name: 'Encuadrar Espacio B', exact: true }).click();
  await expect(card(page).locator('.room-highlight')).toHaveCount(1);
  await expect(card(page).getByRole('button', { name: 'Encuadrar Espacio B', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await card(page).getByRole('button', { name: 'Encuadrar todo', exact: true }).click();
  await expect(card(page).locator('.room-highlight')).toHaveCount(0);
});

test('a long press opens the device panel without running its primary action', async ({ page }) => {
  const target = action(page, 'Luz de prueba');
  const box = await target.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(650);
  await page.mouse.up();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(await page.evaluate(() => window.testHarness.calls.length)).toBe(0);
});

test('panels show controls for the real capabilities and only report commands as sent', async ({ page }) => {
  await page.evaluate(() => {
    const { hass } = window.testHarness;
    hass.states['light.synthetic_light'] = {
      state: 'on',
      attributes: { friendly_name: 'Synthetic light', supported_color_modes: ['brightness'], brightness: 128 },
      last_updated: new Date().toISOString(),
    };
    window.testHarness.card.hass = { ...hass };
  });
  await card(page).getByRole('button', { name: 'Luz de prueba', exact: true }).click({ button: 'right' });
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('switch', { name: 'Encendido' })).toHaveAttribute('aria-checked', 'true');
  const brightness = dialog.getByRole('slider', { name: 'Brillo' });
  await expect(brightness).toHaveValue('50');
  // fill() on a range input fires input and change, like releasing the thumb.
  await brightness.fill('80');
  await expect
    .poll(() => page.evaluate(() => window.testHarness.calls.at(-1)))
    .toEqual({
      domain: 'light',
      service: 'turn_on',
      data: { brightness_pct: 80 },
      target: { entity_id: 'light.synthetic_light' },
    });
  // HA accepted the call; the state block must not claim a physical result.
  await expect(dialog.locator('.confidence')).toHaveText('Comando enviado');
  // The configured native actions remain available next to the derived controls.
  await expect(dialog.getByRole('button', { name: 'Alternar luz de prueba', exact: true })).toBeVisible();
});

test('a sensor without a primary action opens its device screen on tap', async ({ page }) => {
  await action(page, 'Temperatura de prueba').click();
  const screen = page.locator('homemanager-insights');
  await expect(screen.getByRole('heading', { name: 'Temperatura de prueba', exact: true })).toBeVisible();
  await expect(screen.locator('.device-value strong')).toHaveText('23 °C');
  expect(await page.evaluate(() => window.testHarness.calls.length)).toBe(0);
});

test('in edit mode a device added from an entity is placed by tapping the plan', async ({ page }) => {
  await openCardMenu(page);
  await card(page).getByRole('button', { name: 'Editar plano', exact: true }).click();
  await card(page).getByRole('button', { name: 'Agregar dispositivo', exact: true }).click();
  await card(page).getByRole('button', { name: 'Desde Home Assistant', exact: true }).click();
  await chooseAnyEntity(page, 'light.synthetic_spare', { adding: true });
  await expect(card(page).locator('.placing-hint')).toContainText('Tocá el plano para ubicar');
  await expect(card(page).locator('.placing-hint')).toBeInViewport();
  // A tap beside the drawing is ignored; a tap inside the second space places it there.
  const viewport = await card(page).locator('.viewport').boundingBox();
  await page.mouse.click(viewport.x + 8, viewport.y + viewport.height / 2);
  await expect(card(page).locator('.placing-hint')).toContainText('Tocá dentro del plano');
  const zone = await card(page).locator('#room-kitchen').boundingBox();
  await page.mouse.click(zone.x + zone.width * 0.9, zone.y + zone.height * 0.8);
  await expect(card(page).locator('.placing-hint')).toBeHidden();
  const device = await page.evaluate(() =>
    window.testHarness.card
      .getDraftConfiguration()
      .catalog.devices.find(item => item.bindings.entityId === 'light.synthetic_spare'),
  );
  expect(device.roomId).toBe('kitchen');
  expect(device.position.x).toBeGreaterThan(0.8);
  expect(device.position.y).toBeLessThan(0.45);
});

test('devices at the same spot are offered as a list instead of an endless zoom', async ({ page }) => {
  await page.evaluate(() => {
    const config = structuredClone(window.testHarness.config);
    const base = config.configuration.catalog.devices[0];
    config.configuration.catalog.devices.push({
      ...structuredClone(base),
      id: 'twin',
      display: { label: 'Gemelo', icon: 'mdi:lightbulb' },
      bindings: { entityId: null, primaryAction: null, advancedPopupId: null },
    });
    window.testHarness.card.setConfig(config);
    window.testHarness.card.hass = window.testHarness.hass;
  });
  await card(page).locator('.cluster').click();
  const list = page.getByRole('dialog', { name: 'Dispositivos en este lugar' });
  await expect(list.getByRole('button', { name: /Gemelo/ })).toBeVisible();
  await list.getByRole('button', { name: /Luz de prueba/ }).click();
  await expect(page.getByRole('dialog')).toContainText('Luz de prueba');
});
