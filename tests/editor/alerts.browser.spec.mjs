import { test, expect } from '@playwright/test';
import { openCardMenu } from '../browser/shell-helpers.mjs';
import { mkdir } from 'node:fs/promises';
const card = page => page.locator('homemanager-card');
const editor = page => card(page).locator('homemanager-editor');
const alerts = page => editor(page).locator('homemanager-alert-editor');
const draft = page => page.evaluate(() => window.testHarness.card.getDraftConfiguration());
async function begin(page, label) {
  await openCardMenu(page);
  await card(page).getByRole('button', { name: 'Editar plano', exact: true }).click();
  await card(page).getByRole('button', { name: label, exact: true }).click();
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
    visit(host.shadowRoot);
    return out.join(' ');
  });
  expect(text).not.toMatch(/_|\b(?:sensor|binary_sensor|light|switch)\.[a-z0-9_]+\b/);
}
test.beforeEach(async ({ page }) => {
  await page.goto('/tests/browser/fixtures/alerts.html');
  await page.waitForFunction(() => window.alertHarnessReady);
});
test('plant rules are explicit, editable, preserved across categories and undone as one draft step', async ({
  page,
}) => {
  await begin(page, 'Planta de prueba');
  const rules = alerts(page);
  await expect(rules.getByRole('switch', { name: 'Humedad del suelo', exact: true })).toBeChecked();
  await expect(rules.getByRole('switch', { name: 'Luz', exact: true })).not.toBeChecked();
  await expect(rules).toContainText('menos de 800 lx · durante 3 días · aviso');
  await rules.getByRole('button', { name: 'Editar aviso de Humedad del suelo', exact: true }).click();
  await rules.locator('[data-rule="0"]').getByLabel('Menos de', { exact: true }).fill('0');
  await rules.locator('[data-rule="0"]').getByLabel('Más de', { exact: true }).fill('90');
  await rules.locator('[data-rule="0"]').getByLabel('Durante (minutos)', { exact: true }).fill('5');
  await editor(page).getByRole('radio', { name: 'Interruptor', exact: true }).check();
  await expect(rules).toBeHidden();
  await editor(page).getByRole('radio', { name: 'Planta', exact: true }).check();
  await expect(rules.locator('[data-rule="0"]').getByLabel('Menos de', { exact: true })).toHaveValue('0');
  await readable(rules);
  const before = await draft(page);
  await card(page).getByRole('button', { name: 'Guardar dispositivo', exact: true }).click();
  const saved = (await draft(page)).catalog.devices.find(device => device.id === 'plant');
  expect(saved.display.alerts[0]).toEqual({
    reading: 'sensor.test_soil',
    below: 0,
    above: 90,
    forMinutes: 5,
    level: 'warning',
  });
  expect(saved.display.alerts).toHaveLength(2);
  await card(page).getByRole('button', { name: 'Deshacer', exact: true }).click();
  expect((await draft(page)).catalog.devices.find(device => device.id === 'plant')).toEqual(
    before.catalog.devices.find(device => device.id === 'plant'),
  );
});
test('presence highlighting and counting are independent, with no hidden enabled defaults', async ({ page }) => {
  await expect(card(page).locator('[data-id=presence]')).toHaveAttribute('data-highlight', 'false');
  await begin(page, 'Puerta de prueba');
  await expect(alerts(page).getByRole('switch', { name: 'Resaltar al detectar' })).not.toBeChecked();
  await expect(alerts(page).getByRole('switch', { name: 'Contar como alerta' })).not.toBeChecked();
  await alerts(page).getByRole('switch', { name: 'Resaltar al detectar' }).check();
  await card(page).getByRole('button', { name: 'Guardar dispositivo', exact: true }).click();
  let saved = (await draft(page)).catalog.devices.find(d => d.id === 'presence');
  expect(saved.display.highlight).toBe(true);
  expect(saved.display.alerts).toBeUndefined();
  await expect(card(page).locator('[data-id=presence]')).toHaveAttribute('data-highlight', 'true');
  await expect(card(page).locator('[data-id=presence] .symbol-badge')).toHaveCount(0);
  await card(page).getByRole('button', { name: 'Puerta de prueba', exact: true }).click();
  await alerts(page).getByRole('switch', { name: 'Contar como alerta' }).check();
  await alerts(page).getByLabel('Nivel', { exact: true }).selectOption('warning');
  await card(page).getByRole('button', { name: 'Guardar dispositivo', exact: true }).click();
  saved = (await draft(page)).catalog.devices.find(d => d.id === 'presence');
  expect(saved.display.alerts).toEqual([{ reading: 'binary_sensor.test_door', level: 'warning' }]);
  await expect(card(page).locator('[data-id=presence] .symbol-badge')).toHaveAttribute('data-level', 'warning');
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
    await insights.getByRole('button', { name: 'Cerrar', exact: true }).click();
    await card(page).getByRole('button', { name: 'Alertas', exact: true }).click();
    await expect(card(page).getByRole('dialog')).toBeVisible();
    await shot('alerts');
    await card(page).getByRole('dialog').getByRole('button', { name: 'Cerrar', exact: true }).click();
    await begin(page, 'Planta de prueba');
    for (const [category, slug] of [
      ['Planta', 'plant'],
      ['Medidor', 'meter'],
      ['Alerta', 'alarm'],
      ['Presencia y aperturas', 'presence'],
    ]) {
      // Each category uses its own fictional device and associated reading.
      if (slug !== 'plant') {
        await editor(page).getByRole('button', { name: 'Cerrar', exact: true }).click();
        await card(page).getByRole('button', { name: 'Encuadrar todo', exact: true }).click();
        await card(page)
          .getByRole('button', {
            name: slug === 'meter' ? 'Potencia de prueba' : slug === 'alarm' ? 'Fuga Cocina' : 'Puerta de prueba',
            exact: true,
          })
          .click();
      } else await editor(page).getByRole('radio', { name: category, exact: true }).check();
      await expect(alerts(page)).toBeVisible();
      await alerts(page).scrollIntoViewIfNeeded();
      await readable(alerts(page));
      await shot(`inspector-${slug}`);
      if (slug === 'plant') {
        await alerts(page).getByRole('button', { name: 'Editar aviso de Humedad del suelo', exact: true }).click();
        await alerts(page).locator('[data-rule="0"] .alert-fields').scrollIntoViewIfNeeded();
        await shot('inspector-rule');
        await alerts(page).getByRole('button', { name: 'Editar aviso de Humedad del suelo', exact: true }).click();
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
