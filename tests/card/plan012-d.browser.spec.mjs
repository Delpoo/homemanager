// Plan 0.12, lote D (#96, #97, #73): shortcuts to device programs, gestures that leave the plan,
// and one designer that says what it designs. Fictional robot and links only.
import { test, expect } from '../browser/local-test.mjs';

const card = page => page.locator('homemanager-card');
const editor = page => card(page).locator('homemanager-editor');
const draft = page => page.evaluate(() => window.testHarness.card.getDraftConfiguration());

const robotHass = () => {
  const { hass, card } = window.testHarness;
  const stamp = new Date().toISOString();
  const state = (value, attributes) => ({ state: value, attributes, last_updated: stamp, last_changed: stamp });
  Object.assign(hass.states, {
    'vacuum.robot_ficticio': state('docked', { friendly_name: 'Robot ficticio' }),
    'button.robot_ficticio_profundo': state('unknown', { friendly_name: 'Profundo' }),
    'button.robot_ficticio_estandar': state('unknown', { friendly_name: 'Estándar' }),
    'select.robot_ficticio_fregado': state('medio', { friendly_name: 'Fregado', options: ['bajo', 'alto'] }),
  });
  hass.entities = {
    ...(hass.entities ?? {}),
    ...Object.fromEntries(
      [
        'vacuum.robot_ficticio',
        'button.robot_ficticio_profundo',
        'button.robot_ficticio_estandar',
        'select.robot_ficticio_fregado',
      ].map(id => [id, { device_id: 'robot-ficticio' }]),
    ),
  };
  hass.devices = { ...(hass.devices ?? {}), 'robot-ficticio': { name: 'Robot ficticio' } };
  hass.services = { ...hass.services, button: { press: {} }, vacuum: { return_to_base: {} } };
  card.hass = { ...hass };
};
test.beforeEach(async ({ page }) => {
  await page.goto('/tests/browser/fixtures/card.html');
  await page.waitForFunction(() => window.testHarnessReady);
  // A fictional robot vacuum with two programs and a mode, linked to one symbol of the saved plan.
  await page.evaluate(() =>
    window.testHarness.mutateRemote(dashboard => {
      const device = dashboard.views[0].cards[0].configuration.catalog.devices.find(d => d.id === 'synthetic-sensor');
      device.bindings = { ...device.bindings, entityId: 'vacuum.robot_ficticio', deviceId: 'robot-ficticio' };
    }),
  );
  await page.reload();
  await page.waitForFunction(() => window.testHarnessReady);
  await page.evaluate(robotHass);
  await card(page).locator('.hm-tools [data-command=edit]').click();
  await page.waitForTimeout(500);
});

test('a program becomes a shortcut next to the symbol without designing a control (#96)', async ({ page }) => {
  await card(page).locator('[data-id="synthetic-sensor"] .primary').click();
  await editor(page).locator('.module-menu > summary').click();
  const add = editor(page).locator('[data-command=module-add][data-module-id=pinned]');
  if (await add.isEnabled()) await add.click();
  await editor(page).locator('#module-pinned > summary').click();
  await expect(editor(page).locator('.shortcut-row')).toContainText(['Estándar', 'Profundo']);
  await editor(page)
    .locator('.shortcut-row', { hasText: 'Profundo' })
    .getByRole('button', { name: 'Atajo', exact: true })
    .click();
  const robot = (await draft(page)).catalog.devices.find(d => d.id === 'synthetic-sensor');
  expect(robot.display.pinned).toHaveLength(1);
  const control = robot.bindings.controls.find(c => c.id === robot.display.pinned[0]);
  expect((await draft(page)).actions[control.steps[0].actionId]).toEqual({
    domain: 'button',
    service: 'press',
    target: { entity_id: 'button.robot_ficticio_profundo' },
  });
  await card(page).getByRole('button', { name: 'Guardar cambios', exact: true }).click();
  await card(page).getByRole('button', { name: 'Salir de edición', exact: true }).click();
  await card(page).locator('[data-id="synthetic-sensor"] .pins button').first().click();
  await expect
    .poll(() => page.evaluate(() => window.testHarness.calls.map(c => `${c.domain}.${c.service}`)))
    .toContain('button.press');
});

test('a gesture can open the Home Assistant sheet, and a menu offers several choices (#97)', async ({ page }) => {
  await card(page).locator('[data-id="synthetic-sensor"] .primary').click();
  await editor(page).locator('#module-gestures > summary').click();
  await editor(page).locator('[data-gesture=tap]').selectOption('@more-info');
  await editor(page).locator('[data-gesture=hold]').selectOption('@choose');
  await expect(editor(page).locator('.choose-row')).toHaveCount(2);
  await editor(page)
    .getByRole('button', { name: /^(Listo|Guardar dispositivo)$/ })
    .click();
  const robot = (await draft(page)).catalog.devices.find(d => d.id === 'synthetic-sensor');
  expect(robot.bindings.tap).toEqual({ action: 'more-info' });
  expect(robot.bindings.hold.action).toBe('choose');
  await card(page).getByRole('button', { name: 'Guardar cambios', exact: true }).click();
  await card(page).getByRole('button', { name: 'Salir de edición', exact: true }).click();
  const opened = page.evaluate(
    () =>
      new Promise(resolve =>
        window.testHarness.card.addEventListener('hass-more-info', event => resolve(event.detail.entityId), {
          once: true,
        }),
      ),
  );
  await card(page).locator('[data-id="synthetic-sensor"] .primary').click();
  expect(await opened).toBe('vacuum.robot_ficticio');
  await card(page).locator('[data-id="synthetic-sensor"] .primary').click({ button: 'right' });
});

test('the designer always says what it designs, and Settings never shows an empty designer (#73)', async ({ page }) => {
  await card(page).locator('[data-id="synthetic-light"] .primary').click();
  await editor(page).locator('#device-controls-section > summary').click();
  const design = editor(page).locator('[data-command=design-open]');
  if (await design.count()) {
    await design.first().click();
    await expect(editor(page).locator('.designer-title')).toContainText('Diseñando el control de');
  }
  await expect(editor(page).locator('[data-settings="designer-section"]')).toHaveCount(0);
});
