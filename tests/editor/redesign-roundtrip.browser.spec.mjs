import { showSection, openFirstSection, openSettings } from '../browser/shell-helpers.mjs';
import { test, expect } from '../browser/local-test.mjs';
import { openCardMenu } from '../browser/shell-helpers.mjs';

test('a legacy plan keeps its data after module, gesture, rule and icon edits, save and reload', async ({ page }) => {
  await page.goto('/tests/browser/fixtures/card.html');
  await page.waitForFunction(() => window.testHarnessReady);
  await page.evaluate(() => {
    const h = window.testHarness;
    const config = structuredClone(h.original);
    config.configuration.catalog.devices[0].display.category = 'switch';
    config.configuration.catalog.devices[0].display.archetype = 'actuator';
    config.configuration.catalog.devices[2].display.alerts = [
      { reading: 'sensor.synthetic_temperature', below: 15, level: 'warning' },
    ];
    h.mutateRemote(dashboard => {
      dashboard.views[0].cards[0] = config;
    });
    h.card.setConfig(config);
    h.card.hass = { ...h.hass };
  });
  const card = page.locator('homemanager-card');
  const editor = card.locator('homemanager-editor');
  await openCardMenu(page);
  await card.getByRole('button', { name: 'Editar plano', exact: true }).click();
  const before = await card.evaluate(c => c.getDraftConfiguration());
  await card.locator('[data-id=synthetic-light] .primary').click();
  await editor.locator('[data-command=module-add][data-module-id=indicators]').click();
  // 0.13: the infrastructure switch; turned off again it names the layer explicitly.
  await editor.locator('[data-infra]').check();
  await editor.locator('[data-infra]').uncheck();
  await editor.locator('#module-gestures > summary').click();
  await editor.locator('[data-gesture=tap]').selectOption('@screen');
  await editor.locator('[data-gesture=hold]').selectOption('@none');
  const picker = editor.locator('homemanager-icon-picker[data-device-icon]');
  await picker.locator('.trigger').click();
  await picker.getByRole('searchbox').fill('rocket-launch');
  await picker.getByRole('option', { name: 'rocket-launch', exact: true }).click();
  await editor.getByLabel('Color libre', { exact: true }).fill('#7655a6');
  await editor.getByLabel('Color libre', { exact: true }).dispatchEvent('change');
  await editor.getByRole('button', { name: 'Listo', exact: true }).click();
  // Rules live only in Settings since #70.
  await openSettings(card);
  await openFirstSection(page);
  await showSection(editor, 'rules-section');
  const rules = card.locator('homemanager-rules-editor');
  await rules.getByRole('button', { name: '+ Nueva regla', exact: true }).click();
  await rules.getByLabel('Nombre de la regla', { exact: true }).fill('Temperatura de prueba alta');
  await rules.locator('input[data-check-field=sources][value="sensor.synthetic_temperature"]').check();
  await rules.getByLabel('Más de', { exact: true }).fill('27');
  await rules.getByRole('button', { name: 'Guardar regla', exact: true }).click();
  await editor.getByRole('button', { name: 'Volver', exact: true }).click();
  await card.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
  await expect(card.getByRole('button', { name: 'Guardar cambios', exact: true })).toBeDisabled();
  const saved = await page.evaluate(() => window.testHarness.config.configuration);
  const light = saved.catalog.devices.find(d => d.id === 'synthetic-light');
  expect(light.display).toMatchObject({
    category: 'switch',
    archetype: 'actuator',
    icon: 'mdi:rocket-launch',
    color: '#7655a6',
    layer: 'controls',
  });
  expect(light.display.modules).toContain('indicators');
  expect(light.bindings).toMatchObject({ tap: { action: 'screen' }, hold: { action: 'none' } });
  // Choosing a screen replaces the old tap shortcut; its action remains in the catalog.
  expect(light.bindings.primaryAction).toBeNull();
  for (const key of ['entityId', 'advancedPopupId'])
    expect(light.bindings[key]).toEqual(before.catalog.devices[0].bindings[key]);
  expect(light.bindings.controls).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ steps: [{ actionId: before.catalog.devices[0].bindings.primaryAction }] }),
    ]),
  );
  for (const device of before.catalog.devices.slice(1))
    expect(saved.catalog.devices.find(d => d.id === device.id)).toEqual(device);
  for (const key of ['actions', 'panels', 'rooms', 'architecture', 'stateSources'])
    expect(saved[key]).toEqual(before[key]);
  expect(saved.rules).toHaveLength(1);
  expect(saved.rules[0]).toMatchObject({ name: 'Temperatura de prueba alta', above: 27, symbols: [], enabled: true });
  expect(await page.evaluate(() => window.testHarness.dashboard.views[0].cards[1])).toEqual({
    type: 'markdown',
    content: 'Synthetic unrelated card',
  });
  expect(await page.evaluate(() => window.testHarness.calls)).toEqual([]);
  await page.reload();
  await page.waitForFunction(() => window.testHarnessReady);
  expect(await card.evaluate(c => c.getConfiguration())).toEqual(saved);
  await expect(card.locator('[data-id=synthetic-light] .primary')).toBeVisible();
  await card.locator('[data-id=synthetic-light] .primary').click();
  await expect(card.locator('homemanager-insights')).toBeVisible();
  expect(await page.evaluate(() => window.testHarness.calls)).toEqual([]);
});
