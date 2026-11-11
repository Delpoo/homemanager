import { openSettings } from '../browser/shell-helpers.mjs';
import { test, expect } from '../browser/local-test.mjs';

// 0.13 Automations, as in the approved mockup. They are saved through Home Assistant's
// automation editor API, faked here with invented data.
const card = page => page.locator('homemanager-card');
const editor = page => card(page).locator('homemanager-editor');
const draft = page => page.evaluate(() => window.testHarness.card.getDraftConfiguration());

/** HA's REST helper for automations, and the notifications subscription, in memory. */
async function fakeAutomations(page) {
  await page.evaluate(() => {
    const { hass, card } = window.testHarness;
    const store = (window.automationStore = {});
    window.apiCalls = [];
    window.pushNotifications = () => {};
    hass.callApi = async (method, path, data) => {
      window.apiCalls.push({ method, path, data: data && structuredClone(data) });
      const id = decodeURIComponent(path.split('/').pop());
      const entity = config => `automation.${config.alias.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;
      if (method === 'POST') {
        store[id] = structuredClone(data);
        for (const [key, value] of Object.entries(hass.states))
          if (key.startsWith('automation.') && value.attributes.id === id) delete hass.states[key];
        hass.states[entity(data)] = { state: 'on', attributes: { id, friendly_name: data.alias }, last_updated: '' };
        card.hass = { ...hass };
        return { result: 'ok' };
      }
      if (method === 'DELETE') {
        delete store[id];
        for (const [key, value] of Object.entries(hass.states))
          if (key.startsWith('automation.') && value.attributes.id === id) delete hass.states[key];
        card.hass = { ...hass };
        return { result: 'ok' };
      }
      if (!store[id]) throw new Error('not found');
      return structuredClone(store[id]);
    };
    hass.connection.subscribeMessage = async (callback, message) => {
      if (message.type === 'persistent_notification/subscribe') {
        window.pushNotifications = notifications => callback({ type: 'added', notifications });
        callback({ type: 'current', notifications: {} });
      }
      return () => {};
    };
    hass.states['sensor.aire_demo_power'] = {
      state: '420',
      attributes: { friendly_name: 'Aire demo potencia', unit_of_measurement: 'W', device_class: 'power' },
    };
    card.hass = { ...hass };
  });
}

test.beforeEach(async ({ page }) => {
  await page.goto('/tests/browser/fixtures/card.html');
  await page.waitForFunction(() => window.testHarnessReady);
  await fakeAutomations(page);
});

test('an automation is built in four steps and saved as a Home Assistant automation', async ({ page }) => {
  await openSettings(page);
  const menu = editor(page).locator('.nb-row[data-settings="automations-section"]');
  await expect(menu).toBeVisible();
  await menu.click();
  const section = editor(page).locator('homemanager-automations-editor');
  await section.getByRole('button', { name: 'Nueva automatización' }).click();
  await section.getByRole('textbox', { name: 'Nombre' }).fill('Dormir');
  // When: every day at a time.
  await section.getByRole('button', { name: 'Agregar cuándo' }).click();
  await section.getByRole('menuitem', { name: 'A una hora' }).click();
  await section.getByLabel('Hora', { exact: true }).fill('23:15');
  // Do: turn the light off.
  await section.getByRole('button', { name: 'Agregar qué hacer' }).click();
  await section
    .getByRole('checkbox', { name: /Synthetic light.*Apagar|Apagar/ })
    .first()
    .check();
  await expect(section.locator('#g-do .ln')).toHaveCount(1);
  // Check with the power reading, and an alert if it fails.
  await section.getByRole('button', { name: 'Comprobar con el consumo' }).click();
  await expect(section.locator('#g-check')).toContainText('Medidor sin datos');
  await section.locator('[data-sensor="0"]').selectOption('sensor.aire_demo_power');
  await section.getByRole('button', { name: 'Avisar si falla' }).click();
  await section.getByRole('textbox', { name: 'Mensaje de la alerta' }).fill('Sigue prendida');
  // ★: a button in Now.
  await section.getByRole('button', { name: 'Poner en la pantalla principal' }).click();
  await section.getByRole('button', { name: 'Listo' }).click();
  await expect(section.locator('.li')).toHaveCount(1);
  const saved = await page.evaluate(() => window.apiCalls.find(call => call.method === 'POST'));
  expect(saved.path).toBe('config/automation/config/homemanager_dormir');
  expect(saved.data.triggers).toEqual([{ trigger: 'time', at: '23:15:00' }]);
  expect(saved.data.actions[0].repeat.sequence[0].action).toBe('homeassistant.turn_off');
  expect(saved.data.actions[1].then[0].data.message).toBe('Sigue prendida');
  expect(saved.data.variables.homemanager.name).toBe('Dormir');
  expect((await draft(page)).pinnedAutomations).toEqual([{ id: 'homemanager_dormir', icon: 'mdi:robot-outline' }]);
  // The list shows how it starts, its ★ and its switch.
  const row = section.locator('.li').first();
  await expect(row).toContainText('23:15');
  await expect(row.getByRole('button', { name: 'Está en la pantalla principal' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await row.getByRole('switch').uncheck();
  await expect
    .poll(() => page.evaluate(() => window.testHarness.calls.at(-1)))
    .toEqual({ domain: 'automation', service: 'turn_off', data: {}, target: { entity_id: 'automation.dormir' } });
  // Opened again, it reads back what was saved; deleting asks first and removes it from HA.
  await row.locator('.t').click();
  await expect(section.getByRole('textbox', { name: 'Nombre' })).toHaveValue('Dormir');
  await expect(section.locator('#g-do .ln')).toHaveCount(1);
  await section.getByRole('button', { name: 'Borrar' }).click();
  await section.locator('dialog [data-action=confirm], dialog button:has-text("Eliminar")').first().click();
  // Back on the (now empty) list once HA said it was deleted.
  await expect(section.getByRole('button', { name: 'Nueva automatización' })).toBeVisible();
  await expect(section.locator('.li')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => Object.keys(window.automationStore))).toEqual([]);
  expect((await draft(page)).pinnedAutomations).toBeUndefined();
});

test('nothing to do or no way to start is said before saving', async ({ page }) => {
  await openSettings(page, 'automations-section');
  const section = editor(page).locator('homemanager-automations-editor');
  await section.getByRole('button', { name: 'Nueva automatización' }).click();
  await section.getByRole('textbox', { name: 'Nombre' }).fill('Vacía');
  await section.getByRole('button', { name: 'Listo' }).click();
  await expect(section.getByRole('alert')).toHaveText('Elegí qué hacer.');
  await section.getByRole('button', { name: 'Agregar qué hacer' }).click();
  // Each choice says what it acts on, once.
  const names = await section.locator('.check-row span').allTextContents();
  expect(names.length).toBeGreaterThan(0);
  expect(new Set(names).size).toBe(names.length);
  await section.getByRole('checkbox').first().check();
  await section.getByRole('button', { name: 'Listo' }).click();
  await expect(section.getByRole('alert')).toContainText('Elegí cuándo');
  expect(await page.evaluate(() => window.apiCalls.length)).toBe(0);
});

test('a ★ automation is a button on top of Now, and a failure is an alert there', async ({ page }) => {
  await page.evaluate(async () => {
    const { card, hass } = window.testHarness;
    await hass.callApi('POST', 'config/automation/config/homemanager_salir', {
      id: 'homemanager_salir',
      alias: 'Salir',
      variables: {
        homemanager: {
          name: 'Salir',
          icon: 'mdi:home-export-outline',
          triggers: [],
          steps: [],
          check: null,
          fail: null,
        },
      },
    });
    const next = structuredClone(card.getDraftConfiguration());
    next.pinnedAutomations = [{ id: 'homemanager_salir', icon: 'mdi:home-export-outline' }];
    card.change(next);
  });
  const now = page.locator('homemanager-insights');
  const handle = now.locator('.insights-handle');
  if (await handle.isVisible()) await handle.click();
  const button = now.getByRole('button', { name: 'Salir', exact: true });
  await expect(button).toBeVisible();
  await button.click();
  await expect
    .poll(() => page.evaluate(() => window.testHarness.calls.at(-1)))
    .toEqual({
      domain: 'automation',
      service: 'trigger',
      data: { skip_condition: true },
      target: { entity_id: 'automation.salir' },
    });
  // The automation's failure, left as an HA notification, shows as an alert in Now.
  await page.evaluate(() =>
    window.pushNotifications({
      'homemanager:fail:homemanager_salir:synthetic-light': {
        notification_id: 'homemanager:fail:homemanager_salir:synthetic-light',
        title: 'Salir',
        message: 'La luz sigue prendida',
      },
    }),
  );
  await expect(now).toContainText('Salir', { timeout: 5000 });
  await expect(now.locator('.now-row[data-tone=alert]')).toHaveCount(1, { timeout: 5000 });
});
