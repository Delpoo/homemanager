import { test, expect } from '../browser/local-test.mjs';
import { openCardMenu } from '../browser/shell-helpers.mjs';
import { mkdir } from 'node:fs/promises';
import { openDeviceSections } from '../browser/device-picker-helpers.mjs';
const card = page => page.locator('homemanager-card');
const editor = page => card(page).locator('homemanager-editor');
const alerts = page => editor(page).locator('[data-module=rules]');
const ruleScreen = page => page.locator('homemanager-rules-editor');
const draft = page => page.evaluate(() => window.testHarness.card.getDraftConfiguration());
async function begin(page, label) {
  await openCardMenu(page);
  await card(page).getByRole('button', { name: 'Editar plano', exact: true }).click();
  await card(page)
    .getByRole('button', {
      name:
        label === 'Guardar dispositivo'
          ? /^(Guardar dispositivo|Listo)$/
          : label === 'Cerrar'
            ? /^(Cerrar|Volver)$/
            : label,
      exact: true,
    })
    .click();
  await openDeviceSections(page);
}
async function readable(host) {
  const text = await host.evaluate(host => {
    const out = [];
    function visit(root) {
      for (const node of root.querySelectorAll('*')) {
        if (!node.getClientRects().length || getComputedStyle(node).visibility === 'hidden') continue;
        for (const child of node.childNodes)
          if (child.nodeType === Node.TEXT_NODE && !['STYLE', 'SCRIPT', 'OPTION'].includes(node.tagName))
            out.push(child.textContent);
        if (node instanceof HTMLSelectElement) out.push(...[...node.selectedOptions].map(option => option.text));
        if (node.shadowRoot) visit(node.shadowRoot);
      }
    }
    visit(host.shadowRoot ?? host);
    return out.join(' ');
  });
  expect(text).not.toMatch(/_|\b(?:sensor|binary_sensor|light|switch)\.[a-z0-9_]+\b/);
}
test.beforeEach(async ({ page }) => {
  await page.goto('/tests/browser/fixtures/alerts.html');
  await page.waitForFunction(() => window.alertHarnessReady);
});
test('old plant notices move to the unified editor only on explicit save and undo restores them', async ({ page }) => {
  await begin(page, 'Planta de prueba');
  const before = await draft(page);
  await alerts(page).getByRole('button', { name: 'Abrir Reglas', exact: true }).click();
  const rules = ruleScreen(page);
  await rules.locator('[data-edit="legacy:plant:0"]').click();
  await rules.getByLabel('Menos de', { exact: true }).fill('0');
  await rules.getByLabel('Más de', { exact: true }).fill('90');
  await rules.getByLabel('Durante (minutos)', { exact: true }).fill('5');
  await readable(rules);
  await rules.getByRole('button', { name: 'Guardar regla', exact: true }).click();
  let config = await draft(page);
  expect(config.catalog.devices.find(d => d.id === 'plant').display.alerts).toHaveLength(1);
  expect(config.rules[0]).toMatchObject({ below: 0, above: 90, forMinutes: 5, level: 'warning', symbols: ['plant'] });
  await rules.getByRole('button', { name: 'Deshacer regla', exact: true }).click();
  config = await draft(page);
  expect(config.catalog.devices.find(d => d.id === 'plant')).toEqual(
    before.catalog.devices.find(d => d.id === 'plant'),
  );
});
test('presence highlighting and counting remain independent with no numeric defaults', async ({ page }) => {
  await expect(card(page).locator('[data-id=presence]')).toHaveAttribute('data-highlight', 'false');
  await begin(page, 'Puerta de prueba');
  await alerts(page).getByRole('button', { name: 'Abrir Reglas', exact: true }).click();
  const rules = ruleScreen(page);
  // One row per base rule type (#60): choose which symbols are highlighted.
  await rules.locator('[data-edit="base:highlight"]').click();
  await rules.locator('input[data-check-field="base-devices"][value="presence"]').check();
  await rules.locator('[data-base-apply]').click();
  let saved = (await draft(page)).catalog.devices.find(d => d.id === 'presence');
  expect(saved.display.highlight).toBe(true);
  expect(saved.display.alerts).toBeUndefined();
  await rules.getByRole('button', { name: '+ Nueva regla', exact: true }).click();
  await rules.getByLabel('Nombre de la regla', { exact: true }).fill('Apertura de prueba');
  await rules.locator('input[data-check-field=sources][value="binary_sensor.test_door"]').check();
  await rules.locator('[name="symbol:presence"]').check();
  await rules.getByRole('button', { name: 'Guardar regla', exact: true }).click();
  const rule = (await draft(page)).rules[0];
  expect(rule).toMatchObject({ state: 'on', level: 'warning', symbols: ['presence'] });
  expect(rule.below).toBeUndefined();
  expect(rule.above).toBeUndefined();
});
test('all alert surfaces agree; unknown data cannot claim a resolution', async ({ page }) => {
  await expect(card(page).locator('.alert-pill')).toHaveText('4');
  await expect(card(page).locator('[data-id=plant] .symbol-badge')).toHaveText('2');
  const cluster = card(page).getByRole('button', { name: /dispositivos:.*Planta de prueba/ });
  if (await cluster.count()) await cluster.click();
  await card(page).getByRole('button', { name: 'Planta de prueba', exact: true }).click();
  const insights = card(page).locator('homemanager-insights');
  await expect(insights).toContainText('Humedad del suelo · Lectura por debajo del límite');
  await expect(insights.locator('.k-notice.warning')).toHaveCount(1);
  await expect(insights.locator('.k-notice.alert')).toHaveCount(1);
  await readable(insights);
  await page.evaluate(() =>
    window.testHarness.updateState('sensor.test_soil', 'unknown', { device_class: 'moisture' }),
  );
  await expect(card(page).locator('.alert-pill')).toHaveText('3');
  expect(
    await page.evaluate(() => window.testHarness.card.activity.entries.some(entry => entry.type === 'resolved')),
  ).toBe(false);
});

for (const dark of [false, true])
  test(`CP4 ${dark ? 'dark' : 'light'}: every category and alert surface follows the shared design`, async ({
    page,
  }, info) => {
    test.setTimeout(30000);
    await page.setViewportSize(
      info.project.name === 'mobile' ? { width: 390, height: 844 } : { width: 1440, height: 900 },
    );
    await page.evaluate(dark => {
      const { hass, card } = window.testHarness;
      hass.themes = { darkMode: dark };
      card.hass = { ...hass };
    }, dark);
    await expect(card(page)).toHaveAttribute('data-theme', dark ? 'dark' : 'light');
    const folder = process.env.HM_CAPTURE_CP4 ? 'docs/evidence/0.9-cp4' : info.outputPath('visuals');
    await mkdir(folder, { recursive: true });
    const shot = async name => {
      await page.screenshot({
        path: `${folder}/${info.project.name}-${dark ? 'dark' : 'light'}-${name}.png`,
        scale: 'css',
        animations: 'disabled',
      });
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        info.project.name === 'mobile' ? 390 : 1440,
      );
    };
    const insights = card(page).locator('homemanager-insights');
    if (info.project.name === 'mobile') await insights.getByRole('button', { name: 'Mostrar Ahora' }).click();
    await expect(insights).toContainText('Humedad del suelo · Lectura por debajo del límite');
    await readable(insights);
    await shot('now');
    await insights.locator('[data-key=plant][data-action=device]').first().click();
    await expect(insights.getByRole('heading', { name: 'Planta de prueba', exact: true })).toBeVisible();
    await readable(insights);
    await shot('device');
    await insights.getByRole('button', { name: /^(Cerrar|Volver)$/, exact: true }).click();
    await card(page).getByRole('button', { name: 'Alertas', exact: true }).click();
    await expect(card(page).locator('homemanager-task-screen[open]')).toBeVisible();
    await shot('alerts');
    await card(page).locator('homemanager-task-screen[open] .task-back').click();
    await begin(page, 'Planta de prueba');
    for (const [category, slug] of [
      ['Planta', 'plant'],
      ['Medidor', 'meter'],
      ['Alerta', 'alarm'],
      ['Presencia y aperturas', 'presence'],
    ]) {
      // Each category uses its own fictional device and associated reading.
      if (slug !== 'plant') {
        await editor(page)
          .getByRole('button', { name: /^(Cerrar|Volver)$/, exact: true })
          .click();
        await card(page).getByRole('button', { name: 'Encuadrar todo', exact: true }).click();
        await card(page)
          .getByRole('button', {
            name: slug === 'meter' ? 'Potencia de prueba' : slug === 'alarm' ? 'Fuga Cocina' : 'Puerta de prueba',
            exact: true,
          })
          .click();
      }
      await openDeviceSections(page);
      await expect(alerts(page)).toBeVisible();
      await alerts(page).scrollIntoViewIfNeeded();
      await readable(alerts(page));
      await shot(`inspector-${slug}`);
      if (slug === 'plant') {
        await alerts(page).getByRole('button', { name: 'Abrir Reglas', exact: true }).click();
        await ruleScreen(page).locator('[data-edit="legacy:plant:0"]').click();
        await shot('inspector-rule');
        await page.evaluate(() => window.testHarness.card.editor.closeSurface());
        await card(page).getByRole('button', { name: 'Planta de prueba', exact: true }).click();
      }
    }
    await page.goto('/docs/vision-mockup.html');
    if (dark) await page.locator('body').evaluate(node => node.classList.add('dark'));
    for (const [selector, name] of [
      ['.inspectors', 'reference-categories'],
      ['#s8', 'reference-device'],
      ['#s1', 'reference-now'],
      ['#s6', 'reference-components'],
    ]) {
      await page.locator(selector).evaluate(node => node.scrollIntoView({ block: 'start' }));
      await shot(name);
    }
  });
